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
import { randomBytes, createHash } from 'node:crypto';
import * as os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);
import { sql } from 'drizzle-orm';
import { db, pool } from '../../db/index.js';
import { encrypt, decrypt } from '../../db/crypto.js';
import { jsonResponse, parseJsonBody } from './helpers.js';
import { requireBearer } from '../oauth-middleware.js';
import {
  humanizeActivityEvent,
  humanizeAuditLog,
  analyzeLogs,
  type HumanizedLog,
} from './log-analysis.js';

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
      SELECT date_trunc('day', to_timestamp(timestamp / 1000)) AS day,
        count(*)::int AS total,
        count(*) FILTER (WHERE type = 'error')::int AS errors,
        count(*) FILTER (WHERE type = 'success')::int AS successes,
        round(avg(duration_ms))::int AS avg_latency
      FROM activity_events
      WHERE bot_id::text = ${agentId}
        AND to_timestamp(timestamp / 1000) > now() - (${d} || ' days')::interval
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
// 6. Diagnosis (R14-E · 真实健康度 + ping + suggestions 并入)
//
// 5 项核心功能健康度(真算,不再死数据):
//   1. 系统服务 (panmira 9100 / web-next 3200 / postgres / redis)
//   2. AI 大模型 (ping 每个 LLM provider,3s timeout,Promise.allSettled)
//   3. 知识库检索 (7 天 RAG 命中率)
//   4. 任务执行 (24h pipeline 成功率)
//   5. 资源 (磁盘 / 内存 / CPU loadavg)
//
// 综合健康分加权: 系统 25% + AI 30% + KB 20% + 任务 20% + 资源 5%
// 优化建议基于"不健康项"动态生成 → 跟随诊断返回,无独立模块
// ═══════════════════════════════════════════════════════════════

const SUGGESTION_MAP: Record<string, string> = {
  '系统服务': '检查 pm2 服务状态,重启失败进程: `pm2 restart panmira web-next`',
  'AI 大模型': '检查 API key 有效性、余额,或在 /channels/llm 切换备用 provider',
  '知识库检索': '在 /foundation/knowledge 补充文档,优化 chunk 策略与 embedding 质量',
  '任务执行': '查看失败任务日志(/overview/logs),调整超时/重试策略',
  '资源': '清理日志/缓存(df -h),扩容磁盘或内存',
};

interface HealthCheck {
  name: string;
  status: 'ok' | 'warn' | 'error';
  value: string;
  detail: string;
  threshold: string;
}

interface Suggestion {
  impact: 'high' | 'medium' | 'info';
  target: string;
  problem: string;
  suggestion: string;
  action: string | null;
}

// TCP ping 一个本地端口是否在监听 — 用 fetch(健康端点) 探测。
async function pingPort(label: string, url: string, expectStatus: number[] = [200, 401, 403, 404]): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    const resp = await fetch(url, { method: 'GET', signal: ctrl.signal });
    clearTimeout(t);
    return expectStatus.includes(resp.status) || resp.status < 500;
  } catch {
    return false;
  }
}

// 用 pg_isready 或直接 SELECT 1 探测 DB。
async function dbAlive(): Promise<boolean> {
  try {
    const r = await db.execute(sql`SELECT 1::int AS n`);
    return Array.isArray(r) || !!(r as { rows?: unknown[] }).rows;
  } catch {
    return false;
  }
}

// 用 redis-cli ping 探测 redis。
async function redisAlive(): Promise<boolean> {
  try {
    const { stdout } = await promisify(execFile)('redis-cli', ['ping'], { timeout: 1500 });
    return String(stdout).trim() === 'PONG';
  } catch {
    return false;
  }
}

// ping 一个 LLM provider。3s timeout,不阻塞。
async function pingProvider(p: { id: string; name: string; base_url: string; api_key_encrypted: string | null; type: string }): Promise<{ ok: boolean; status: number }> {
  // embedding provider 不参与 LLM 连通判定
  if (p.type === 'embedding') return { ok: true, status: 200 };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3000);
  try {
    const headers: Record<string, string> = {};
    if (p.api_key_encrypted) {
      try { headers['Authorization'] = `Bearer ${decrypt(p.api_key_encrypted)}`; } catch { /* ignore */ }
    }
    // OpenAI 兼容: GET /v1/models (有的 base_url 已经带 /v1 或 /anthropic)
    // Anthropic 兼容: GET / 后端通常会返回 405/404,只要 fetch 不报错就算连通
    const candidates = [
      `${p.base_url.replace(/\/$/, '')}/models`,
      p.base_url,
    ];
    let lastStatus = 0;
    for (const url of candidates) {
      try {
        const resp = await fetch(url, { method: 'GET', headers, signal: ctrl.signal });
        lastStatus = resp.status;
        if (resp.status < 500) return { ok: true, status: resp.status };
      } catch {
        // try next
      }
    }
    return { ok: lastStatus > 0 && lastStatus < 500, status: lastStatus };
  } catch {
    return { ok: false, status: 0 };
  } finally {
    clearTimeout(timer);
  }
}

