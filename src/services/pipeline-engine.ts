/**
 * Pipeline execution engine (Phase 2 + Phase 3 real LLM):
 *
 * - Parse DAG (nodes + edges)
 * - Topological sort
 * - Execute nodes sequentially, passing output of n as input of n+1
 * - Write per-node state to pipeline_runs.node_states
 * - Phase 3: Real LLM invocation via callLlm + agent template (systemPrompt / tools / KB refs)
 *   Follows the same pattern as src/api/routes/agent-run-routes.ts:23-166
 *   (Option C: complete single-agent invocation)
 */
import { db } from '../db/index.js';
import { agents, agentKnowledgeRefs } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import {
  callLlm,
  LlmCallError,
  type LlmTool,
  type LlmMessage,
} from './llm-client.js';
import { buildRagContext } from './rag-service.js';
import { executeTool } from './tool-executor.js';
import { recordTokenUsage } from './usage-tracker.js';

export interface PipelineNode {
  id: string;
  label: string;
  agentTemplateId: string;
  inputTemplate?: Record<string, unknown>;
  outputKey?: string;
  timeoutMs?: number;
}

export interface PipelineEdge {
  from: string;
  to: string;
  condition?: string;
}

export interface Pipeline {
  id: string;
  name: string;
  nodes: PipelineNode[];
  edges: PipelineEdge[];
  timeoutMs?: number;
  retryPolicy?: { maxAttempts?: number; backoffMs?: number };
}

export interface RunTrigger {
  triggeredBy: 'user' | 'bot' | 'cron' | 'event' | 'api';
  triggeredByRef?: string;
  initialInput?: Record<string, unknown>;
}

export interface NodeState {
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
  input?: unknown;
  output?: unknown;
  error?: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  tokensUsed?: number;
}

export interface RunResult {
  runId: string;
  status: 'running' | 'completed' | 'failed' | 'timeout' | 'cancelled';
  nodeStates: Record<string, NodeState>;
  result?: unknown;
  error?: string;
  durationMs: number;
}

export interface InvokeContext {
  useMockLlm: boolean;
  runId: string;
}

/** Serialize arbitrary input for LLM. Truncate huge payloads to keep LLM context sane. */
export function stringifyInput(input: unknown): string {
  if (input === null || input === undefined) return '';
  if (typeof input === 'string') return input;
  try {
    const s = JSON.stringify(input, null, 2);
    if (s.length > 8000) {
      return s.slice(0, 8000) + '\n...[truncated, full output in pipeline_runs.node_states]';
    }
    return s;
  } catch {
    return String(input);
  }
}

// Detect cycle using DFS (returns nodes in cycle if found, empty if acyclic)
function detectCycle(nodes: PipelineNode[], edges: PipelineEdge[]): string[] {
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) adj.get(e.from)?.push(e.to);

  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const n of nodes) color.set(n.id, WHITE);
  let cycle: string[] = [];

  function dfs(node: string, path: string[]): void {
    color.set(node, GRAY);
    path.push(node);
    for (const next of adj.get(node) ?? []) {
      if (color.get(next) === GRAY) {
        const idx = path.indexOf(next);
        cycle = path.slice(idx);
        cycle.push(next);
        return;
      }
      if (color.get(next) === WHITE) {
        dfs(next, path);
        if (cycle.length > 0) return;
      }
    }
    path.pop();
    color.set(node, BLACK);
  }

  for (const n of nodes) {
    if (color.get(n.id) === WHITE) {
      dfs(n.id, []);
      if (cycle.length > 0) break;
    }
  }
  return cycle;
}

// Topological sort using Kahn's algorithm
function topologicalSort(nodes: PipelineNode[], edges: PipelineEdge[]): PipelineNode[] {
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const n of nodes) { inDegree.set(n.id, 0); adj.set(n.id, []); }
  for (const e of edges) {
    adj.get(e.from)?.push(e.to);
    inDegree.set(e.to, (inDegree.get(e.to) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(id);
  }

  const sorted: PipelineNode[] = [];
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  while (queue.length > 0) {
    const id = queue.shift()!;
    const node = nodeMap.get(id);
    if (node) sorted.push(node);
    for (const next of adj.get(id) ?? []) {
      const newDeg = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, newDeg);
      if (newDeg === 0) queue.push(next);
    }
  }
  return sorted;
}

