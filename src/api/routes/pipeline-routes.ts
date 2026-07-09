import type http from "node:http";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/index.js";
import { agentPipelines, pipelineRuns, agentMessages } from "../../db/schema.js";
import { jsonResponse, parseJsonBody } from "./helpers.js";
import { requireBearer, requireScopes } from "../oauth-middleware.js";
import { validatePipeline, executePipeline } from "../../services/pipeline-engine.js";
import { checkRateLimit, checkDailyTokenCap, recordTokenUsage } from "../../middleware/pipeline-rate-limit.js";
import { broadcastPipelineProgress, type PipelineProgressEvent } from "../pipeline-events.js";

/**
 * L8: retry policy schema. Exported for tests.
 * Bounds chosen to keep UI sensible (1-10 attempts) and prevent sleep storms (max 60s).
 */
export const RetryPolicySchema = z.object({
  maxAttempts: z.number().int().min(1).max(10).default(1),
  backoffMs: z.number().int().min(0).max(60_000).default(1000),
}).strict();

export type RetryPolicyInput = z.infer<typeof RetryPolicySchema>;

/** Validate + normalize retryPolicy payload; returns either { ok, value } or { ok: false, errors }. */
export function parseRetryPolicy(
  input: unknown,
): { ok: true; value: RetryPolicyInput } | { ok: false; errors: string[] } {
  if (input === undefined || input === null) {
    return { ok: true, value: { maxAttempts: 1, backoffMs: 1000 } };
  }
  const result = RetryPolicySchema.safeParse(input);
  if (result.success) return { ok: true, value: result.data };
  return {
    ok: false,
    errors: result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
  };
}

async function listPipelines(req: http.IncomingMessage, res: http.ServerResponse) {
  const ctx = await requireBearer(req, res); if (!ctx) return;
  const check = requireScopes(ctx, ["agent:read", "agent:admin"]);
  if (!check.ok) { jsonResponse(res, 403, { error: "insufficient_scope", missing: check.missing }); return; }
  const rows = await db.select().from(agentPipelines).orderBy(desc(agentPipelines.createdAt));
  jsonResponse(res, 200, { success: true, data: rows });
}

async function getPipeline(req: http.IncomingMessage, res: http.ServerResponse, id: string) {
  const ctx = await requireBearer(req, res); if (!ctx) return;
  const check = requireScopes(ctx, ["agent:read", "agent:admin"]);
  if (!check.ok) { jsonResponse(res, 403, { error: "insufficient_scope", missing: check.missing }); return; }
  const rows = await db.select().from(agentPipelines).where(eq(agentPipelines.id, id)).limit(1);
  if (rows.length === 0) { jsonResponse(res, 404, { error: "pipeline_not_found" }); return; }
  jsonResponse(res, 200, { success: true, data: rows[0] });
}

async function createPipeline(req: http.IncomingMessage, res: http.ServerResponse) {
  const ctx = await requireBearer(req, res); if (!ctx) return;
  const check = requireScopes(ctx, ["agent:admin"]);
  if (!check.ok) { jsonResponse(res, 403, { error: "insufficient_scope", missing: check.missing }); return; }
  const body = await parseJsonBody(req);
  const name = body.name, description = body.description;
  const nodes = body.nodes, edges = body.edges || [];
  const triggerType = body.triggerType || "manual";
  const triggerConfig = body.triggerConfig || {};
  const timeoutMs = typeof body.timeoutMs === "number" ? body.timeoutMs : 600000;
  const retryParsed = parseRetryPolicy(body.retryPolicy);
  if (!retryParsed.ok) {
    jsonResponse(res, 400, { error: "invalid_retry_policy", details: retryParsed.errors });
    return;
  }
  const retryPolicy = retryParsed.value;
  if (!name || !nodes || !Array.isArray(nodes) || nodes.length === 0) {
    jsonResponse(res, 400, { error: "name + non-empty nodes required" });
    return;
  }
  const validation = validatePipeline({ id: "tmp", name: String(name), nodes: nodes as never, edges: edges as never });
  if (!validation.ok) {
    jsonResponse(res, 400, { error: "invalid_pipeline", details: validation.errors });
    return;
  }
  const [inserted] = await db.insert(agentPipelines).values({
    tenantId: ctx.tenantId, name: String(name),
    description: description ? String(description) : null,
    nodes: nodes as never, edges: edges as never,
    triggerType: String(triggerType), triggerConfig: triggerConfig as never,
    timeoutMs, retryPolicy: retryPolicy as never,
    createdBy: ctx.userId || null,
  } as never).returning();
  jsonResponse(res, 201, { success: true, data: inserted });
}