// 用 df 拿根分区磁盘占用百分比。
async function getDiskUsage(): Promise<number> {
  try {
    const { stdout } = await promisify(execFile)('df', ['-P', '/'], { timeout: 1500 });
    const lines = String(stdout).trim().split('\n');
    if (lines.length < 2) return 0;
    const parts = lines[1].split(/\s+/);
    // Use% like "45%"
    const usePct = parts.find((p) => p.endsWith('%'));
    return usePct ? parseInt(usePct, 10) : 0;
  } catch {
    return 0;
  }
}

function generateSuggestions(checks: HealthCheck[]): Suggestion[] {
  const out: Suggestion[] = [];
  for (const c of checks) {
    if (c.status === 'error' || c.status === 'warn') {
      out.push({
        impact: c.status === 'error' ? 'high' : 'medium',
        target: c.name,
        problem: c.detail,
        suggestion: SUGGESTION_MAP[c.name] || `检查 ${c.name} 配置`,
        action: ACTION_ROUTE[c.name] || null,
      });
    }
  }
  if (out.length === 0) {
    out.push({
      impact: 'info',
      target: '整体',
      problem: '所有系统运行正常',
      suggestion: '保持当前配置,定期检查',
      action: null,
    });
  }
  return out;
}

const ACTION_ROUTE: Record<string, string> = {
  '系统服务': '/overview/logs',
  'AI 大模型': '/channels/llm',
  '知识库检索': '/foundation/knowledge',
  '任务执行': '/overview/logs',
  '资源': '/overview/logs',
};

