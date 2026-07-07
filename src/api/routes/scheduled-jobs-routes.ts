import type http from "node:http";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../../db/index.js";
import { scheduledJobs } from "../../db/schema.js";
import { jsonResponse, parseJsonBody } from "./helpers.js";
import { requireBearer, requireScopes } from "../oauth-middleware.js";

function isValidTriggerType(t: unknown): t is "cron" | "event" | "manual" {
  return t === "cron" || t === "event" || t === "manual";
}

async function listJobs(req: http.IncomingMessage, res: http.ServerResponse, url: string) {
  const ctx = await requireBearer(req, res); if (!ctx) return;
  const check = requireScopes(ctx, ["agent:read", "agent:admin"]);
  if (!check.ok) { jsonResponse(res, 403, { error: "insufficient_scope", missing: check.missing }); return; }
  const u = new URL(url, "http://localhost");
  const templateId = u.searchParams.get("templateId");
  const conds = [];
  if (templateId) conds.push(eq(scheduledJobs.agentTemplateId, templateId));
  const rows = await db.select().from(scheduledJobs)
    .where(conds.length > 0 ? and(...conds) : undefined)
    .orderBy(desc(scheduledJobs.createdAt));
  jsonResponse(res, 200, { success: true, data: rows });
}

async function getJob(req: http.IncomingMessage, res: http.ServerResponse, id: string) {
  const ctx = await requireBearer(req, res); if (!ctx) return;
  const check = requireScopes(ctx, ["agent:read", "agent:admin"]);
  if (!check.ok) { jsonResponse(res, 403, { error: "insufficient_scope", missing: check.missing }); return; }
  const rows = await db.select().from(scheduledJobs).where(eq(scheduledJobs.id, id)).limit(1);
  if (rows.length === 0) { jsonResponse(res, 404, { error: "job_not_found" }); return; }
  jsonResponse(res, 200, { success: true, data: rows[0] });
}

async function createJob(req: http.IncomingMessage, res: http.ServerResponse) {
  const ctx = await requireBearer(req, res); if (!ctx) return;
  const check = requireScopes(ctx, ["agent:admin"]);
  if (!check.ok) { jsonResponse(res, 403, { error: "insufficient_scope", missing: check.missing }); return; }
  const body = await parseJsonBody(req) as Record<string, unknown>;
  const { agentTemplateId, name, description, triggerType, cronExpression, eventTopic, inputTemplate } = body;
  if (!agentTemplateId || !name || !isValidTriggerType(triggerType)) {
    jsonResponse(res, 400, { error: "agentTemplateId + name + triggerType required" });
    return;
  }
  if (triggerType === "cron" && !cronExpression) {
    jsonResponse(res, 400, { error: "cron jobs require cronExpression" }); return;
  }
  if (triggerType === "event" && !eventTopic) {
    jsonResponse(res, 400, { error: "event jobs require eventTopic" }); return;
  }
  const [inserted] = await db.insert(scheduledJobs).values({
    tenantId: ctx.tenantId,
    agentTemplateId: String(agentTemplateId),
    name: String(name),
    description: description ? String(description) : null,
    triggerType,
    cronExpression: cronExpression ? String(cronExpression) : null,
    eventTopic: eventTopic ? String(eventTopic) : null,
    inputTemplate: (inputTemplate ?? {}) as never,
    createdBy: ctx.userId ?? null,
  } as never).returning();
  jsonResponse(res, 201, { success: true, data: inserted });
}

async function updateJob(req: http.IncomingMessage, res: http.ServerResponse, id: string) {
  const ctx = await requireBearer(req, res); if (!ctx) return;
  const check = requireScopes(ctx, ["agent:admin"]);
  if (!check.ok) { jsonResponse(res, 403, { error: "insufficient_scope", missing: check.missing }); return; }
  const body = await parseJsonBody(req) as Record<string, unknown>;
  const update: Record<string, unknown> = { updatedAt: new Date() };
  for (const k of ["name", "description", "cronExpression", "eventTopic"]) {
    if (k in body) update[k] = body[k];
  }
  if ("inputTemplate" in body) update.inputTemplate = body.inputTemplate;
  if ("enabled" in body) update.enabled = Boolean(body.enabled);
  await db.update(scheduledJobs).set(update as never).where(eq(scheduledJobs.id, id));
  jsonResponse(res, 200, { success: true });
}

async function deleteJob(req: http.IncomingMessage, res: http.ServerResponse, id: string) {
  const ctx = await requireBearer(req, res); if (!ctx) return;
  const check = requireScopes(ctx, ["agent:admin"]);
  if (!check.ok) { jsonResponse(res, 403, { error: "insufficient_scope", missing: check.missing }); return; }
  await db.delete(scheduledJobs).where(eq(scheduledJobs.id, id));
  jsonResponse(res, 200, { success: true });
}

async function triggerJob(req: http.IncomingMessage, res: http.ServerResponse, id: string) {
  const ctx = await requireBearer(req, res); if (!ctx) return;
  const check = requireScopes(ctx, ["agent:admin", "agent:run"]);
  if (!check.ok) { jsonResponse(res, 403, { error: "insufficient_scope", missing: check.missing }); return; }
  const rows = await db.select().from(scheduledJobs).where(eq(scheduledJobs.id, id)).limit(1);
  if (rows.length === 0) { jsonResponse(res, 404, { error: "job_not_found" }); return; }
  await db.update(scheduledJobs).set({
    lastRunAt: new Date(),
    lastStatus: "pending",
    runCount: (rows[0].runCount ?? 0) + 1,
    updatedAt: new Date(),
  } as never).where(eq(scheduledJobs.id, id));
  jsonResponse(res, 202, { success: true, message: "triggered", note: "actual execution in Phase 2 (Pipeline engine)" });
}

export async function handleScheduledJobsRoutes(req: http.IncomingMessage, res: http.ServerResponse, method: string, url: string): Promise<boolean> {
  if (!url.startsWith("/api/v2/admin/scheduled-jobs")) return false;
  const rest = url.slice("/api/v2/admin/scheduled-jobs".length);
  if (rest === "" || rest.startsWith("?")) {
    if (method === "GET") { await listJobs(req, res, url); return true; }
    if (method === "POST") { await createJob(req, res); return true; }
  }
  const idMatch = rest.match(/^\/([^/?]+)$/);
  const triggerMatch = rest.match(/^\/([^/?]+)\/trigger$/);
  if (triggerMatch && method === "POST") { await triggerJob(req, res, triggerMatch[1]!); return true; }
  if (idMatch && idMatch[1]) {
    const id = idMatch[1];
    if (method === "GET") { await getJob(req, res, id); return true; }
    if (method === "PATCH") { await updateJob(req, res, id); return true; }
    if (method === "DELETE") { await deleteJob(req, res, id); return true; }
  }
  return false;
}