async function updatePipeline(req: http.IncomingMessage, res: http.ServerResponse, id: string) {
  const ctx = await requireBearer(req, res); if (!ctx) return;
  const check = requireScopes(ctx, ["agent:admin"]);
  if (!check.ok) { jsonResponse(res, 403, { error: "insufficient_scope", missing: check.missing }); return; }
  const body = await parseJsonBody(req);
  const update: Record<string, unknown> = { updatedAt: new Date() };
  for (const k of ["name", "description", "triggerType"]) if (k in body) update[k] = body[k];
  if ("nodes" in body) update.nodes = body.nodes;
  if ("edges" in body) update.edges = body.edges;
  if ("triggerConfig" in body) update.triggerConfig = body.triggerConfig;
  if ("timeoutMs" in body && typeof body.timeoutMs === "number") update.timeoutMs = body.timeoutMs;
  if ("enabled" in body) update.enabled = Boolean(body.enabled);
  if ("retryPolicy" in body) {
    const retryParsed = parseRetryPolicy(body.retryPolicy);
    if (!retryParsed.ok) {
      jsonResponse(res, 400, { error: "invalid_retry_policy", details: retryParsed.errors });
      return;
    }
    update.retryPolicy = retryParsed.value as never;
  }
  await db.update(agentPipelines).set(update).where(eq(agentPipelines.id, id));
  jsonResponse(res, 200, { success: true });
}

async function deletePipeline(req: http.IncomingMessage, res: http.ServerResponse, id: string) {
  const ctx = await requireBearer(req, res); if (!ctx) return;
  const check = requireScopes(ctx, ["agent:admin"]);
  if (!check.ok) { jsonResponse(res, 403, { error: "insufficient_scope", missing: check.missing }); return; }
  await db.delete(agentPipelines).where(eq(agentPipelines.id, id));
  jsonResponse(res, 200, { success: true });
}

async function listRuns(req: http.IncomingMessage, res: http.ServerResponse, url: string) {
  const ctx = await requireBearer(req, res); if (!ctx) return;
  const check = requireScopes(ctx, ["agent:read", "agent:admin"]);
  if (!check.ok) { jsonResponse(res, 403, { error: "insufficient_scope", missing: check.missing }); return; }
  const u = new URL(url, "http://localhost");
  const pipelineId = u.searchParams.get("pipelineId");
  const limit = Math.min(parseInt(u.searchParams.get("limit") || "50", 10), 200);
  const conds = [];
  if (pipelineId) conds.push(eq(pipelineRuns.pipelineId, pipelineId));
  const rows = await db.select().from(pipelineRuns)
    .where(conds.length > 0 ? and(...conds) : undefined)
    .orderBy(desc(pipelineRuns.startedAt)).limit(limit);
  jsonResponse(res, 200, { success: true, data: rows });
}

async function getRun(req: http.IncomingMessage, res: http.ServerResponse, id: string) {
  const ctx = await requireBearer(req, res); if (!ctx) return;
  const check = requireScopes(ctx, ["agent:read", "agent:admin"]);
  if (!check.ok) { jsonResponse(res, 403, { error: "insufficient_scope", missing: check.missing }); return; }
  const rows = await db.select().from(pipelineRuns).where(eq(pipelineRuns.id, id)).limit(1);
  if (rows.length === 0) { jsonResponse(res, 404, { error: "run_not_found" }); return; }
  const messages = await db.select().from(agentMessages).where(eq(agentMessages.runId, id)).orderBy(agentMessages.createdAt);
  jsonResponse(res, 200, { success: true, data: { run: rows[0], messages } });
}