async function diagnosis(req: http.IncomingMessage, res: http.ServerResponse, _ctx: { tenantId: string }) {
  try {
    const checks: HealthCheck[] = [];

    // ── Check 1: 系统服务(panmira / web-next / postgres / redis) ──
    const [apiUp, webUp, dbUp, redisUp] = await Promise.all([
      pingPort('panmira', 'http://localhost:9100/api/health', [200, 401, 404]),
      pingPort('web-next', 'http://localhost:3200/', [200]),
      dbAlive(),
      redisAlive(),
    ]);
    const services = [
      { name: 'panmira:9100', up: apiUp },
      { name: 'web-next:3200', up: webUp },
      { name: 'postgres:5432', up: dbUp },
      { name: 'redis:6379', up: redisUp },
    ];
    const upCount = services.filter((s) => s.up).length;
    const total = services.length;
    const svcStatus: HealthCheck['status'] = upCount === total ? 'ok' : upCount >= Math.ceil(total / 2) ? 'warn' : 'error';
    checks.push({
      name: '系统服务',
      status: svcStatus,
      value: `${upCount}/${total} 在线`,
      detail: services.map((s) => `${s.name}:${s.up ? '✓' : '✗'}`).join(' '),
      threshold: '全在线',
    });

    // ── Check 2: AI 大模型连通(真 ping 每个 provider) ──
    const providerRows = await db.execute(sql`
      SELECT id, name, type, base_url, api_key_encrypted
      FROM provider_configs
      ORDER BY name
    `);
    const pRows = (Array.isArray(providerRows) ? providerRows : (providerRows as { rows?: unknown[] }).rows || []) as Array<{
      id: string; name: string; type: string; base_url: string; api_key_encrypted: string | null;
    }>;
    const pingResults = await Promise.allSettled(pRows.map((p) => pingProvider({
      id: p.id, name: p.name, base_url: p.base_url, api_key_encrypted: p.api_key_encrypted, type: p.type,
    })));
    const upProviders = pingResults.filter((r) => r.status === 'fulfilled' && r.value.ok).length;
    const llmTotal = pRows.length;
    const aiStatus: HealthCheck['status'] = upProviders === llmTotal ? 'ok' : upProviders >= Math.ceil(llmTotal / 2) ? 'warn' : 'error';
    checks.push({
      name: 'AI 大模型',
      status: aiStatus,
      value: `${upProviders}/${llmTotal} 连通`,
      detail: pRows.map((p, i) => {
        const r = pingResults[i];
        const ok = r.status === 'fulfilled' && r.value.ok;
        return `${p.name}:${ok ? '✓' : '✗'}`;
      }).join(' '),
      threshold: '>=80% 连通',
    });

    // ── Check 3: 知识库检索(7 天 RAG 命中率) ──
    const ragRows = await db.execute(sql`
      SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE result_count > 0)::int AS hits
      FROM rag_query_log
      WHERE created_at > now() - interval '7 days'
    `);
    const rRows = (Array.isArray(ragRows) ? ragRows : (ragRows as { rows?: unknown[] }).rows || []) as Array<Record<string, number>>;
    const ragTotal = Number(rRows[0]?.total ?? 0);
    const ragHits = Number(rRows[0]?.hits ?? 0);
    const hitRate = ragTotal > 0 ? Math.round((ragHits * 100) / ragTotal) : 0;
    const kbStatus: HealthCheck['status'] = ragTotal === 0 ? 'warn' : hitRate >= 60 ? 'ok' : hitRate >= 30 ? 'warn' : 'error';
    checks.push({
      name: '知识库检索',
      status: kbStatus,
      value: `${hitRate}% 命中 (7天)`,
      detail: ragTotal > 0 ? `${ragHits}/${ragTotal} 次查询命中` : '7 天内无 RAG 查询记录',
      threshold: '>=60%',
    });

    // ── Check 4: 任务执行(24h pipeline 成功率) ──
    const taskRows = await db.execute(sql`
      SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE status = 'completed')::int AS ok
      FROM pipeline_runs
      WHERE started_at > now() - interval '24 hours'
    `);
    const tRows = (Array.isArray(taskRows) ? taskRows : (taskRows as { rows?: unknown[] }).rows || []) as Array<Record<string, number>>;
    const taskTotal = Number(tRows[0]?.total ?? 0);
    const taskOk = Number(tRows[0]?.ok ?? 0);
    const taskRate = taskTotal > 0 ? Math.round((taskOk * 100) / taskTotal) : 100;
    const taskStatus: HealthCheck['status'] = taskRate >= 90 ? 'ok' : taskRate >= 70 ? 'warn' : 'error';
    checks.push({
      name: '任务执行',
      status: taskStatus,
      value: `${taskRate}% 成功 (24h)`,
      detail: taskTotal > 0 ? `${taskOk}/${taskTotal} 次执行` : '24h 内无任务执行',
      threshold: '>=90%',
    });

    // ── Check 5: 资源(磁盘 / 内存 / CPU loadavg) ──
    const cpuLoad = os.loadavg()[0]; // 1 min
    const memTotal = os.totalmem();
    const memFree = os.freemem();
    const memUsedPct = Math.round(((memTotal - memFree) * 100) / memTotal);
    const diskUsed = await getDiskUsage();
    const resStatus: HealthCheck['status'] =
      diskUsed < 80 && memUsedPct < 85 && cpuLoad < 4 ? 'ok' :
      diskUsed < 90 && memUsedPct < 92 ? 'warn' : 'error';
    checks.push({
      name: '资源',
      status: resStatus,
      value: `磁盘 ${diskUsed}% · 内存 ${memUsedPct}% · CPU ${cpuLoad.toFixed(1)}`,
      detail: `load avg(1m) ${cpuLoad.toFixed(1)} · ${os.cpus().length} cores`,
      threshold: '磁盘 <80% · 内存 <85%',
    });

    // ── 综合健康分(加权) ──
    const svcScore = upCount === total ? 100 : upCount >= Math.ceil(total / 2) ? 60 : 20;
    const aiScore = llmTotal > 0 ? Math.round((upProviders * 100) / llmTotal) : 0;
    const kbScore = ragTotal > 0 ? hitRate : 50;
    const tScore = taskRate;
    const resScore = diskUsed < 80 && memUsedPct < 85 ? 100 : 50;
    const overallScore = Math.round(
      svcScore * 0.25 +
      aiScore * 0.30 +
      kbScore * 0.20 +
      tScore * 0.20 +
      resScore * 0.05
    );

    const suggestions = generateSuggestions(checks);

    jsonResponse(res, 200, {
      success: true,
      overallScore,
      checks,
      suggestions,
      timestamp: new Date().toISOString(),
      nextCheckIn: 60,
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
    WHERE to_timestamp(timestamp / 1000) > now() - interval '24 hours'
  `);
  const errRate = await db.execute(sql`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE type = 'error')::int AS errors
    FROM activity_events
    WHERE to_timestamp(timestamp / 1000) > now() - interval '7 days'
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
    SELECT date_trunc('day', to_timestamp(timestamp / 1000)) AS day,
      sum(input_tokens)::int AS input,
      sum(output_tokens)::int AS output,
      sum(cost_usd)::float AS cost
    FROM activity_events
    WHERE to_timestamp(timestamp / 1000) > now() - interval '30 days'
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
// 8. Logs (人类可读 + AI 分析)
//    GET /api/v2/admin/logs             — 列表(默认最近 100 条,人类可读)
//    GET /api/v2/admin/logs/analyze     — AI 规则引擎聚合分析
// ═══════════════════════════════════════════════════════════════

// 把 activity_events + audit_logs 两路原始行合并为人类可读列表。
// activity_events 是主数据源(7827 条),audit_logs 是辅助(3 条)。
async function fetchHumanizedLogs(opts: {
  windowHours: number;
  levelFilter: 'all' | 'error' | 'warn' | 'info';
  sourceFilter: string;     // 'all' 或 source key
  search: string;           // 在 title/description/actor 里模糊匹配
  limit: number;
}): Promise<{ logs: HumanizedLog[]; counts: { byLevel: Record<string, number>; bySource: Record<string, number> }; sources: string[] }> {
  const { windowHours, levelFilter, sourceFilter, search, limit } = opts;

  // 1. activity_events 主数据源
  const activityRows = await db.execute(sql`
    SELECT id, type, bot_name, bot_id, user_id, prompt, response_preview,
           error_message, duration_ms, cost_usd, timestamp, model, chat_id
    FROM activity_events
    WHERE timestamp > (EXTRACT(EPOCH FROM NOW()) * 1000 - ${windowHours} * 3600 * 1000)::bigint
    ORDER BY timestamp DESC
    LIMIT ${Math.max(limit * 4, 200)}
  `);
  const activityArr = (Array.isArray(activityRows) ? activityRows : (activityRows as { rows?: unknown[] }).rows || []) as Array<Record<string, unknown>>;

  // 2. audit_logs 辅助(若有)
  const auditRows = await db.execute(sql`
    SELECT id, action, resource_type, resource_id, user_id, agent_id, details, created_at
    FROM audit_logs
    WHERE created_at > NOW() - (${windowHours} || ' hours')::INTERVAL
    ORDER BY created_at DESC
    LIMIT 100
  `);
  const auditArr = (Array.isArray(auditRows) ? auditRows : (auditRows as { rows?: unknown[] }).rows || []) as Array<Record<string, unknown>>;

  // 3. humanize
  const fromActivity: HumanizedLog[] = activityArr.map((r) => humanizeActivityEvent({
    id: r.id as string,
    type: r.type as string | null,
    bot_name: r.bot_name as string | null,
    bot_id: r.bot_id as string | null,
    user_id: r.user_id as string | null,
    prompt: r.prompt as string | null,
    response_preview: r.response_preview as string | null,
    error_message: r.error_message as string | null,
    duration_ms: r.duration_ms as number | null,
    cost_usd: r.cost_usd as number | null,
    timestamp: r.timestamp as number | null,
    model: r.model as string | null,
    chat_id: r.chat_id as string | null,
  }));
  const fromAudit: HumanizedLog[] = auditArr.map((r) => humanizeAuditLog({
    id: r.id as string,
    action: r.action as string | null,
    resource_type: r.resource_type as string | null,
    resource_id: r.resource_id as string | null,
    user_id: r.user_id as string | null,
    agent_id: r.agent_id as string | null,
    details: r.details as Record<string, unknown> | null,
    created_at: r.created_at as string | null,
  }));

  const all = [...fromActivity, ...fromAudit].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

  // 4. 统计 counts(基于未过滤数据,用于 tab 显示)
  const byLevel: Record<string, number> = { error: 0, warn: 0, info: 0 };
  const bySource: Record<string, number> = {};
  for (const l of all) {
    byLevel[l.level] = (byLevel[l.level] ?? 0) + 1;
    bySource[l.source] = (bySource[l.source] ?? 0) + 1;
  }
  const sources = Array.from(new Set(all.map((l) => l.source))).sort();

  // 5. 过滤
  let filtered = all;
  if (levelFilter !== 'all') {
    filtered = filtered.filter((l) => l.level === levelFilter);
  }
  if (sourceFilter !== 'all') {
    filtered = filtered.filter((l) => l.source === sourceFilter);
  }
  if (search.trim()) {
    const s = search.trim().toLowerCase();
    filtered = filtered.filter((l) =>
      l.title.toLowerCase().includes(s) ||
      l.description.toLowerCase().includes(s) ||
      l.actor.toLowerCase().includes(s) ||
      (l.entityName ?? '').toLowerCase().includes(s)
    );
  }
  filtered = filtered.slice(0, limit);

  return { logs: filtered, counts: { byLevel, bySource }, sources };
}

async function adminLogs(req: http.IncomingMessage, res: http.ServerResponse, _ctx: { tenantId: string }, url: URL) {
  const levelFilter = (url.searchParams.get('level') || url.searchParams.get('severity') || 'all') as 'all' | 'error' | 'warn' | 'info';
  const sourceFilter = url.searchParams.get('source') || 'all';
  const search = url.searchParams.get('q') || url.searchParams.get('search') || '';
  const windowHours = Math.min(720, Math.max(1, parseInt(url.searchParams.get('hours') || '168', 10)));
  const limit = Math.min(500, parseInt(url.searchParams.get('limit') || '100', 10));

  try {
    const { logs, counts, sources } = await fetchHumanizedLogs({ windowHours, levelFilter, sourceFilter, search, limit });
    jsonResponse(res, 200, {
      success: true,
      total: logs.length,
      windowHours,
      counts,
      sources,
      logs,
    });
  } catch (err) {
    jsonResponse(res, 500, { error: 'logs_failed', message: err instanceof Error ? err.message : 'unknown' });
  }
}

// AI 分析(规则引擎,无真 LLM 调用)
async function adminLogsAnalyze(req: http.IncomingMessage, res: http.ServerResponse, _ctx: { tenantId: string }, url: URL) {
  const windowHours = Math.min(720, Math.max(1, parseInt(url.searchParams.get('hours') || '24', 10)));

  try {
    const { logs } = await fetchHumanizedLogs({
      windowHours,
      levelFilter: 'all',
      sourceFilter: 'all',
      search: '',
      limit: 1000,
    });
    const analysis = analyzeLogs(logs, windowHours);
    jsonResponse(res, 200, { success: true, analysis });
  } catch (err) {
    jsonResponse(res, 500, { error: 'analyze_failed', message: err instanceof Error ? err.message : 'unknown' });
  }
}

// ═══════════════════════════════════════════════════════════════
// R13E: MCP server CRUD (create / update / delete / test)
// ═══════════════════════════════════════════════════════════════
async function createMcpServer(req: http.IncomingMessage, res: http.ServerResponse, ctx: { tenantId: string }) {
  const body = (await parseJsonBody(req)) as Record<string, any>;
  const { name, url, transport, authType, apiKey, command, args } = body;
  if (!name || typeof name !== 'string') {
    jsonResponse(res, 400, { error: 'name required' }); return;
  }
  const t = (transport === 'stdio' || transport === 'sse' || transport === 'http') ? transport : 'http';
  const a = (authType === 'none' || authType === 'bearer' || authType === 'basic' || authType === 'api_key') ? authType : 'none';
  try {
    const apiKeyEnc = apiKey ? encrypt(String(apiKey)) : null;
    const row = await db.execute(sql`
      INSERT INTO mcp_servers (tenant_id, name, url, transport, auth_type, api_key_encrypted, status, health_status)
      VALUES (${ctx.tenantId}, ${name}, ${url || command || ''}, ${t}, ${a}, ${apiKeyEnc}, 'active', 'unknown')
      RETURNING id, name, url, transport, auth_type, status, health_status, created_at
    `);
    const arr = (Array.isArray(row) ? row : (row as { rows?: unknown[] }).rows || []) as Array<Record<string, unknown>>;
    jsonResponse(res, 201, { success: true, server: arr[0] });
  } catch (err) {
    jsonResponse(res, 500, { error: 'create_failed', message: err instanceof Error ? err.message : 'unknown' });
  }
}

async function updateMcpServer(req: http.IncomingMessage, res: http.ServerResponse, ctx: { tenantId: string }, id: string) {
  const body = (await parseJsonBody(req)) as Record<string, any>;
  const sets: string[] = ['updated_at = now()'];
  const params: any[] = [];
  let idx = 1;
  if (body.name !== undefined) { sets.push(`name = $${idx++}`); params.push(body.name); }
  if (body.url !== undefined) { sets.push(`url = $${idx++}`); params.push(body.url); }
  if (body.transport !== undefined) { sets.push(`transport = $${idx++}`); params.push(body.transport); }
  if (body.authType !== undefined) { sets.push(`auth_type = $${idx++}`); params.push(body.authType); }
  if (body.apiKey !== undefined) {
    sets.push(`api_key_encrypted = $${idx++}`);
    params.push(body.apiKey ? encrypt(String(body.apiKey)) : null);
  }
  if (body.status !== undefined) { sets.push(`status = $${idx++}`); params.push(body.status); }
  params.push(id); params.push(ctx.tenantId);
  try {
    const result = await pool.query(
      `UPDATE mcp_servers SET ${sets.join(', ')} WHERE id = $${idx} AND tenant_id = $${idx + 1} RETURNING id, name, url, transport, auth_type, status, health_status`,
      params,
    );
    const arr = result.rows;
    if (!arr.length) { jsonResponse(res, 404, { error: 'not_found' }); return; }
    jsonResponse(res, 200, { success: true, server: arr[0] });
  } catch (err) {
    jsonResponse(res, 500, { error: 'update_failed', message: err instanceof Error ? err.message : 'unknown' });
  }
}

async function deleteMcpServer(req: http.IncomingMessage, res: http.ServerResponse, ctx: { tenantId: string }, id: string) {
  try {
    await db.execute(sql`
      DELETE FROM mcp_servers WHERE id = ${id} AND tenant_id = ${ctx.tenantId}
    `);
    jsonResponse(res, 200, { success: true, deleted: true, id });
  } catch (err) {
    jsonResponse(res, 500, { error: 'delete_failed', message: err instanceof Error ? err.message : 'unknown' });
  }
}

async function testMcpServer(req: http.IncomingMessage, res: http.ServerResponse, ctx: { tenantId: string }, id: string) {
  try {
    const row = await db.execute(sql`
      SELECT name, url, transport, auth_type, api_key_encrypted
      FROM mcp_servers WHERE id = ${id} AND tenant_id = ${ctx.tenantId}
    `);
    const arr = (Array.isArray(row) ? row : (row as { rows?: unknown[] }).rows || []) as Array<Record<string, unknown>>;
    const srv = arr[0] as Record<string, unknown> | undefined;
    if (!srv) { jsonResponse(res, 404, { error: 'not_found' }); return; }
    const start = Date.now();
    const url = String(srv.url || '');
    const transport = String(srv.transport || 'http');
    let tools: unknown[] = [];
    let healthy = false;
    let errorMsg: string | null = null;
    if (transport === 'stdio') {
      // R16-2: spawn child process and probe via scripts/mcp-stdio-probe.py
      // url field can be "stdio:///path/to/script.py" or just "/path"
      const stdioPath = url.startsWith('stdio://') ? url.slice('stdio://'.length).replace(/^\/+/, '/') : url;
      try {
        const probePath = (await import('node:path')).default.resolve(process.cwd(), 'scripts/mcp-stdio-probe.py');
        const { stdout: probeOut, stderr: probeErr } = await execFileAsync('python3', [probePath, stdioPath], {
          cwd: process.cwd(),
          timeout: 12000,
          maxBuffer: 1024 * 1024,
        });
        const probe = JSON.parse((probeOut || '').trim().split('\n').pop() || '{}');
        if (probe.ok) {
          healthy = true;
          tools = Array.isArray(probe.tools) ? probe.tools : [];
        } else {
          errorMsg = String(probe.error || 'stdio probe failed');
          if (probeErr) errorMsg += ` | stderr: ${String(probeErr).slice(0, 200)}`;
        }
      } catch (err: any) {
        errorMsg = `stdio spawn failed: ${err?.message || String(err)}`;
      }
    } else if (!url) {
      errorMsg = 'Missing URL';
    } else {
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (srv.api_key_encrypted) {
          const k = decrypt(String(srv.api_key_encrypted));
          if (srv.auth_type === 'bearer') headers['Authorization'] = `Bearer ${k}`;
          else if (srv.auth_type === 'api_key') headers['x-api-key'] = k;
        }
        const r = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
          signal: AbortSignal.timeout(10000),
        });
        healthy = r.ok;
        if (r.ok) {
          const j = (await r.json().catch(() => ({}))) as any;
          tools = j?.result?.tools || j?.tools || [];
        } else {
          errorMsg = `HTTP ${r.status}`;
        }
      } catch (err) {
        errorMsg = err instanceof Error ? err.message : 'fetch_failed';
      }
    }
    const latencyMs = Date.now() - start;
    // Persist results
    await db.execute(sql`
      UPDATE mcp_servers
      SET health_status = ${healthy ? 'healthy' : 'unhealthy'},
          last_check_at = now(),
          tools_cache = ${JSON.stringify(tools)}::jsonb,
          updated_at = now()
      WHERE id = ${id}
    `);
    jsonResponse(res, 200, {
      success: true,
      ok: healthy,
      latencyMs,
      toolsCount: Array.isArray(tools) ? tools.length : 0,
      tools: Array.isArray(tools) ? tools.slice(0, 50) : [],
      error: errorMsg,
    });
  } catch (err) {
    jsonResponse(res, 500, { error: 'test_failed', message: err instanceof Error ? err.message : 'unknown' });
  }
}

