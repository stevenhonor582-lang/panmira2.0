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
 */
import { db } from '../db/index.js';
import { sql } from 'drizzle-orm';
import { executePipeline, type Pipeline, type RunResult } from './pipeline-engine.js';

export type TriggerStrategy = 'first' | 'all' | 'race';

export interface PipelineTriggerResult {
  output: string;
  runId: string;
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
 * Run a single pipeline and convert the RunResult into a {output, runId} (or null on failure).
 * Extracted so 'first' / 'all' / 'race' strategies can share the same error-handling shape.
 */
async function runOnePipeline(
  pipeline: Pipeline,
  message: string,
  runIdHint: string,
  tenantId: string | undefined,
): Promise<PipelineTriggerResult | null> {
  let result: RunResult;
  try {
    result = await executePipeline(
      pipeline,
      runIdHint,
      { triggeredBy: 'bot', initialInput: { message }, tenantId },
      async () => { /* no-op progress reporter; UI sees it via API */ },
      false, // useMockLlm
    );
  } catch {
    return null;
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
 */
export async function triggerPipelineForBot(
  agentTemplateId: string,
  message: string,
  runIdHint: string,
  tenantId?: string,
  strategy?: 'first' | 'race',
): Promise<PipelineTriggerResult | null>;
export async function triggerPipelineForBot(
  agentTemplateId: string,
  message: string,
  runIdHint: string,
  tenantId: string | undefined,
  strategy: 'all',
): Promise<Array<PipelineTriggerResult | null>>;
export async function triggerPipelineForBot(
  agentTemplateId: string,
  message: string,
  runIdHint: string,
  tenantId?: string,
  strategy: TriggerStrategy = 'first',
): Promise<PipelineTriggerResult | null | Array<PipelineTriggerResult | null>> {
  const pipelines = await findPipelinesForAgent(agentTemplateId);
  if (pipelines.length === 0) {
    // 'all' must always return an array so callers can iterate uniformly;
    // for 'first' / 'race' a no-match bot run is null (no pipeline to run).
    return strategy === 'all' ? [] : null;
  }

  if (strategy === 'first') {
    return runOnePipeline(pipelines[0]!, message, runIdHint, tenantId);
  }

  if (strategy === 'all') {
    return Promise.all(
      pipelines.map((p) => runOnePipeline(p, message, runIdHint, tenantId)),
    );
  }

  // strategy === 'race': first pipeline to finish with status='completed' wins.
  // Promise.any waits for the first fulfilled promise; runOnePipeline rejections are
  // swallowed (returns null) and rejections are converted to null by us. So if every
  // pipeline fails, Promise.any throws AggregateError -> return null.
  try {
    return await Promise.any(
      pipelines.map((p) => runOnePipeline(p, message, runIdHint, tenantId)),
    );
  } catch {
    return null;
  }
}