async function triggerPipeline(req: http.IncomingMessage, res: http.ServerResponse, id: string) {
  const ctx = await requireBearer(req, res); if (!ctx) return;
  const check = requireScopes(ctx, ["agent:admin", "agent:run"]);
  if (!check.ok) { jsonResponse(res, 403, { error: "insufficient_scope", missing: check.missing }); return; }

  // Rate limit (fail-open if check throws)
  try {
    const rl = checkRateLimit(ctx.userId || "anonymous");
    if (!rl.ok) {
      res.setHeader("Retry-After", String(rl.retryAfter || 60));
      jsonResponse(res, 429, { error: "rate_limited", retryAfter: rl.retryAfter });
      return;
    }
  } catch { /* fail-open */ }

  // Daily token cap (estimate 0 = unknown upfront; checked again after run)
  try {
    const cap = checkDailyTokenCap(ctx.userId || "anonymous", 0);
    if (!cap.ok) {
      jsonResponse(res, 429, { error: "daily_token_cap_exceeded", currentUsage: cap.currentUsage, limit: cap.limit });
      return;
    }
  } catch { /* fail-open */ }

  const rows = await db.select().from(agentPipelines).where(eq(agentPipelines.id, id)).limit(1);
  if (rows.length === 0) { jsonResponse(res, 404, { error: "pipeline_not_found" }); return; }
  const body = await parseJsonBody(req);
  const triggeredBy = (body.triggeredBy as "user" | "bot" | "cron" | "event" | "api") || "user";
  const triggeredByRef = body.triggeredByRef ? String(body.triggeredByRef) : null;
  const initialInput = (body.initialInput || {}) as Record<string, unknown>;

  // Async mode (?async=true): write run as 'pending', kick off in background,
  // return 202 immediately so HTTP doesn't block 8+ seconds on LLM calls.
  const isAsync = parseQueryBool(req.url, "async");

  // Snapshot current node labels so Diff can detect label renames later.
  // Map: { [nodeId]: label }. Always snapshot at trigger time, even for async runs.
  const labelSnapshot: Record<string, string> = {};
  for (const n of (rows[0].nodes ?? []) as Array<{ id: string; label?: string }>) {
    if (n && typeof n.id === "string") {
      labelSnapshot[n.id] = typeof n.label === "string" ? n.label : "";
    }
  }

  const [run] = await db.insert(pipelineRuns).values({
    tenantId: ctx.tenantId, pipelineId: id,
    triggeredBy, triggeredByRef,
    status: isAsync ? "pending" : "running",
    nodeStates: {} as never,
    labelSnapshot: labelSnapshot as never,
  } as never).returning();

  const pipeline = {
    id: rows[0].id, name: rows[0].name,
    nodes: (rows[0].nodes ?? []) as unknown[], edges: ((rows[0].edges as unknown[]) || []),
    timeoutMs: rows[0].timeoutMs ?? undefined, retryPolicy: rows[0].retryPolicy as unknown,
  };

  if (isAsync) {
    // Background: fire-and-forget. setImmediate releases the request immediately,
    // unhandled rejection is logged so we don't silently lose the run.
    setImmediate(() => {
      runPipelineInBackground(pipeline, run.id, triggeredBy, triggeredByRef, initialInput, ctx.tenantId, id)
        .catch((e) => console.error(`[pipeline-async] run ${run.id} failed:`, e));
    });
    res.statusCode = 202;
    jsonResponse(res, 202, {
      success: true,
      data: { runId: run.id, status: "pending", pollUrl: `/api/v2/admin/pipelines/${id}/runs/${run.id}` },
    });
    return;
  }

  const result = await executePipeline(
    pipeline as never, run.id,
    { triggeredBy, triggeredByRef: triggeredByRef || undefined, initialInput, tenantId: ctx.tenantId },
    async (nodeId, state) => {
      const current = await db.select().from(pipelineRuns).where(eq(pipelineRuns.id, run.id)).limit(1);
      if (current.length === 0) return;
      const merged = { ...(current[0].nodeStates || {}), [nodeId]: state };
      await db.update(pipelineRuns).set({ nodeStates: merged as never, currentNodeId: nodeId }).where(eq(pipelineRuns.id, run.id));
      // L7: broadcast per-node progress
      emitPipelineProgress(
        run.id,
        id,
        "running",
        nodeId,
        merged,
        Array.isArray(pipeline.nodes) ? pipeline.nodes.length : 0,
      );
    },
  );

  await finalizeRun(run.id, id, result, Array.isArray(pipeline.nodes) ? pipeline.nodes.length : 0);
  jsonResponse(res, 200, {
    success: true,
    data: { runId: run.id, status: result.status, durationMs: result.durationMs, result: result.result, error: result.error },
  });
}