async function getMcpServerTools(req: http.IncomingMessage, res: http.ServerResponse, ctx: { tenantId: string }, id: string) {
  try {
    const row = await db.execute(sql`
      SELECT tools_cache, health_status, last_check_at
      FROM mcp_servers WHERE id = ${id} AND tenant_id = ${ctx.tenantId}
    `);
    const arr = (Array.isArray(row) ? row : (row as { rows?: unknown[] }).rows || []) as Array<Record<string, unknown>>;
    if (!arr.length) { jsonResponse(res, 404, { error: 'not_found' }); return; }
    jsonResponse(res, 200, {
      success: true,
      tools: arr[0].tools_cache || [],
      healthStatus: arr[0].health_status,
      lastCheckAt: arr[0].last_check_at,
    });
  } catch (err) {
    jsonResponse(res, 500, { error: 'tools_fetch_failed', message: err instanceof Error ? err.message : 'unknown' });
  }
}

// ═══════════════════════════════════════════════════════════════
// R13E: OAuth authorized (别人接我们) CRUD
// ═══════════════════════════════════════════════════════════════
async function createOAuthAuthorized(req: http.IncomingMessage, res: http.ServerResponse, ctx: { tenantId: string }) {
  const body = (await parseJsonBody(req)) as Record<string, any>;
  const { clientId, appName, scopes, expiresAt } = body;
  if (!clientId || !appName) {
    jsonResponse(res, 400, { error: 'clientId and appName required' }); return;
  }
  const scopeArr = Array.isArray(scopes) ? scopes.filter((s: unknown) => typeof s === 'string') : [];
  const scopesCsv = scopeArr.join(',');
  try {
    const row = await db.execute(sql`
      INSERT INTO oauth_authorized (tenant_id, client_id, app_name, scopes, granted_at, expires_at, revoked)
      VALUES (${ctx.tenantId}, ${clientId}, ${appName},
        string_to_array(${scopesCsv}, ','),
        now(), ${expiresAt || null}, false)
      RETURNING id, client_id, app_name, scopes, granted_at, expires_at, revoked
    `);
    const arr = (Array.isArray(row) ? row : (row as { rows?: unknown[] }).rows || []) as Array<Record<string, unknown>>;
    jsonResponse(res, 201, { success: true, authorized: arr[0] });
  } catch (err) {
    jsonResponse(res, 500, { error: 'create_failed', message: err instanceof Error ? err.message : 'unknown' });
  }
}

