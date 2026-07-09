/**
 * Pipeline Bot Trigger (Phase 3 #2):
 * - When a Feishu bot (with agent_template_id) receives a message, find a matching pipeline
 * - If found, run it; return the last node's output text
 * - If not found / fails, return null (caller falls back to standard bot flow)
 *
 * Caches agentTemplateId → Pipeline[] on first lookup to avoid per-message DB hits.
 *
 * Level 5 #C: Trigger strategy for multi-pipeline agents.
 * - 'first' (default): run only pipelines[0]. Backwards compatible with Phase 3.
 * - 'all':             run every matching pipeline in parallel; return array (one entry per
 *                      pipeline, null if that pipeline failed).
 * - 'race':            run all in parallel; return the first one that finishes with
 *                      status='completed'. If all fail, return null.
 *
 * L10: 每条 run 都通过 pipeline-events.ts 把节点进度推到 WS(包含 botId / chatId),
 *      客户端 usePipelineProgress 可按 botId 过滤只听某个 bot 的进度。
 */
import { db } from '../db/index.js';
import { sql } from 'drizzle-orm';
import { executePipeline, type Pipeline, type RunResult } from './pipeline-engine.js';
import { broadcastPipelineProgress, computeNodeProgress } from '../api/pipeline-events.js';

export type TriggerStrategy = 'first' | 'all' | 'race';

export interface PipelineTriggerResult {
  output: string;
  runId: string;
}

/**
 * 可选的 WS 广播上下文。不传 = 不广播(保留 Phase 3 行为,避免给 cron 等非 bot 场景引入噪音)。
 */
export interface BotBroadcastContext {
  botId?: string;
  chatId?: string;
}

interface BotPipelineRow extends Record<string, unknown> {
  id: string;
  name: string;
  nodes: unknown;
  edges: unknown;
  timeout_ms: number | null;
  retry_policy: unknown;
}

// Module-level cache. Keyed by agentTemplateId. Cleared on process restart.
const pipelineCache = new Map<string, Pipeline[]>();

/** Clear the in-memory cache (test hook / future admin endpoint). */
export function invalidatePipelineCache(agentTemplateId?: string): void {
  if (agentTemplateId) pipelineCache.delete(agentTemplateId);
  else pipelineCache.clear();
}

/** Get current cache size (diagnostic / admin endpoint). */
export function getCacheSize(): number {
  return pipelineCache.size;
}

/**
 * Find all pipelines whose nodes reference the given agent template id.
 * Cached after first lookup.
 */
export async function findPipelinesForAgent(agentTemplateId: string): Promise<Pipeline[]> {
  if (!agentTemplateId) return [];
  const cached = pipelineCache.get(agentTemplateId);
  if (cached) return cached;

  // Use a jsonb containment query: nodes array contains at least one object with this agentTemplateId
  // agentTemplateId is stored as string in JSON; cast both sides to text for comparison
  const result = await db.execute<BotPipelineRow>(sql`
    SELECT id, name, nodes, edges, timeout_ms, retry_policy
    FROM agent_pipelines
    WHERE enabled = true
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(nodes) AS n
        WHERE (n->>'agentTemplateId')::text = ${agentTemplateId}
      )
    ORDER BY name ASC
  `);
  const rows: BotPipelineRow[] = Array.isArray(result)
    ? (result as unknown as BotPipelineRow[])
    : (result as unknown as { rows: BotPipelineRow[] }).rows ?? [];

  const pipelines: Pipeline[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    nodes: r.nodes as Pipeline['nodes'],
    edges: (r.edges ?? []) as Pipeline['edges'],
    ...(r.timeout_ms != null ? { timeoutMs: r.timeout_ms } : {}),
    ...(r.retry_policy != null ? { retryPolicy: r.retry_policy as Pipeline['retryPolicy'] } : {}),
  }));

  pipelineCache.set(agentTemplateId, pipelines);
  return pipelines;
}

/**
 * 计算并广播一次 pipeline_progress。失败仅日志,不抛出。
 */
function safeBroadcast(ev: Parameters<typeof broadcastPipelineProgress>[0]): void {
  try {
    broadcastPipelineProgress(ev);
  } catch (e) {
    console.warn('[pipeline-bot-trigger] broadcast failed:', (e as Error).message);
  }
}

/**
 * Run a single pipeline and convert the RunResult into a {output, runId} (or null on failure).
 * Extracted so 'first' / 'all' / 'race' strategies can share the same error-handling shape.
 *
 * If `broadcastCtx` is provided, each onNodeUpdate also broadcasts a pipeline_progress
 * event; a final event with the actual terminal status is broadcast when the run finishes.
 */