/**
 * Run a pipeline in the background (for async mode).
 * Updates run status: pending → running → completed/failed.
 */
async function runPipelineInBackground(
  pipeline: { id: string; name: string; nodes: unknown[]; edges: unknown[]; timeoutMs?: number; retryPolicy: unknown },
  runId: string,
  triggeredBy: "user" | "bot" | "cron" | "event" | "api",
  triggeredByRef: string | null,
  initialInput: Record<string, unknown>,
  tenantId: string | null | undefined,
  pipelineId: string,
): Promise<void> {
  await db.update(pipelineRuns)
    .set({ status: "running", startedAt: new Date() } as never)
    .where(eq(pipelineRuns.id, runId));

  const totalNodes = Array.isArray((pipeline as { nodes?: unknown[] }).nodes)
    ? (pipeline as { nodes: unknown[] }).nodes.length
    : 0;

  let result;
  try {
    result = await executePipeline(
      pipeline as never, runId,
      { triggeredBy, triggeredByRef: triggeredByRef || undefined, initialInput, tenantId: tenantId ?? undefined },
      async (nodeId, state) => {
        const current = await db.select().from(pipelineRuns).where(eq(pipelineRuns.id, runId)).limit(1);
        if (current.length === 0) return;
        const merged = { ...(current[0].nodeStates || {}), [nodeId]: state };
        await db.update(pipelineRuns).set({ nodeStates: merged as never, currentNodeId: nodeId }).where(eq(pipelineRuns.id, runId));
        // L7: broadcast per-node progress
        emitPipelineProgress(runId, pipelineId, "running", nodeId, merged, totalNodes);
      },
    );
  } catch (e) {
    // executePipeline should not throw — but guard anyway so we don\'t leak pending runs.
    const errMsg = (e as Error).message || "pipeline_threw";
    await db.update(pipelineRuns).set({
      status: "failed",
      error: errMsg,
      finishedAt: new Date(),
      currentNodeId: null,
    } as never).where(eq(pipelineRuns.id, runId));
    emitPipelineProgress(runId, pipelineId, "failed", null, {}, totalNodes, errMsg);
    return;
  }

  await finalizeRun(runId, pipelineId, result, totalNodes);
}

