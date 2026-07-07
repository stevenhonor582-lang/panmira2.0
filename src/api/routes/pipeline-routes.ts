import type http from "node:http";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../../db/index.js";
import { agentPipelines, pipelineRuns, agentMessages } from "../../db/schema.js";
import { jsonResponse, parseJsonBody } from "./helpers.js";
import { requireBearer, requireScopes } from "../oauth-middleware.js";
import { validatePipeline, executePipeline } from "../../services/pipeline-engine.js";
import { checkRateLimit, checkDailyTokenCap, recordTokenUsage } from "../../middleware/pipeline-rate-limit.js";

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
  const retryPolicy = body.retryPolicy || { maxAttempts: 1, backoffMs: 1000 };
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

  const [run] = await db.insert(pipelineRuns).values({
    tenantId: ctx.tenantId, pipelineId: id,
    triggeredBy, triggeredByRef,
    status: "running", nodeStates: {} as never,
  } as never).returning();

  const pipeline = {
    id: rows[0].id, name: rows[0].name,
    nodes: rows[0].nodes as never, edges: (rows[0].edges || []) as never,
    timeoutMs: rows[0].timeoutMs ?? undefined, retryPolicy: rows[0].retryPolicy as never,
  };

  const result = await executePipeline(
    pipeline, run.id,
    { triggeredBy, triggeredByRef: triggeredByRef || undefined, initialInput },
    async (nodeId, state) => {
      const current = await db.select().from(pipelineRuns).where(eq(pipelineRuns.id, run.id)).limit(1);
      if (current.length === 0) return;
      const merged = { ...(current[0].nodeStates || {}), [nodeId]: state };
      await db.update(pipelineRuns).set({ nodeStates: merged as never, currentNodeId: nodeId }).where(eq(pipelineRuns.id, run.id));
    },
  );

  await db.update(pipelineRuns).set({
    status: result.status,
    result: result.result || null,
    error: result.error || null,
    nodeStates: result.nodeStates as never,
    finishedAt: new Date(),
    durationMs: result.durationMs,
    currentNodeId: null,
  } as never).where(eq(pipelineRuns.id, run.id));

  const isSuccess = result.status === "completed";
  const sqlUpdate = "UPDATE agent_pipelines SET run_count = run_count + 1"
    + (isSuccess ? ", success_count = success_count + 1" : "")
    + ", avg_duration_ms = COALESCE((avg_duration_ms * run_count + "
    + result.durationMs + ") / (run_count + 1), " + result.durationMs
    + ") WHERE id = '" + id + "'";
  await db.execute(sqlUpdate as never);

  jsonResponse(res, 200, {
    success: true,
    data: { runId: run.id, status: result.status, durationMs: result.durationMs, result: result.result, error: result.error },
  });
}

export async function handlePipelineRoutes(req: http.IncomingMessage, res: http.ServerResponse, method: string, url: string) {
  if (!url.startsWith("/api/v2/admin/pipelines")) return false;
  const runMatch = url.match(/^\/api\/v2\/admin\/pipelines\/([^/]+)\/runs\/([^/?]+)$/);
  if (runMatch && method === "GET") { await getRun(req, res, runMatch[2]); return true; }
  const runsListMatch = url.match(/^\/api\/v2\/admin\/pipelines\/([^/]+)\/runs$/);
  if (runsListMatch && method === "GET") { await listRuns(req, res, url); return true; }
  const triggerMatch = url.match(/^\/api\/v2\/admin\/pipelines\/([^/]+)\/trigger$/);
  if (triggerMatch && method === "POST") { await triggerPipeline(req, res, triggerMatch[1]); return true; }
  const idMatch = url.match(/^\/api\/v2\/admin\/pipelines\/([^/?]+)$/);
  if (idMatch && idMatch[1]) {
    const id = idMatch[1];
    if (method === "GET") { await getPipeline(req, res, id); return true; }
    if (method === "PATCH") { await updatePipeline(req, res, id); return true; }
    if (method === "DELETE") { await deletePipeline(req, res, id); return true; }
  }
  if (url === "/api/v2/admin/pipelines" || url.startsWith("/api/v2/admin/pipelines?")) {
    if (method === "GET") { await listPipelines(req, res); return true; }
    if (method === "POST") { await createPipeline(req, res); return true; }
  }
  return false;
}