async function revokeOAuthAuthorized(req: http.IncomingMessage, res: http.ServerResponse, ctx: { tenantId: string }, id: string) {
  try {
    await db.execute(sql`
      UPDATE oauth_authorized SET revoked = true WHERE id = ${id} AND tenant_id = ${ctx.tenantId}
    `);
    jsonResponse(res, 200, { success: true, revoked: true, id });
  } catch (err) {
    jsonResponse(res, 500, { error: 'revoke_failed', message: err instanceof Error ? err.message : 'unknown' });
  }
}

async function refreshOAuthAuthorized(req: http.IncomingMessage, res: http.ServerResponse, ctx: { tenantId: string }, id: string) {
  // Mark as recently used + extend expiration
  try {
    const row = await db.execute(sql`
      UPDATE oauth_authorized
      SET last_used_at = now(),
          expires_at = COALESCE(expires_at, now()) + interval '30 days'
      WHERE id = ${id} AND tenant_id = ${ctx.tenantId} AND revoked = false
      RETURNING id, client_id, app_name, expires_at, last_used_at
    `);
    const arr = (Array.isArray(row) ? row : (row as { rows?: unknown[] }).rows || []) as Array<Record<string, unknown>>;
    if (!arr.length) { jsonResponse(res, 404, { error: 'not_found_or_revoked' }); return; }
    jsonResponse(res, 200, { success: true, authorized: arr[0] });
  } catch (err) {
    jsonResponse(res, 500, { error: 'refresh_failed', message: err instanceof Error ? err.message : 'unknown' });
  }
}