/** Finalize run row + bump pipeline aggregate stats. Shared by sync + async paths. */
async function finalizeRun(
  runId: string,
  pipelineId: string,
  result: { status: string; result?: unknown; error?: string; nodeStates: unknown; durationMs: number },
  totalNodes: number = 0,
): Promise<void> {
  await db.update(pipelineRuns).set({
    status: result.status,
    result: (result.result as never) || null,
    error: result.error || null,
    nodeStates: result.nodeStates as never,
    finishedAt: new Date(),
    durationMs: result.durationMs,
    currentNodeId: null,
  } as never).where(eq(pipelineRuns.id, runId));

  const isSuccess = result.status === "completed";
  const sqlUpdate = "UPDATE agent_pipelines SET run_count = run_count + 1"
    + (isSuccess ? ", success_count = success_count + 1" : "")
    + ", avg_duration_ms = COALESCE((avg_duration_ms * run_count + "
    + result.durationMs + ") / (run_count + 1), " + result.durationMs
    + ") WHERE id = '" + pipelineId + "'";
  await db.execute(sqlUpdate as never);

  // L7: broadcast final status (allow custom status strings like 'timeout'/'cancelled')
  const allowedStatuses = ["pending", "running", "completed", "failed", "timeout", "cancelled"] as const;
  const wsStatus = (allowedStatuses as readonly string[]).includes(result.status)
    ? (result.status as PipelineProgressEvent["status"])
    : "failed";
  emitPipelineProgress(
    runId,
    pipelineId,
    wsStatus,
    null,
    (result.nodeStates as Record<string, unknown>) ?? {},
    totalNodes,
    result.error,
  );
}
/** Compute progress 0-100 from nodeStates. Success/failed/skipped = completed. */
function computeProgress(nodeStates: Record<string, unknown>, totalNodes: number): number {
  if (totalNodes <= 0) return 0;
  let done = 0;
  for (const k in nodeStates) {
    const s = (nodeStates[k] as { status?: string })?.status;
    if (s === "success" || s === "failed" || s === "skipped") done++;
  }
  return Math.min(100, Math.round((done / totalNodes) * 100));
}

/** Emit pipeline_progress event (best-effort, WS 失败不影响 pipeline)
 *
 * R22: pass `includeNodeStates=true` (default) so the client execution-log can
 * render expanded node details (input/output/error) in real time without an
 * extra GET /runs/:rid. The summary fields are still derived from nodeStates,
 * so we already have the data in scope — just forward it.
 */
function emitPipelineProgress(
  runId: string,
  pipelineId: string,
  status: PipelineProgressEvent["status"],
  currentNodeId: string | null,
  nodeStates: Record<string, unknown>,
  totalNodes: number,
  error?: string,
): void {
  broadcastPipelineProgress({
    type: "pipeline_progress",
    runId,
    pipelineId,
    status,
    currentNodeId,
    completedNodes: Object.values(nodeStates).filter((n: any) =>
      n?.status === "success" || n?.status === "failed" || n?.status === "skipped",
    ).length,
    totalNodes,
    progress: computeProgress(nodeStates, totalNodes),
    error,
    ts: new Date().toISOString(),
    nodeStates: nodeStates as PipelineProgressEvent["nodeStates"],
  });
}


/** Parse a boolean query parameter (?async=true&foo=bar). Accepts true/1/yes. */
function parseQueryBool(url: string | undefined, key: string): boolean {
  if (!url) return false;
  const qIdx = url.indexOf("?");
  if (qIdx === -1) return false;
  const qs = url.slice(qIdx + 1);
  for (const part of qs.split("&")) {
    const [k, v] = part.split("=");
    if (k === key && v && /^(true|1|yes)$/i.test(decodeURIComponent(v))) return true;
  }
  return false;
}


/**
 * R18: POST /api/v2/admin/pipelines/:pid/runs/:runId/nodes/:nodeId/decide
 *
 * Records a human decision on a 'human' kind node currently in
 * 'waiting_for_human' state. The engine polls node_states and resumes the
 * pipeline once the decision is visible here. Also broadcasts a WS event so
 * the UI updates in real time.
 *
 * Body: { decision: "approved" | "rejected", note?: string }
 */