export function validatePipeline(p: Pipeline): { ok: true; order: PipelineNode[] } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!p.nodes || p.nodes.length === 0) errors.push('Pipeline must have at least one node');
  const nodeIds = new Set(p.nodes.map(n => n.id));
  for (const e of p.edges ?? []) {
    if (!nodeIds.has(e.from)) errors.push(`Edge from "${e.from}" references unknown node`);
    if (!nodeIds.has(e.to)) errors.push(`Edge to "${e.to}" references unknown node`);
  }
  for (const n of p.nodes) {
    if (!n.agentTemplateId) errors.push(`Node "${n.id}" missing agentTemplateId`);
  }
  if (errors.length > 0) return { ok: false, errors };
  const cycle = detectCycle(p.nodes, p.edges ?? []);
  if (cycle.length > 0) return { ok: false, errors: [`Cycle: ${cycle.join(' -> ')}`] };
  const order = topologicalSort(p.nodes, p.edges ?? []);
  return { ok: true, order };
}

type AgentRow = typeof agents.$inferSelect;

/**
 * Real LLM agent invocation (Phase 3).
 * Pattern: load agent template → optional RAG → callLlm → optional 1-hop tool_use loop.
 * Mirrors agent-run-routes.ts:23-166 for consistency.
 */
async function invokeRealAgent(
  agent: AgentRow,
  input: unknown,
  ctx: InvokeContext,
): Promise<{ output: unknown; tokensUsed: number }> {
  // 1. KB refs (RAG injection is conditional)
  const refs = await db.select().from(agentKnowledgeRefs)
    .where(eq(agentKnowledgeRefs.agentId, agent.id));

  // 2. Compose system prompt (RAG appended if refs present)
  let systemPrompt = agent.systemPrompt ?? '';
  if (refs.length > 0) {
    try {
      const rag = await buildRagContext({
        agentId: agent.id,
        userQuery: stringifyInput(input),
        userId: 'pipeline:' + ctx.runId,
        tenantId: 'system',
        topK: 5,
        mode: 'hybrid',
        minScore: 0,
      });
      if (rag?.prompt) {
        systemPrompt = systemPrompt ? `${systemPrompt}\n\n${rag.prompt}` : rag.prompt;
      }
    } catch (e) {
      console.warn(`[pipeline] RAG failed for agent ${agent.id}:`, (e as Error).message);
    }
  }

  // 3. Build messages + tools
  const messages: LlmMessage[] = [{ role: 'user', content: stringifyInput(input) }];
  const tools: LlmTool[] | undefined =
    Array.isArray(agent.tools) && (agent.tools as unknown[]).length > 0
      ? (agent.tools as LlmTool[])
      : undefined;

  // 4. First LLM call
  let result = await callLlm({
    system: systemPrompt,
    messages,
    tools,
    maxTokens: 1024,
  });

  // 5. tool_use 1-hop loop (matches agent-run-routes.ts:88-117)
  if (tools && result.toolUses.length > 0) {
    const toolCall = result.toolUses[0]!;
    let toolResult: { output: unknown; error?: string };
    try {
      toolResult = await executeTool(toolCall.name, toolCall.input, { agentId: agent.id, tenantId: 'system' });
    } catch (e) {
      throw new Error(`tool ${toolCall.name} failed: ${(e as Error).message}`);
    }
    messages.push({ role: 'assistant', content: result.text || '' });
    messages.push({
      role: 'user',
      content: `Tool ${toolCall.name} result: ${JSON.stringify(toolResult.output).slice(0, 2000)}`,
    });
    const follow = await callLlm({
      system: systemPrompt,
      messages,
      tools,
      maxTokens: 1024,
    });
    result = {
      ...result,
      text: follow.text,
      usage: {
        inputTokens: result.usage.inputTokens + follow.usage.inputTokens,
        outputTokens: result.usage.outputTokens + follow.usage.outputTokens,
        totalTokens: result.usage.totalTokens + follow.usage.totalTokens,
      },
      durationMs: result.durationMs + follow.durationMs,
    };
  }

  // 6. Token usage accounting (fire-and-forget; tenantId='system' is fine for pipeline runs)
  if (result.usage.totalTokens > 0) {
    try {
      recordTokenUsage('system', `pipeline:agent:${agent.id}`, result.usage.totalTokens);
    } catch {
      // never let accounting break execution
    }
  }

  return {
    output: {
      text: result.text,
      agentId: agent.id,
      model: result.model,
      provider: result.provider,
      toolCalls: result.toolUses,
    },
    tokensUsed: result.usage.totalTokens,
  };
}