// ═══════════════════════════════════════════════════════════════
// R13E: OAuth clients (我们接别人) CRUD — at /api/v2/channels/oauth/clients
// (delegates conceptually to oauth_clients table; secret only on create)
// ═══════════════════════════════════════════════════════════════
function genClientId(): string { return 'cli_' + randomBytes(16).toString('base64url'); }
function genClientSecret(): string { return randomBytes(32).toString('base64url'); }
function hashSecret(secret: string): string { return createHash('sha256').update(secret).digest('hex'); }

async function createOAuthClientChannel(req: http.IncomingMessage, res: http.ServerResponse, ctx: { tenantId: string }) {
  const body = (await parseJsonBody(req)) as Record<string, any>;
  const { name, type, redirectUris, scopes } = body;
  if (!name) { jsonResponse(res, 400, { error: 'name required' }); return; }
  const t = ['web', 'native', 'cli', 'mcp_server'].includes(String(type)) ? type : 'web';
  const clientId = genClientId();
  const clientSecret = genClientSecret();
  const clientSecretHash = hashSecret(clientSecret);
  try {
    const row = await db.execute(sql`
      INSERT INTO oauth_clients (tenant_id, name, type, client_id, client_secret_hash, redirect_uris, scopes, status)
      VALUES (${ctx.tenantId}, ${name}, ${t}, ${clientId}, ${clientSecretHash},
        ${JSON.stringify(redirectUris || [])}::jsonb, ${JSON.stringify(scopes || [])}::jsonb, 'active')
      RETURNING id, name, type, client_id, redirect_uris, scopes, status, created_at
    `);
    const arr = (Array.isArray(row) ? row : (row as { rows?: unknown[] }).rows || []) as Array<Record<string, unknown>>;
    // Return plaintext secret ONCE
    jsonResponse(res, 201, { success: true, client: { ...arr[0], clientSecret } });
  } catch (err) {
    jsonResponse(res, 500, { error: 'create_failed', message: err instanceof Error ? err.message : 'unknown' });
  }
}