async function decideNode(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pipelineId: string,
  runId: string,
  nodeId: string,
) {
  const ctx = await requireBearer(req, res);
  if (!ctx) return;
  const check = requireScopes(ctx, ["agent:admin", "agent:run"]);
  if (!check.ok) { jsonResponse(res, 403, { error: "insufficient_scope", missing: check.missing }); return; }

  const body = await parseJsonBody(req);
  const decision = body.decision;
  const note = typeof body.note === "string" ? body.note.trim() || null : null;

  if (decision !== "approved" && decision !== "rejected") {
    jsonResponse(res, 400, { error: "decision must be 'approved' or 'rejected'" });
    return;
  }

  const rows = await db.select().from(pipelineRuns).where(eq(pipelineRuns.id, runId)).limit(1);
  if (rows.length === 0) {
    jsonResponse(res, 404, { error: "run_not_found" });
    return;
  }
  const run = rows[0];
  // Tenant guard: callers may only decide on runs in their own tenant.
  if (run.tenantId !== ctx.tenantId) {
    jsonResponse(res, 404, { error: "run_not_found" });
    return;
  }

  const ns = (run.nodeStates ?? {}) as Record<string, any>;
  const current = ns[nodeId];

  if (!current || current.status !== "waiting_for_human") {
    jsonResponse(res, 400, {
      error: "node_not_awaiting_decision",
      currentStatus: current?.status ?? "missing",
    });
    return;
  }
  // Idempotency: a node that already has a decision cannot be re-decided.
  if (current.approval === "approved" || current.approval === "rejected") {
    jsonResponse(res, 409, {
      error: "node_already_decided",
      approval: current.approval,
      decidedBy: current.decidedBy,
    });
    return;
  }

  const decidedAt = new Date().toISOString();
  ns[nodeId] = {
    ...current,
    approval: decision,
    note,
    decidedBy: ctx.userId,
    decidedAt,
  };

  await db
    .update(pipelineRuns)
    .set({ nodeStates: ns as never })
    .where(eq(pipelineRuns.id, runId));

  // Best-effort WS broadcast so the UI flips to decided instantly. The engine
  // also polls DB and will resume regardless of whether WS is up.
  emitPipelineProgress(runId, pipelineId, "running", nodeId, ns, Object.keys(ns).length);

  jsonResponse(res, 200, {
    success: true,
    runId,
    nodeId,
    decision,
    decidedBy: ctx.userId,
    decidedAt,
  });
}

export async function handlePipelineRoutes(req: http.IncomingMessage, res: http.ServerResponse, method: string, url: string) {
  if (!url.startsWith("/api/v2/admin/pipelines")) return false;
  const runMatch = url.match(/^\/api\/v2\/admin\/pipelines\/([^/]+)\/runs\/([^/?]+)$/);
  if (runMatch && method === "GET") { await getRun(req, res, runMatch[2]); return true; }
  const runsListMatch = url.match(/^\/api\/v2\/admin\/pipelines\/([^/]+)\/runs(?:\?.*)?$/);
  if (runsListMatch && method === "GET") { await listRuns(req, res, url); return true; }
  const decideMatch = url.match(/^\/api\/v2\/admin\/pipelines\/([^/]+)\/runs\/([^/?]+)\/nodes\/([^/?]+)\/decide(?:\?.*)?$/);
  if (decideMatch && method === "POST") {
    await decideNode(req, res, decideMatch[1], decideMatch[2], decideMatch[3]);
    return true;
  }
  const triggerMatch = url.match(/^\/api\/v2\/admin\/pipelines\/([^/]+)\/trigger(?:\?.*)?$/);
  if (triggerMatch && method === "POST") { await triggerPipeline(req, res, triggerMatch[1]); return true; }
  const idMatch = url.match(/^\/api\/v2\/admin\/pipelines\/([^/?]+)(?:\?.*)?$/);
  if (idMatch && idMatch[1]) {
    const id = idMatch[1];
    if (method === "GET") { await getPipeline(req, res, id); return true; }
    if (method === "PATCH") { await updatePipeline(req, res, id); return true; }
    if (method === "DELETE") { await deletePipeline(req, res, id); return true; }
  }
  if (url === "/api/v2/admin/pipelines" || url === "/api/v2/admin/pipelines/" || url.startsWith("/api/v2/admin/pipelines?") || url.startsWith("/api/v2/admin/pipelines/?")) {
    if (method === "GET") { await listPipelines(req, res); return true; }
    if (method === "POST") { await createPipeline(req, res); return true; }
  }
  return false;
}
