import type http from "node:http";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../../db/index.js";
import { chatSessions } from "../../db/schema.js";
import { jsonResponse } from "./helpers.js";
import { requireBearer, requireScopes } from "../oauth-middleware.js";

const ACTIVE_THRESHOLD_MS = 5 * 60 * 1000;
const IDLE_THRESHOLD_MS = 60 * 60 * 1000;
const interruptRequests = new Map<string, { requestedAt: number; requestedBy: string }>();

function deriveStatus(lastUsed: number, now: number): "active" | "idle" | "archived" {
  const diff = now - lastUsed;
  if (diff < ACTIVE_THRESHOLD_MS) return "active";
  if (diff < IDLE_THRESHOLD_MS) return "idle";
  return "archived";
}

function sessionToWire(row: typeof chatSessions.$inferSelect, now: number) {
  const lu = Number(row.lastUsed);
  return {
    id: row.id, botName: row.botName, chatId: row.chatId,
    sessionId: row.sessionId, sessionIdEngine: row.sessionIdEngine,
    workingDirectory: row.workingDirectory,
    model: row.model, modelEngine: row.modelEngine, engine: row.engine,
    lastUsed: lu, status: deriveStatus(lu, now),
    cumulativeTokens: Number(row.cumulativeTokens ?? 0),
    cumulativeCostUsd: String(row.cumulativeCostUsd ?? "0"),
    cumulativeDurationMs: Number(row.cumulativeDurationMs ?? 0),
    interruptRequested: interruptRequests.has(row.sessionId ?? ""),
    createdAt: row.createdAt,
  };
}

async function listSessions(req: http.IncomingMessage, res: http.ServerResponse, url: string) {
  const ctx = await requireBearer(req, res); if (!ctx) return;
  const check = requireScopes(ctx, ["runtime:read", "runtime:admin"]);
  if (!check.ok) { jsonResponse(res, 403, { error: "insufficient_scope", missing: check.missing }); return; }
  const u = new URL(url, "http://localhost");
  const bot = u.searchParams.get("bot");
  const activeOnly = u.searchParams.get("activeOnly") === "true";
  const limit = Math.min(parseInt(u.searchParams.get("limit") || "50", 10), 200);
  const offset = parseInt(u.searchParams.get("offset") || "0", 10);
  const conds = []; if (bot) conds.push(eq(chatSessions.botName, bot));
  const rows = await db.select().from(chatSessions)
    .where(conds.length > 0 ? and(...conds) : undefined)
    .orderBy(desc(chatSessions.lastUsed)).limit(limit).offset(offset);
  const now = Date.now();
  let items = rows.map(r => sessionToWire(r, now));
  if (activeOnly) items = items.filter(s => s.status === "active");
  jsonResponse(res, 200, { success: true, data: { items, total: items.length, limit, offset } });
}

async function getSession(req: http.IncomingMessage, res: http.ServerResponse, id: string) {
  const ctx = await requireBearer(req, res); if (!ctx) return;
  const check = requireScopes(ctx, ["runtime:read", "runtime:admin"]);
  if (!check.ok) { jsonResponse(res, 403, { error: "insufficient_scope", missing: check.missing }); return; }
  const rows = await db.select().from(chatSessions).where(eq(chatSessions.id, id)).limit(1);
  if (rows.length === 0) { jsonResponse(res, 404, { error: "session_not_found" }); return; }
  jsonResponse(res, 200, { success: true, data: sessionToWire(rows[0], Date.now()) });
}

async function getStats(req: http.IncomingMessage, res: http.ServerResponse) {
  const ctx = await requireBearer(req, res); if (!ctx) return;
  const check = requireScopes(ctx, ["runtime:read", "runtime:admin"]);
  if (!check.ok) { jsonResponse(res, 403, { error: "insufficient_scope", missing: check.missing }); return; }
  const now = Date.now();
  const activeThr = now - ACTIVE_THRESHOLD_MS;
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayStartEpoch = todayStart.getTime();
  const all = await db.select().from(chatSessions);
  let activeCount = 0, todayCount = 0, costToday = 0;
  const byBot = new Map<string, { botName: string; count: number; totalCost: number; totalTokens: number }>();
  for (const r of all) {
    const lu = Number(r.lastUsed);
    if (lu >= activeThr) activeCount++;
    if (lu >= todayStartEpoch) {
      todayCount++;
      const cost = parseFloat(String(r.cumulativeCostUsd ?? "0"));
      costToday += cost;
      const cur = byBot.get(r.botName) ?? { botName: r.botName, count: 0, totalCost: 0, totalTokens: 0 };
      cur.count++; cur.totalCost += cost; cur.totalTokens += Number(r.cumulativeTokens ?? 0);
      byBot.set(r.botName, cur);
    }
  }
  jsonResponse(res, 200, { success: true, data: {
    activeSessions: activeCount, totalToday: todayCount,
    totalCostToday: Math.round(costToday * 100) / 100,
    byBot: Array.from(byBot.values()).sort((a, b) => b.totalCost - a.totalCost),
  }});
}

async function interruptSession(req: http.IncomingMessage, res: http.ServerResponse, id: string) {
  const ctx = await requireBearer(req, res); if (!ctx) return;
  const check = requireScopes(ctx, ["runtime:admin"]);
  if (!check.ok) { jsonResponse(res, 403, { error: "insufficient_scope", missing: check.missing }); return; }
  const rows = await db.select().from(chatSessions).where(eq(chatSessions.id, id)).limit(1);
  if (rows.length === 0) { jsonResponse(res, 404, { error: "session_not_found" }); return; }
  const sid = rows[0].sessionId ?? "";
  interruptRequests.set(sid, { requestedAt: Date.now(), requestedBy: ctx.clientId ?? "unknown" });
  jsonResponse(res, 200, { success: true, data: { sessionId: sid, requested: true } });
}

export async function handleRuntimeRoutes(req: http.IncomingMessage, res: http.ServerResponse, method: string, url: string): Promise<boolean> {
  if (url === "/api/v2/admin/runtime/stats" && method === "GET") { await getStats(req, res); return true; }
  if (url.startsWith("/api/v2/admin/runtime/sessions") && method === "GET") {
    const rest = url.slice("/api/v2/admin/runtime/sessions".length);
    if (rest === "" || rest.startsWith("?")) { await listSessions(req, res, url); return true; }
    const id = rest.replace(/^\//, "").split("?")[0];
    if (id) { await getSession(req, res, id); return true; }
  }
  const im = url.match(/^\/api\/v2\/admin\/runtime\/sessions\/([^\/]+)\/interrupt$/);
  if (im && method === "POST") { await interruptSession(req, res, im[1]); return true; }
  return false;
}
