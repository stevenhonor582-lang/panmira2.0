/**
 * Pipeline Bot Trigger (Phase 3 #2):
 * - When a Feishu bot (with agent_template_id) receives a message, find a matching pipeline
 * - If found, run it; return the last node's output text
 * - If not found / fails, return null (caller falls back to standard bot flow)
 *
 * Caches agentTemplateId → Pipeline[] on first lookup to avoid per-message DB hits.
 */
import { db } from '../db/index.js';
import { sql } from 'drizzle-orm';
import { executePipeline, type Pipeline, type RunResult } from './pipeline-engine.js';

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
 * Trigger the first matching pipeline for this agent template. Returns the last node's output text
 * and the run id, or null if no pipeline / pipeline failed (caller should fall back).
 */
export async function triggerPipelineForBot(
  agentTemplateId: string,
  message: string,
  runIdHint: string,
): Promise<{ output: string; runId: string } | null> {
  const pipelines = await findPipelinesForAgent(agentTemplateId);
  if (pipelines.length === 0) return null;
  const pipeline = pipelines[0]!;

  let result: RunResult;
  try {
    result = await executePipeline(
      pipeline,
      runIdHint,
      { triggeredBy: 'bot', initialInput: { message } },
      async () => { /* no-op progress reporter; UI sees it via API */ },
      false, // useMockLlm
    );
  } catch {
    return null;
  }
  if (result.status !== 'completed') return null;

  // Extract last node's text output
  const lastNodeId = pipeline.nodes[pipeline.nodes.length - 1]?.id;
  const lastOutput = lastNodeId ? (result.nodeStates[lastNodeId]?.output as { text?: string } | undefined) : undefined;
  const text = lastOutput?.text ?? '';
  return { output: text, runId: result.runId };
}
