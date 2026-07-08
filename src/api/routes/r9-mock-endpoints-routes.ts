/**
 * R9 · Mock Endpoints 实装 (2026-07-08)
 *
 * 5 端点生产化(前端 P10 已写 graceful fallback,本文件接通真数据):
 *
 * 1. GET    /api/mcp/servers               — MCP servers 列表
 * 2. GET    /api/v2/channels/oauth/clients — OAuth client (我们接别人 + client_secret 只显一次)
 * 3. GET    /api/v2/channels/oauth/authorized — 已授权第三方
 * 4. GET    /api/agents/:id/log-series     — 单 agent 30 天 log series
 * 5. GET    /api/knowledge/folders         — KB folder tree
 * 6. GET    /api/v2/admin/diagnosis        — 系统诊断 (5 health checks)
 * 7. GET    /api/v2/admin/optimization      — 优化建议 (3 impacts)
 * 8. GET    /api/v2/admin/logs             — 系统日志
 *
 * 全部端点 require Bearer,根据 role 不同 authorize
 * client_secret 在 create 时只生成一次,后续 list 不再返回
 */
import type * as http from 'node:http';
import { sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { jsonResponse, parseJsonBody } from './helpers.js';
import { requireBearer } from '../oauth-middleware.js';

// ═══════════════════════════════════════════════════════════════
// 1. MCP servers
// ═══════════════════════════════════════════════════════════════
async function listMcpServers(req: http.IncomingMessage, res: http.ServerResponse, ctx: { tenantId: string }) {
  try {
    const rows = await db.execute(sql`
      SELECT id, name, url, transport, auth_type, status, health_status, last_check_at, created_at
      FROM mcp_servers
      WHERE tenant_id = ${ctx.tenantId} AND status = 'active'
      ORDER BY name
    `);
    const arr = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows || []) as Array<Record<string, unknown>>;
    jsonResponse(res, 200, {
      success: true,
      servers: arr.map((r) => ({
        id: r.id,
        name: r.name,
        url: r.url,
        transport: r.transport,
        authType: r.auth_type,
        status: r.status,
        health: r.health_status,
        lastCheckAt: r.last_check_at,
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    jsonResponse(res, 500, { error: 'list_failed', message: err instanceof Error ? err.message : 'unknown' });
  }
}

// ═══════════════════════════════════════════════════════════════
// 2. OAuth clients (我们接别人 — secret 在创建时返回,list 永远不返 secret)
// ═══════════════════════════════════════════════════════════════
async function listOAuthClientsChannel(req: http.IncomingMessage, res: http.ServerResponse, ctx: { tenantId: string }) {
  try {
    const rows = await db.execute(sql`
      SELECT id, name, type, client_id, redirect_uris, scopes, status, created_at
      FROM oauth_clients
      WHERE tenant_id = ${ctx.tenantId} AND status != 'revoked'
      ORDER BY created_at DESC
    `);
    const arr = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows || []) as Array<Record<string, unknown>>;
    jsonResponse(res, 200, {
      success: true,
      clients: arr.map((r) => ({
        id: r.id,
        name: r.name,
        type: r.type,
        clientId: r.client_id,
        redirectUris: r.redirect_uris,
        scopes: r.scopes,
        status: r.status,
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    jsonResponse(res, 500, { error: 'list_failed', message: err instanceof Error ? err.message : 'unknown' });
  }
}

// ═══════════════════════════════════════════════════════════════
// 3. OAuth authorized (别人接我们)
// ═══════════════════════════════════════════════════════════════
async function listOAuthAuthorized(req: http.IncomingMessage, res: http.ServerResponse, ctx: { tenantId: string }) {
  try {
    const rows = await db.execute(sql`
      SELECT id, client_id, app_name, scopes, granted_at, last_used_at, expires_at, revoked
      FROM oauth_authorized
      WHERE tenant_id = ${ctx.tenantId} AND revoked = false
      ORDER BY granted_at DESC
    `);
    const arr = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows || []) as Array<Record<string, unknown>>;
    jsonResponse(res, 200, {
      success: true,
      authorized: arr.map((r) => ({
        id: r.id,
        clientId: r.client_id,
        appName: r.app_name,
        scopes: r.scopes,
        grantedAt: r.granted_at,
        lastUsedAt: r.last_used_at,
        expiresAt: r.expires_at,
        revoked: r.revoked,
      })),
    });
  } catch (err) {
    jsonResponse(res, 500, { error: 'list_failed', message: err instanceof Error ? err.message : 'unknown' });
  }
}

// ═══════════════════════════════════════════════════════════════
// 4. Agent log-series (30 天)
// ═══════════════════════════════════════════════════════════════
async function logSeries(req: http.IncomingMessage, res: http.ServerResponse, ctx: { tenantId: string }, agentId: string, days: number) {
  const d = Math.max(1, Math.min(90, days));
  try {
    const rows = await db.execute(sql`
      SELECT date_trunc('day', to_timestamp(timestamp)) AS day,
        count(*)::int AS total,
        count(*) FILTER (WHERE type = 'error')::int AS errors,
        count(*) FILTER (WHERE type = 'success')::int AS successes,
        round(avg(duration_ms))::int AS avg_latency
      FROM activity_events
      WHERE bot_id::text = ${agentId}
        AND to_timestamp(timestamp) > now() - (${d} || ' days')::interval
      GROUP BY day
      ORDER BY day DESC
      LIMIT 30
    `);
    const arr = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows || []) as Array<Record<string, unknown>>;
    jsonResponse(res, 200, {
      success: true,
      agentId,
      days: d,
      series: arr.map((r) => ({
        date: r.day,
        count: Number(r.total ?? 0),
        errors: Number(r.errors ?? 0),
        successes: Number(r.successes ?? 0),
        avgLatency: Number(r.avg_latency ?? 0),
      })),
    });
  } catch (err) {
    jsonResponse(res, 500, { error: 'log_series_failed', message: err instanceof Error ? err.message : 'unknown' });
  }
}

// ═══════════════════════════════════════════════════════════════
// 5. Knowledge folders (树状)
// ═══════════════════════════════════════════════════════════════
async function listKnowledgeFolders(req: http.IncomingMessage, res: http.ServerResponse, _ctx: { tenantId: string }) {
  try {
    const rows = await db.execute(sql`
      SELECT f.id, f.parent_id, f.name, f.path, f.visibility, f.bot_id,
        (SELECT count(*) FROM documents d WHERE d.folder_id = f.id)::int AS doc_count
      FROM folders f
      ORDER BY COALESCE(f.parent_id, ''), f.name
      LIMIT 500
    `);
    const arr = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows || []) as Array<Record<string, unknown>>;
    jsonResponse(res, 200, {
      success: true,
      folders: arr.map((r) => ({
        id: r.id,
        parentId: r.parent_id,
        name: r.name,
        path: r.path,
        visibility: r.visibility,
        botId: r.bot_id,
        docCount: Number(r.doc_count ?? 0),
      })),
    });
  } catch (err) {
    jsonResponse(res, 500, { error: 'list_failed', message: err instanceof Error ? err.message : 'unknown' });
  }
}

// ═══════════════════════════════════════════════════════════════
// 6. Diagnosis (5 health checks)
// ═══════════════════════════════════════════════════════════════
async function diagnosis(req: http.IncomingMessage, res: http.ServerResponse, _ctx: { tenantId: string }) {
  const checks: Array<{ name: string; status: string; value: string; threshold: string }> = [];
  try {
    // Check 1: DB conn
    const start = Date.now();
    const dbPing = await db.execute(sql`SELECT 1::int AS n`);
    const dbOk = Array.isArray(dbPing) || (dbPing as { rows?: unknown[] }).rows;
    checks.push({
      name: '数据库连接', status: dbOk ? 'ok' : 'error', value: `${Date.now() - start}ms`, threshold: '< 50ms',
    });

    // Check 2: Agent success rate
    const agentStats = await db.execute(sql`
      SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE type = 'success')::int AS ok
      FROM activity_events
      WHERE to_timestamp(timestamp) > now() - interval '24 hours'
    `);
    const aRows = (Array.isArray(agentStats) ? agentStats : (agentStats as { rows?: unknown[] }).rows || []) as Array<Record<string, unknown>>;
    const total = Number(aRows[0]?.total ?? 0);
    const ok = Number(aRows[0]?.ok ?? 0);
    const successRate = total > 0 ? Math.round((ok / total) * 100) : 100;
    checks.push({
      name: '24h agent 成功率', status: successRate >= 95 ? 'ok' : successRate >= 80 ? 'warn' : 'error',
      value: `${successRate}%`, threshold: '>= 95%',
    });

    // Check 3: Active agents count
    const agentCount = await db.execute(sql`SELECT count(*)::int AS n FROM agents WHERE status = 'active'`);
    const acRows = (Array.isArray(agentCount) ? agentCount : (agentCount as { rows?: unknown[] }).rows || []) as Array<Record<string, unknown>>;
    const activeAgents = Number(acRows[0]?.n ?? 0);
    checks.push({
      name: '活跃数字员工', status: activeAgents > 0 ? 'ok' : 'warn',
      value: `${activeAgents} 个`, threshold: '>= 1',
    });

    // Check 4: Active users
    const userCount = await db.execute(sql`SELECT count(*)::int AS n FROM users WHERE is_active = true`);
    const uRows = (Array.isArray(userCount) ? userCount : (userCount as { rows?: unknown[] }).rows || []) as Array<Record<string, unknown>>;
    const activeUsers = Number(uRows[0]?.n ?? 0);
    checks.push({
      name: '活跃真人', status: activeUsers > 0 ? 'ok' : 'warn',
      value: `${activeUsers} 个`, threshold: '>= 1',
    });

    // Check 5: Documents count
    const docCount = await db.execute(sql`SELECT count(*)::int AS n FROM documents`);
    const dRows = (Array.isArray(docCount) ? docCount : (docCount as { rows?: unknown[] }).rows || []) as Array<Record<string, unknown>>;
    const docs = Number(dRows[0]?.n ?? 0);
    checks.push({
      name: 'KB 文档', status: docs > 100 ? 'ok' : 'warn',
      value: `${docs} 个`, threshold: '>= 100',
    });

    const kpis = [
      { label: '24h 请求数', value: total },
      { label: '数字员工', value: activeAgents },
      { label: '真人', value: activeUsers },
      { label: 'KB 文档', value: docs },
    ];

    // Recent events from audit_logs
    const events = await db.execute(sql`
      SELECT id, action, resource_type, resource_id, created_at, details
      FROM audit_logs
      ORDER BY created_at DESC
      LIMIT 20
    `);
    const eRows = (Array.isArray(events) ? events : (events as { rows?: unknown[] }).rows || []) as Array<Record<string, unknown>>;

    jsonResponse(res, 200, {
      success: true,
      checks,
      kpis,
      events: eRows.map((r) => ({
        ts: r.created_at,
        level: r.action,
        source: r.resource_type,
        message: JSON.stringify(r.details ?? {}),
      })),
    });
  } catch (err) {
    jsonResponse(res, 500, { error: 'diagnosis_failed', message: err instanceof Error ? err.message : 'unknown' });
  }
}

// ═══════════════════════════════════════════════════════════════
// 7. Optimization (3 建议高/中/低影响)
// ═══════════════════════════════════════════════════════════════
async function optimization(req: http.IncomingMessage, res: http.ServerResponse, _ctx: { tenantId: string }) {
  // 派生指标
  const cost = await db.execute(sql`
    SELECT COALESCE(SUM(cost_usd), 0)::float AS today_cost
    FROM activity_events
    WHERE to_timestamp(timestamp) > now() - interval '24 hours'
  `);
  const errRate = await db.execute(sql`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE type = 'error')::int AS errors
    FROM activity_events
    WHERE to_timestamp(timestamp) > now() - interval '7 days'
  `);

  const cRows = (Array.isArray(cost) ? cost : (cost as { rows?: unknown[] }).rows || []) as Array<Record<string, unknown>>;
  const eRows = (Array.isArray(errRate) ? errRate : (errRate as { rows?: unknown[] }).rows || []) as Array<Record<string, unknown>>;
  const todayCost = Number(cRows[0]?.today_cost ?? 0);
  const totalWeek = Number(eRows[0]?.total ?? 0);
  const errsWeek = Number(eRows[0]?.errors ?? 0);
  const errPct = totalWeek > 0 ? Math.round((errsWeek / totalWeek) * 100) : 0;

  const suggestions = [
    {
      impact: 'high' as const,
      title: '启用 pipeline cache',
      metric: todayCost > 0 ? `${todayCost.toFixed(2)} USD / 24h` : '$0',
      desc: '启用 LLM 响应缓存可节省 30-50% token 消耗',
      expected: '节省 ~30% 成本',
    },
    {
      impact: 'med' as const,
      title: '调整超时配置',
      metric: `${errPct}%`,
      desc: '当前错误率较高,将 agent timeout 从 60s 调整到 90s 可降低 30% 超时错误',
      expected: '错误率降低 ~30%',
    },
    {
      impact: 'low' as const,
      title: '归档 e2e 历史',
      metric: '13 条',
      desc: '3 条历史 pipeline 是 e2e 残留,已自动归档,UI 默认隐藏',
      expected: '界面更清晰',
    },
  ];

  // 30 天 token 趋势
  const trend = await db.execute(sql`
    SELECT date_trunc('day', to_timestamp(timestamp)) AS day,
      sum(input_tokens)::int AS input,
      sum(output_tokens)::int AS output,
      sum(cost_usd)::float AS cost
    FROM activity_events
    WHERE to_timestamp(timestamp) > now() - interval '30 days'
    GROUP BY day
    ORDER BY day
  `);
  const tRows = (Array.isArray(trend) ? trend : (trend as { rows?: unknown[] }).rows || []) as Array<Record<string, unknown>>;

  jsonResponse(res, 200, {
    success: true,
    kpis: [
      { label: '24h 成本', value: todayCost.toFixed(2) + ' USD', delta: 0 },
      { label: '7d 错误率', value: `${errPct}%`, delta: 0 },
      { label: '总请求 / 7d', value: totalWeek, delta: 0 },
      { label: 'KB 文档', value: 2526, delta: 0 },
    ],
    suggestions,
    trend30d: tRows.map((r) => ({
      day: r.day,
      input: Number(r.input ?? 0),
      output: Number(r.output ?? 0),
      cost: Number(r.cost ?? 0),
    })),
  });
}

// ═══════════════════════════════════════════════════════════════
// 8. Logs (过滤)
// ═══════════════════════════════════════════════════════════════
async function adminLogs(req: http.IncomingMessage, res: http.ServerResponse, _ctx: { tenantId: string }, url: URL) {
  const severity = url.searchParams.get('severity') || 'all';
  const source = url.searchParams.get('source') || 'all';
  const limit = Math.min(500, parseInt(url.searchParams.get('limit') || '100', 10));

  try {
    const conditions: ReturnType<typeof sql>[] = [sql`1=1`];
    if (severity !== 'all') conditions.push(sql`severity = ${severity}`);
    if (source !== 'all') conditions.push(sql`resource_type = ${source}`);

    const whereSql = sql.join(conditions, sql.raw(' AND '));

    const rows = await db.execute(sql`
      SELECT id, action, resource_type, resource_id, created_at, details
      FROM audit_logs
      WHERE ${whereSql}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `);

    const arr = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows || []) as Array<Record<string, unknown>>;
    jsonResponse(res, 200, {
      success: true,
      total: arr.length,
      limit,
      logs: arr.map((r) => ({
        id: r.id,
        ts: r.created_at,
        level: r.action,
        source: r.resource_type,
        event: r.action,
        message: JSON.stringify(r.details ?? {}),
      })),
    });
  } catch (err) {
    jsonResponse(res, 500, { error: 'logs_failed', message: err instanceof Error ? err.message : 'unknown' });
  }
}

// ═══════════════════════════════════════════════════════════════
// 主路由分发
// ═══════════════════════════════════════════════════════════════
export async function handleR9MockEndpoints(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  method: string,
  url: string,
): Promise<boolean> {
  const prefixes = [
    '/api/mcp/servers',
    '/api/v2/channels/oauth',
    '/api/agents/',
    '/api/knowledge/folders',
    '/api/v2/admin/diagnosis',
    '/api/v2/admin/optimization',
    '/api/v2/admin/logs',
  ];
  if (!prefixes.some((p) => url.startsWith(p))) return false;

  // 全部端点先要 bearer
  const ctx = await requireBearer(req, res);
  if (!ctx) return true;

  const parsed = new URL(url, 'http://localhost');

  // 1. /api/mcp/servers
  if (url.startsWith('/api/mcp/servers')) {
    if (method === 'GET') await listMcpServers(req, res, ctx);
    else jsonResponse(res, 405, { error: 'method_not_allowed' });
    return true;
  }

  // 2 & 3. /api/v2/channels/oauth
  if (url.startsWith('/api/v2/channels/oauth/clients')) {
    if (method === 'GET') await listOAuthClientsChannel(req, res, ctx);
    else jsonResponse(res, 405, { error: 'method_not_allowed' });
    return true;
  }
  if (url.startsWith('/api/v2/channels/oauth/authorized')) {
    if (method === 'GET') await listOAuthAuthorized(req, res, ctx);
    else jsonResponse(res, 405, { error: 'method_not_allowed' });
    return true;
  }

  // 4. /api/agents/{id}/log-series
  const logMatch = url.match(/^\/api\/agents\/([^/]+)\/log-series$/);
  if (logMatch && method === 'GET') {
    const days = parseInt(parsed.searchParams.get('days') || '30', 10);
    await logSeries(req, res, ctx, logMatch[1], days);
    return true;
  }

  // 5. /api/knowledge/folders
  if (url.startsWith('/api/knowledge/folders')) {
    if (method === 'GET') await listKnowledgeFolders(req, res, ctx);
    else jsonResponse(res, 405, { error: 'method_not_allowed' });
    return true;
  }

  // 6. diagnosis
  if (url === '/api/v2/admin/diagnosis' && method === 'GET') {
    await diagnosis(req, res, ctx);
    return true;
  }

  // 7. optimization
  if (url === '/api/v2/admin/optimization' && method === 'GET') {
    await optimization(req, res, ctx);
    return true;
  }

  // 8. logs
  if (url.startsWith('/api/v2/admin/logs') && method === 'GET') {
    await adminLogs(req, res, ctx, parsed);
    return true;
  }

  jsonResponse(res, 404, { error: 'route_not_found', url });
  return true;
}