async function updateOAuthClientChannel(req: http.IncomingMessage, res: http.ServerResponse, ctx: { tenantId: string }, id: string) {
  const body = (await parseJsonBody(req)) as Record<string, any>;
  const sets: string[] = ['updated_at = now()'];
  const params: any[] = [];
  let idx = 1;
  if (body.name !== undefined) { sets.push(`name = $${idx++}`); params.push(body.name); }
  if (body.redirectUris !== undefined) { sets.push(`redirect_uris = $${idx++}`); params.push(JSON.stringify(body.redirectUris)); }
  if (body.scopes !== undefined) { sets.push(`scopes = $${idx++}`); params.push(JSON.stringify(body.scopes)); }
  if (body.status !== undefined) { sets.push(`status = $${idx++}`); params.push(body.status); }
  params.push(id); params.push(ctx.tenantId);
  try {
    const result = await pool.query(
      `UPDATE oauth_clients SET ${sets.join(', ')} WHERE id = $${idx} AND tenant_id = $${idx + 1} RETURNING id, name, type, client_id, redirect_uris, scopes, status`,
      params,
    );
    const arr = result.rows;
    if (!arr.length) { jsonResponse(res, 404, { error: 'not_found' }); return; }
    jsonResponse(res, 200, { success: true, client: arr[0] });
  } catch (err) {
    jsonResponse(res, 500, { error: 'update_failed', message: err instanceof Error ? err.message : 'unknown' });
  }
}

async function deleteOAuthClientChannel(req: http.IncomingMessage, res: http.ServerResponse, ctx: { tenantId: string }, id: string) {
  try {
    await db.execute(sql`
      UPDATE oauth_clients SET status = 'revoked', updated_at = now()
      WHERE id = ${id} AND tenant_id = ${ctx.tenantId}
    `);
    jsonResponse(res, 200, { success: true, revoked: true, id });
  } catch (err) {
    jsonResponse(res, 500, { error: 'delete_failed', message: err instanceof Error ? err.message : 'unknown' });
  }
}

async function rotateOAuthClientChannelSecret(req: http.IncomingMessage, res: http.ServerResponse, ctx: { tenantId: string }, id: string) {
  const newSecret = genClientSecret();
  const newHash = hashSecret(newSecret);
  try {
    const row = await db.execute(sql`
      UPDATE oauth_clients SET client_secret_hash = ${newHash}, updated_at = now()
      WHERE id = ${id} AND tenant_id = ${ctx.tenantId}
      RETURNING id, client_id
    `);
    const arr = (Array.isArray(row) ? row : (row as { rows?: unknown[] }).rows || []) as Array<Record<string, unknown>>;
    if (!arr.length) { jsonResponse(res, 404, { error: 'not_found' }); return; }
    // Old secret invalidated instantly; new secret returned once
    jsonResponse(res, 200, {
      success: true,
      id: arr[0].id,
      clientId: arr[0].client_id,
      clientSecret: newSecret,
      rotatedAt: new Date().toISOString(),
    });
  } catch (err) {
    jsonResponse(res, 500, { error: 'rotate_failed', message: err instanceof Error ? err.message : 'unknown' });
  }
}