async function runOnePipeline(
  pipeline: Pipeline,
  message: string,
  runIdHint: string,
  tenantId: string | undefined,
  broadcastCtx?: BotBroadcastContext,
): Promise<PipelineTriggerResult | null> {
  // Per-run live state accumulator for accurate progress counts.
  // Only used when broadcastCtx is provided; populated on every node update.
  const liveStates: Record<string, Record<string, unknown>> = {};

  let result: RunResult;
  try {
    result = await executePipeline(
      pipeline,
      runIdHint,
      { triggeredBy: 'bot', initialInput: { message }, tenantId },
      async (nodeId, state) => {
        if (!broadcastCtx) return;
        // Update accumulator; emit a per-node progress event.
        liveStates[nodeId] = state as unknown as Record<string, unknown>;
        const totalNodes = pipeline.nodes.length;
        const { completedNodes, progress } = computeNodeProgress(
          liveStates as Record<string, { status?: string } | undefined>,
          totalNodes,
        );
        safeBroadcast({
          type: 'pipeline_progress',
          runId: runIdHint,
          pipelineId: pipeline.id,
          status: 'running',
          currentNodeId: nodeId,
          completedNodes,
          totalNodes,
          progress,
          botId: broadcastCtx.botId,
          chatId: broadcastCtx.chatId,
          triggeredBy: 'bot',
          ts: new Date().toISOString(),
          nodeStates: liveStates as Record<string, { status?: string }>,
        });
      },
      false, // useMockLlm
    );
  } catch {
    if (broadcastCtx) {
      const totalNodes = pipeline.nodes.length;
      const { completedNodes, progress } = computeNodeProgress(
        liveStates as Record<string, { status?: string } | undefined>,
        totalNodes,
      );
      safeBroadcast({
        type: 'pipeline_progress',
        runId: runIdHint,
        pipelineId: pipeline.id,
        status: 'failed',
        currentNodeId: null,
        completedNodes,
        totalNodes,
        progress,
        botId: broadcastCtx.botId,
        chatId: broadcastCtx.chatId,
        triggeredBy: 'bot',
        ts: new Date().toISOString(),
        nodeStates: liveStates as Record<string, { status?: string }>,
      });
    }
    return null;
  }

  if (broadcastCtx) {
    const totalNodes = pipeline.nodes.length;
    const { completedNodes, progress } = computeNodeProgress(
      result.nodeStates as unknown as Record<string, { status?: string } | undefined>,
      totalNodes,
    );
    safeBroadcast({
      type: 'pipeline_progress',
      runId: result.runId,
      pipelineId: pipeline.id,
      status: result.status,
      currentNodeId: null,
      completedNodes,
      totalNodes,
      progress,
      botId: broadcastCtx.botId,
      chatId: broadcastCtx.chatId,
      triggeredBy: 'bot',
      ts: new Date().toISOString(),
      nodeStates: (result.nodeStates as Record<string, { status?: string }>) ?? {},
    });
  }

  if (result.status !== 'completed') return null;

  const lastNodeId = pipeline.nodes[pipeline.nodes.length - 1]?.id;
  const lastOutput = lastNodeId
    ? (result.nodeStates[lastNodeId]?.output as { text?: string } | undefined)
    : undefined;
  const text = lastOutput?.text ?? '';
  return { output: text, runId: result.runId };
}

/**
 * Trigger pipelines for a bot message.
 *
 * - strategy 'first' (default): only run pipelines[0]. Returns the single result or null.
 *   Backwards compatible with Phase 3 callers (feishu-bot-starter).
 * - strategy 'all':             run every matching pipeline in parallel; returns one entry per
 *                               pipeline (null = that pipeline failed).
 * - strategy 'race':            run all in parallel; return the first pipeline that finishes
 *                               with status='completed'. Returns null if every pipeline failed.
 *
 * `tenantId` (optional) is forwarded into the RunTrigger so the pipeline's RAG lookups
 * and tool executions are scoped to the calling tenant. If omitted, executePipeline
 * falls back to 'system' (single-tenant behavior).
 *
 * `broadcast` (optional) — if provided, each pipeline run also broadcasts pipeline_progress
 * events to all WS clients with `botId` / `chatId` populated. Use this for bot-initiated
 * triggers so the admin UI can show real-time progress. Omit for cron/scheduled jobs.
 */
export async function triggerPipelineForBot(
  agentTemplateId: string,
  message: string,
  runIdHint: string,
  tenantId?: string,
  strategy?: 'first' | 'race',
  broadcast?: BotBroadcastContext,
): Promise<PipelineTriggerResult | null>;
export async function triggerPipelineForBot(
  agentTemplateId: string,
  message: string,
  runIdHint: string,
  tenantId: string | undefined,
  strategy: 'all',
  broadcast?: BotBroadcastContext,
): Promise<Array<PipelineTriggerResult | null>>;
export async function triggerPipelineForBot(
  agentTemplateId: string,
  message: string,
  runIdHint: string,
  tenantId?: string,
  strategy: TriggerStrategy = 'first',
  broadcast?: BotBroadcastContext,
): Promise<PipelineTriggerResult | null | Array<PipelineTriggerResult | null>> {
  const pipelines = await findPipelinesForAgent(agentTemplateId);
  if (pipelines.length === 0) {
    // 'all' must always return an array so callers can iterate uniformly;
    // for 'first' / 'race' a no-match bot run is null (no pipeline to run).
    return strategy === 'all' ? [] : null;
  }

  if (strategy === 'first') {
    return runOnePipeline(pipelines[0]!, message, runIdHint, tenantId, broadcast);
  }

  if (strategy === 'all') {
    return Promise.all(
      pipelines.map((p) => runOnePipeline(p, message, runIdHint, tenantId, broadcast)),
    );
  }

  // strategy === 'race': first pipeline to finish with status='completed' wins.
  // Promise.any waits for the first fulfilled promise; runOnePipeline rejections are
  // swallowed (returns null) and rejections are converted to null by us. So if every
  // pipeline fails, Promise.any throws AggregateError -> return null.
  try {
    return await Promise.any(
      pipelines.map((p) => runOnePipeline(p, message, runIdHint, tenantId, broadcast)),
    );
  } catch {
    return null;
  }
}