/**
 * Phase 3 invokeAgent. Mock-mode short-circuits; real mode loads agent + delegates to invokeRealAgent.
 */
async function invokeAgent(
  node: PipelineNode,
  input: unknown,
  ctx: InvokeContext,
): Promise<{ output: unknown; tokensUsed: number }> {
  if (ctx.useMockLlm) {
    return {
      output: {
        text: `[MOCK ${node.label}] received ${stringifyInput(input).slice(0, 200)}`,
        agentId: node.agentTemplateId,
        mock: true,
      },
      tokensUsed: 0,
    };
  }

  const [agent] = await db
    .select()
    .from(agents)
    .where(eq(agents.id, node.agentTemplateId))
    .limit(1);
  if (!agent) {
    throw new Error(`agent ${node.agentTemplateId} not found`);
  }
  return await invokeRealAgent(agent, input, ctx);
}

export async function executePipeline(
  pipeline: Pipeline,
  runId: string,
  trigger: RunTrigger,
  onNodeUpdate: (nodeId: string, state: NodeState) => Promise<void>,
  useMockLlm: boolean = false,
): Promise<RunResult> {
  const startTime = Date.now();
  const validation = validatePipeline(pipeline);
  if (!validation.ok) {
    return {
      runId, status: 'failed', nodeStates: {},
      error: validation.errors.join('; '),
      durationMs: Date.now() - startTime,
    };
  }
  const order = validation.order;
  const states: Record<string, NodeState> = {};
  for (const n of order) states[n.id] = { status: 'pending' };

  // Build input map: for each node, its inputs come from outputs of its predecessors
  const predecessors = new Map<string, string[]>();
  for (const n of order) predecessors.set(n.id, []);
  for (const e of pipeline.edges ?? []) predecessors.get(e.to)?.push(e.from);

  const ctx: InvokeContext = { useMockLlm, runId };
  let currentInput: unknown = trigger.initialInput ?? { initial: true };
  let failed = false;

  for (const node of order) {
    if (failed) {
      states[node.id] = { status: 'skipped' };
      await onNodeUpdate(node.id, states[node.id]);
      continue;
    }

    // Compose input from predecessors' outputs
    const preds = predecessors.get(node.id) ?? [];
    if (preds.length > 0) {
      const composed: Record<string, unknown> = { ...(node.inputTemplate ?? {}) };
      for (const predId of preds) {
        const predOutput = states[predId]?.output;
        const outputKey = pipeline.nodes.find(n => n.id === predId)?.outputKey ?? predId;
        composed[outputKey] = predOutput;
      }
      currentInput = composed;
    } else {
      currentInput = { ...(node.inputTemplate ?? {}), ...(trigger.initialInput ?? {}) };
    }

    states[node.id] = { status: 'running', input: currentInput, startedAt: new Date().toISOString() };
    await onNodeUpdate(node.id, states[node.id]);

    const nodeStart = Date.now();
    try {
      const { output, tokensUsed } = await invokeAgent(node, currentInput, ctx);
      states[node.id] = {
        status: 'success',
        input: currentInput,
        output,
        startedAt: states[node.id].startedAt,
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - nodeStart,
        tokensUsed,
      };
      currentInput = output;
    } catch (e: unknown) {
      states[node.id] = {
        status: 'failed',
        input: currentInput,
        error: e instanceof Error ? e.message : String(e),
        startedAt: states[node.id].startedAt,
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - nodeStart,
      };
      failed = true;
    }
    await onNodeUpdate(node.id, states[node.id]);
  }

  return {
    runId,
    status: failed ? 'failed' : 'completed',
    nodeStates: states,
    result: failed ? undefined : currentInput,
    error: failed ? 'One or more nodes failed' : undefined,
    durationMs: Date.now() - startTime,
  };
}
