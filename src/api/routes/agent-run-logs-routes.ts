/**
 * Agent Run Logs API (Phase 1):
 *   GET /api/v2/admin/agent-run-logs?templateId=X&deploymentType=bot&limit=50
 *   GET /api/v2/admin/agent-run-logs/stats?templateId=X
 *
 * 用于 /agents/:id 详情页的"调用日志"Tab,展示 Agent 在所有部署形态下的运行历史。
 */
import type http from "node:http";
import { eq, and, desc, gte, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { agentRunLogs } from "../../db/schema.js";
import { jsonResponse } from "./helpers.js";
import { requireBearer, requireScopes } from "../oauth-middleware.js";

async function listLogs(req: http.IncomingMessage, res: http.ServerResponse, url: string) {
  const ctx = await requireBearer(req, res); if (!ctx) return;
  const check = requireScopes(ctx, ["agent:read", "agent:admin"]);
  if (!check.ok) { jsonResponse(res, 403, { error: "insufficient_scope", missing: check.missing }); return; }
  const u = new URL(url, "http://localhost");
  const templateId = u.searchParams.get("templateId");
  const deploymentType = u.searchParams.get("deploymentType");
  const limit = Math.min(parseInt(u.searchParams.get("limit") || "50", 10), 500);
  const conds = [];
  if (templateId) conds.push(eq(agentRunLogs.agentTemplateId, templateId));
  if (deploymentType) conds.push(eq(agentRunLogs.deploymentType, deploymentType));
  const rows = await db.select().from(agentRunLogs)
    .where(conds.length > 0 ? and(...conds) : undefined)
    .orderBy(desc(agentRunLogs.createdAt))
    .limit(limit);
  jsonResponse(res, 200, { success: true, data: rows });
}

async function getStats(req: http.IncomingMessage, res: http.ServerResponse, url: string) {
  const ctx = await requireBearer(req, res); if (!ctx) return;
  const check = requireScopes(ctx, ["agent:read", "agent:admin"]);
  if (!check.ok) { jsonResponse(res, 403, { error: "insufficient_scope", missing: check.missing }); return; }
  const u = new URL(url, "http://localhost");
  const templateId = u.searchParams.get("templateId");
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

  const conds = [];
  if (templateId) conds.push(eq(agentRunLogs.agentTemplateId, templateId));

  const allRows = await db.select().from(agentRunLogs)
    .where(conds.length > 0 ? and(...conds) : undefined);

  let todayCount = 0;
  let todayCost = 0;
  let successCount = 0;
  let totalTokens = 0;
  for (const r of allRows) {
    if (r.createdAt && r.createdAt.getTime() >= todayStart.getTime()) {
      todayCount++;
      todayCost += parseFloat(String(r.costUsd ?? "0"));
    }
    if (r.status === "success") successCount++;
    totalTokens += r.tokensUsed ?? 0;
  }

  jsonResponse(res, 200, {
    success: true,
    data: {
      total: allRows.length,
      today: todayCount,
      todayCost: Math.round(todayCost * 100) / 100,
      successCount,
      successRate: allRows.length > 0 ? Math.round((successCount / allRows.length) * 100) / 100 : 0,
      totalTokens,
    },
  });
}

export async function handleAgentRunLogsRoutes(req: http.IncomingMessage, res: http.ServerResponse, method: string, url: string): Promise<boolean> {
  if (!url.startsWith("/api/v2/admin/agent-run-logs")) return false;
  if (method !== "GET") return false;
  if (url === "/api/v2/admin/agent-run-logs/stats" || url.startsWith("/api/v2/admin/agent-run-logs/stats?")) {
    await getStats(req, res, url); return true;
  }
  if (url === "/api/v2/admin/agent-run-logs" || url.startsWith("/api/v2/admin/agent-run-logs?")) {
    await listLogs(req, res, url); return true;
  }
  return false;
}
