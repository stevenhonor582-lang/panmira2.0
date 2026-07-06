import type http from "node:http";
import { eq, and, desc, max } from "drizzle-orm";
import { db } from "../../db/index.js";
import { skillDags } from "../../db/schema.js";
import { jsonResponse } from "./helpers.js";
import { requireBearer, requireScopes } from "../oauth-middleware.js";
import { validateSkillDag } from "../../lib/schema-validator.js";

async function listDags(req: http.IncomingMessage, res: http.ServerResponse, url: string) {
  const ctx = await requireBearer(req, res); if (!ctx) return;
  const check = requireScopes(ctx, ["skill:read", "skill:admin"]);
  if (!check.ok) { jsonResponse(res, 403, { error: "insufficient_scope", missing: check.missing }); return; }
  const u = new URL(url, "http://localhost");
  const skillId = u.searchParams.get("skillId");
  const conds = [];
  if (skillId) conds.push(eq(skillDags.skillId, skillId));
  const rows = await db.select().from(skillDags)
    .where(conds.length > 0 ? and(...conds) : undefined)
    .orderBy(desc(skillDags.updatedAt));
  jsonResponse(res, 200, { success: true, data: rows });
}

async function getDag(req: http.IncomingMessage, res: http.ServerResponse, id: string) {
  const ctx = await requireBearer(req, res); if (!ctx) return;
  const check = requireScopes(ctx, ["skill:read", "skill:admin"]);
  if (!check.ok) { jsonResponse(res, 403, { error: "insufficient_scope", missing: check.missing }); return; }
  const rows = await db.select().from(skillDags).where(eq(skillDags.id, id)).limit(1);
  if (rows.length === 0) { jsonResponse(res, 404, { error: "skill_dag_not_found" }); return; }
  jsonResponse(res, 200, { success: true, data: rows[0] });
}

async function createDag(req: http.IncomingMessage, res: http.ServerResponse) {
  const ctx = await requireBearer(req, res); if (!ctx) return;
  const check = requireScopes(ctx, ["skill:admin"]);
  if (!check.ok) { jsonResponse(res, 403, { error: "insufficient_scope", missing: check.missing }); return; }
  const body = await new Promise<string>((resolve, reject) => {
    let data = "";
    req.on("data", c => data += c);
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
  const parsed = JSON.parse(body) as { skillId?: string; tenantId?: string; nodes?: unknown[]; edges?: unknown[]; inputSchema?: unknown; outputSchema?: unknown };
  if (!parsed.skillId || !parsed.tenantId) { jsonResponse(res, 400, { error: "skillId + tenantId required" }); return; }

  const versionRows = await db.select({ v: max(skillDags.version) }).from(skillDags).where(eq(skillDags.skillId, parsed.skillId));
  const nextVersion = Number(versionRows[0]?.v ?? 0) + 1;

  const validation = validateSkillDag({ nodes: parsed.nodes ?? [], edges: parsed.edges ?? [], inputSchema: parsed.inputSchema ?? {}, outputSchema: parsed.outputSchema ?? {} });
  const status = validation.ok ? "valid" : "invalid";
  const errors = validation.ok ? [] : validation.errors;

  const [inserted] = await db.insert(skillDags).values({
    tenantId: parsed.tenantId,
    skillId: parsed.skillId,
    version: nextVersion,
    nodes: (parsed.nodes ?? []) as never,
    edges: (parsed.edges ?? []) as never,
    inputSchema: (parsed.inputSchema ?? {}) as never,
    outputSchema: (parsed.outputSchema ?? {}) as never,
    validationStatus: status,
    validationErrors: errors as never,
    authorId: ctx.clientId ? undefined : undefined,
  }).returning();

  jsonResponse(res, 201, { success: true, data: inserted, validation: { ok: validation.ok, errors } });
}

async function updateDag(req: http.IncomingMessage, res: http.ServerResponse, id: string) {
  const ctx = await requireBearer(req, res); if (!ctx) return;
  const check = requireScopes(ctx, ["skill:admin"]);
  if (!check.ok) { jsonResponse(res, 403, { error: "insufficient_scope", missing: check.missing }); return; }
  const body = await new Promise<string>((resolve, reject) => {
    let data = "";
    req.on("data", c => data += c);
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
  const parsed = JSON.parse(body) as { nodes?: unknown[]; edges?: unknown[]; inputSchema?: unknown; outputSchema?: unknown };
  const validation = validateSkillDag({ nodes: parsed.nodes ?? [], edges: parsed.edges ?? [], inputSchema: parsed.inputSchema ?? {}, outputSchema: parsed.outputSchema ?? {} });
  const status = validation.ok ? "valid" : "invalid";
  const errors = validation.ok ? [] : validation.errors;
  await db.update(skillDags).set({
    nodes: (parsed.nodes ?? []) as never,
    edges: (parsed.edges ?? []) as never,
    inputSchema: (parsed.inputSchema ?? {}) as never,
    outputSchema: (parsed.outputSchema ?? {}) as never,
    validationStatus: status,
    validationErrors: errors as never,
    updatedAt: new Date(),
  }).where(eq(skillDags.id, id));
  jsonResponse(res, 200, { success: true, validation: { ok: validation.ok, errors } });
}

async function deleteDag(req: http.IncomingMessage, res: http.ServerResponse, id: string) {
  const ctx = await requireBearer(req, res); if (!ctx) return;
  const check = requireScopes(ctx, ["skill:admin"]);
  if (!check.ok) { jsonResponse(res, 403, { error: "insufficient_scope", missing: check.missing }); return; }
  await db.update(skillDags).set({ validationStatus: "deleted", updatedAt: new Date() }).where(eq(skillDags.id, id));
  jsonResponse(res, 200, { success: true });
}

export async function handleSkillDagRoutes(req: http.IncomingMessage, res: http.ServerResponse, method: string, url: string): Promise<boolean> {
  if (!url.startsWith("/api/v2/admin/skill-dags")) return false;
  const rest = url.slice("/api/v2/admin/skill-dags".length);
  if (rest === "" || rest.startsWith("?")) {
    if (method === "GET") { await listDags(req, res, url); return true; }
    if (method === "POST") { await createDag(req, res); return true; }
  }
  const id = rest.replace(/^\//, "").split("?")[0];
  if (!id) return false;
  if (method === "GET") { await getDag(req, res, id); return true; }
  if (method === "PUT") { await updateDag(req, res, id); return true; }
  if (method === "DELETE") { await deleteDag(req, res, id); return true; }
  return false;
}
