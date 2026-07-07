/**
 * Pipeline execution engine (Phase 2):
 *
 * - Parse DAG (nodes + edges)
 * - Topological sort
 * - Execute nodes sequentially, passing output of n as input of n+1
 * - Write per-node state to pipeline_runs.node_states
 * - In v0: simulated agent invocation (returns mock output based on agentTemplateId).
 *         Real LLM invocation comes in Phase 3.
 */

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

// v0 simulated agent invocation.
// Phase 3 will replace with real LLM call using agentTemplateId + input.
async function invokeAgent(node: PipelineNode, input: unknown): Promise<{ output: unknown; tokensUsed: number }> {
  // Simulate work
  await new Promise(r => setTimeout(r, 50));
  return {
    output: {
      agent: node.label,
      agentTemplateId: node.agentTemplateId,
      receivedInput: input,
      producedAt: new Date().toISOString(),
      result: `[${node.label}] processed`,
    },
    tokensUsed: 100 + Math.floor(Math.random() * 200),
  };
}

export async function executePipeline(
  pipeline: Pipeline,
  runId: string,
  trigger: RunTrigger,
  onNodeUpdate: (nodeId: string, state: NodeState) => Promise<void>,
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
      const { output, tokensUsed } = await invokeAgent(node, currentInput);
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