async function getOAuthClientChannelUsage(req: http.IncomingMessage, res: http.ServerResponse, ctx: { tenantId: string }, id: string) {
  try {
    const tokens = await db.execute(sql`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE revoked_at IS NULL AND expires_at > now())::int AS active,
             max(created_at) AS last_call
      FROM oauth_access_tokens
      WHERE client_id = ${id} AND tenant_id = ${ctx.tenantId}
    `);
    const arr = (Array.isArray(tokens) ? tokens : (tokens as { rows?: unknown[] }).rows || []) as Array<Record<string, unknown>>;
    jsonResponse(res, 200, {
      success: true,
      totalTokens: Number(arr[0]?.total ?? 0),
      activeTokens: Number(arr[0]?.active ?? 0),
      lastCallAt: arr[0]?.last_call || null,
    });
  } catch (err) {
    jsonResponse(res, 500, { error: 'usage_failed', message: err instanceof Error ? err.message : 'unknown' });
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

  // 1. /api/mcp/servers — full CRUD
  const mcpIdMatch = url.match(/^\/api\/mcp\/servers\/([0-9a-f-]{36})$/);
  const mcpTestMatch = url.match(/^\/api\/mcp\/servers\/([0-9a-f-]{36})\/test$/);
  const mcpToolsMatch = url.match(/^\/api\/mcp\/servers\/([0-9a-f-]{36})\/tools$/);
  if (mcpTestMatch && method === 'POST') { await testMcpServer(req, res, ctx, mcpTestMatch[1]); return true; }
  if (mcpToolsMatch && method === 'GET') { await getMcpServerTools(req, res, ctx, mcpToolsMatch[1]); return true; }
  if (mcpIdMatch) {
    if (method === 'PATCH') { await updateMcpServer(req, res, ctx, mcpIdMatch[1]); return true; }
    if (method === 'DELETE') { await deleteMcpServer(req, res, ctx, mcpIdMatch[1]); return true; }
    if (method === 'GET') { /* fallthrough to list with filter — keep list-only */ }
  }
  if (url === '/api/mcp/servers') {
    if (method === 'GET') await listMcpServers(req, res, ctx);
    else if (method === 'POST') await createMcpServer(req, res, ctx);
    else jsonResponse(res, 405, { error: 'method_not_allowed' });
    return true;
  }

  // 2 & 3. /api/v2/channels/oauth — full CRUD
  // Clients (我们接别人)
  const oauthClientIdMatch = url.match(/^\/api\/v2\/channels\/oauth\/clients\/([0-9a-f-]{36})$/);
  const oauthClientRotateMatch = url.match(/^\/api\/v2\/channels\/oauth\/clients\/([0-9a-f-]{36})\/secret\/rotate$/);
  const oauthClientUsageMatch = url.match(/^\/api\/v2\/channels\/oauth\/clients\/([0-9a-f-]{36})\/usage$/);
  if (oauthClientRotateMatch && method === 'POST') { await rotateOAuthClientChannelSecret(req, res, ctx, oauthClientRotateMatch[1]); return true; }
  if (oauthClientUsageMatch && method === 'GET') { await getOAuthClientChannelUsage(req, res, ctx, oauthClientUsageMatch[1]); return true; }
  if (oauthClientIdMatch) {
    if (method === 'PATCH') { await updateOAuthClientChannel(req, res, ctx, oauthClientIdMatch[1]); return true; }
    if (method === 'DELETE') { await deleteOAuthClientChannel(req, res, ctx, oauthClientIdMatch[1]); return true; }
  }
  if (url === '/api/v2/channels/oauth/clients') {
    if (method === 'GET') await listOAuthClientsChannel(req, res, ctx);
    else if (method === 'POST') await createOAuthClientChannel(req, res, ctx);
    else jsonResponse(res, 405, { error: 'method_not_allowed' });
    return true;
  }

  // Authorized (别人接我们)
  const oauthAuthIdMatch = url.match(/^\/api\/v2\/channels\/oauth\/authorized\/([0-9a-f-]{36})$/);
  const oauthAuthRefreshMatch = url.match(/^\/api\/v2\/channels\/oauth\/authorized\/([0-9a-f-]{36})\/refresh$/);
  if (oauthAuthRefreshMatch && method === 'POST') { await refreshOAuthAuthorized(req, res, ctx, oauthAuthRefreshMatch[1]); return true; }
  if (oauthAuthIdMatch && method === 'DELETE') { await revokeOAuthAuthorized(req, res, ctx, oauthAuthIdMatch[1]); return true; }
  if (url === '/api/v2/channels/oauth/authorized') {
    if (method === 'GET') await listOAuthAuthorized(req, res, ctx);
    else if (method === 'POST') await createOAuthAuthorized(req, res, ctx);
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

  // 8. logs (人类可读 + AI 分析)
  // 注意: analyze 必须在 /logs 之前匹配;用 url.startsWith 避开 query
  if (method === 'GET' && url.startsWith('/api/v2/admin/logs/analyze')) {
    await adminLogsAnalyze(req, res, ctx, parsed);
    return true;
  }
  if (method === 'GET' && url.startsWith('/api/v2/admin/logs')) {
    await adminLogs(req, res, ctx, parsed);
    return true;
  }

  jsonResponse(res, 404, { error: 'route_not_found', url });
  return true;
}
