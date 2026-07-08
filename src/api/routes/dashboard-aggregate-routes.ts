/**
 * R14-A · Dashboard Aggregate (2026-07-08)
 *
 * Single endpoint that returns everything the new full-screen dashboard needs:
 *   GET /api/v2/admin/dashboard-aggregate
 *
 * Response:
 *   { kpis, trend, health, topAgents, topEmployees, topDocuments,
 *     todo, alerts, completed,
 *     // legacy compat (kept but no longer rendered):
 *     recentPipelines, recentAudit, recentSessions }
 *
 * R14-A changes:
 *   - 去占位 (cache 82% / WebSocket "在线" / Memory 三层 全删)
 *   - health 6 项, 全部真算: 系统服务 / AI 大模型 / 知识库检索 / 任务执行 / 资源 / 正式员工活跃
 *   - 底部 3 列重做: todo / alerts / completed
 *   - dynamic 60s polling by frontend (this endpoint stays stateless)
 *
 * All queries are read-only. requireBearer — admin has '*' scope so passes.
 */
import type * as http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import { exec } from 'node:child_process';
import { sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { jsonResponse } from './helpers.js';
import { requireBearer } from '../oauth-middleware.js';

// ── helpers ──────────────────────────────────────────────────────
function asArr(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (result && typeof result === 'object' && 'rows' in result) {
    const rows = (result as { rows: unknown }).rows;
    if (Array.isArray(rows)) return rows as Record<string, unknown>[];
  }
  return [];
}

function toInt(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : fallback;
}

function toNum(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : fallback;
}

function toISO(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  const t = typeof v === 'number' ? v : null;
  if (t !== null && t > 0) {
    return new Date(t < 1e12 ? t * 1000 : t).toISOString();
  }
  return String(v);
}

function toStr(v: unknown, fallback = ''): string {
  if (v === null || v === undefined) return fallback;
  return String(v);
}

// Fill missing days in a 30-day series so the area chart stays continuous.
function fillDays(
  rows: Array<Record<string, unknown>>,
  valueKey: string,
  zeroShape: Record<string, unknown>,
): Array<Record<string, unknown>> {
  const byDay = new Map<string, Record<string, unknown>>();
  for (const r of rows) {
    const day = toStr(r.day);
    byDay.set(day, { ...r, day });
  }
  const out: Array<Record<string, unknown>> = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    if (byDay.has(key)) {
      out.push(byDay.get(key)!);
    } else {
      out.push({ ...zeroShape, day: key, [valueKey]: 0 });
    }
  }
  return out;
}

// ── health probes ────────────────────────────────────────────────

/** TCP port probe with timeout. Returns true if connection succeeds. */
function probePort(host: string, port: number, timeoutMs = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, host);
  });
}

/** Generic URL probe — issues a HEAD/GET and treats any 2xx/4xx as "reachable". */
async function probeUrl(url: string, timeoutMs = 3000): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    // Use HEAD when supported; some Anthropic-compatible endpoints require POST.
    // We treat 2xx/4xx/5xx-with-response as "reachable" (DNS+TLS+HTTP up).
    // Only network errors (throw) count as unreachable.
    const res = await fetch(url, {
      method: 'HEAD',
      signal: ctrl.signal,
      headers: { 'user-agent': 'panmira-healthcheck/1.0' },
    });
    return res.status < 500;
  } catch {
    try {
      // Retry with GET if HEAD returned 405 / errored on method.
      const res = await fetch(url, {
        method: 'GET',
        signal: ctrl.signal,
        headers: { 'user-agent': 'panmira-healthcheck/1.0' },
      });
      return res.status < 500;
    } catch {
      return false;
    }
  } finally {
    clearTimeout(timer);
  }
}

interface ProviderRow {
  id: string;
  name: string;
  type: string;
  baseUrl: string;
}

/** Probe each LLM provider; returns {reachable, total, list}. */
async function probeAiProviders(): Promise<{
  reachable: number;
  total: number;
  list: Array<{ name: string; ok: boolean }>;
}> {
  const rows = asArr(
    await db.execute(sql`
      SELECT id, name, type, base_url
      FROM provider_configs
      WHERE type IN ('LLM', 'openai', 'anthropic')
    `),
  );
  const providers: ProviderRow[] = rows.map((r) => ({
    id: toStr(r.id),
    name: toStr(r.name),
    type: toStr(r.type),
    baseUrl: toStr(r.base_url),
  }));
  const results = await Promise.allSettled(
    providers.map(async (p) => {
      // Probe the /v1/models; treat any HTTP response as reachable.
      const probeTarget = p.baseUrl.replace(/\/$/, '') + '/v1/models';
      return { name: p.name, ok: await probeUrl(probeTarget, 3000) };
    }),
  );
  const list = results.map((r) =>
    r.status === 'fulfilled' ? r.value : { name: '?', ok: false },
  );
  const reachable = list.filter((x) => x.ok).length;
  return { reachable, total: providers.length, list };
}

/** Disk usage percent via `df -P /` parsed. Falls back to 0 on error. */
function diskUsagePercent(): Promise<number> {
  return new Promise((resolve) => {
    exec("df -P / | awk 'NR==2 {print $5}'", (err, stdout) => {
      if (err) return resolve(0);
      const pct = parseInt(stdout.trim().replace('%', ''), 10);
      resolve(Number.isFinite(pct) ? pct : 0);
    });
  });
}

/** Memory usage percent from Node os module. */
function memoryUsagePercent(): { usedPct: number; totalGb: number; usedGb: number } {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  return {
    usedPct: total > 0 ? Math.round((used / total) * 100) : 0,
    totalGb: Number((total / 1024 ** 3).toFixed(1)),
    usedGb: Number((used / 1024 ** 3).toFixed(1)),
  };
}

/** CPU load avg (1min) normalized against core count. */
function cpuLoadPercent(): { pct: number; cores: number; load1: number } {
  const cores = os.cpus().length;
  const load1 = os.loadavg()[0] ?? 0;
  // On Linux loadavg is relative to cores; pct = load/cores * 100.
  const pct = cores > 0 ? Math.min(100, Math.round((load1 / cores) * 100)) : 0;
  return { pct, cores, load1: Number(load1.toFixed(2)) };
}

// ── main handler ─────────────────────────────────────────────────
export async function handleDashboardAggregateRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  method: string,
  url: string,
): Promise<boolean> {
  const u = new URL(url, 'http://localhost');
  if (!u.pathname.startsWith('/api/v2/admin/dashboard-aggregate')) return false;
  if (method !== 'GET') {
    jsonResponse(res, 405, { error: 'method_not_allowed' });
    return true;
  }

  const ctx = await requireBearer(req, res);
  if (!ctx) return true;
  // requireBearer already enforces auth; admin has '*' scope. We don't gate
  // further — operator/member with reports:read would be allowed by spec,
  // but the surface is read-only and tenant-scoped queries below use no
  // tenant filter (single-tenant deployment, same as R9/R10).

  try {
    // ── Fire all DB queries in parallel ──
    // Health probes (TCP/HTTP/df) are fired separately afterwards to keep
    // the aggregate snappy even if a provider is slow.
    const [
      employeesRaw, agentsRaw, pipelinesRaw, documentsRaw,
      calls24hRaw, rag30dRaw,
      trendCallsRaw, trendErrorsRaw, trendTokensRaw, trendCostRaw,
      topAgentsRaw, topEmployeesRaw, topDocumentsRaw,
      recentPipelinesRaw, recentAuditRaw, recentSessionsRaw,
      // R14-A new queries: bottom 3 columns + health inputs
      todoRaw, completedRaw, failed24hRaw, errorUsers24hRaw, staleDocsRaw,
      employeesActive24hRaw, pipelineStats24hRaw, dbPingMs,
    ] = await Promise.all([
      // ── KPIs ──
      db.execute(sql`
        SELECT count(*)::int AS total,
               count(*) FILTER (WHERE employee_status = 'active')::int AS active
        FROM users
      `),
      db.execute(sql`
        SELECT count(*)::int AS total,
               count(*) FILTER (WHERE is_active)::int AS active
        FROM agents
      `),
      db.execute(sql`
        SELECT count(*)::int AS total,
               count(*) FILTER (WHERE status = 'active')::int AS active
        FROM agent_pipelines
      `),
      db.execute(sql`
        SELECT count(*)::int AS total,
               count(*) FILTER (WHERE created_at > date_trunc('day', now()))::int AS today
        FROM documents
      `),
      db.execute(sql`
        SELECT count(*)::int AS calls,
               count(*) FILTER (WHERE type = 'error')::int AS errors,
               round(avg(duration_ms) FILTER (WHERE duration_ms IS NOT NULL), 0)::int AS avg_latency
        FROM activity_events
        WHERE to_timestamp(timestamp / 1000.0) > now() - interval '24 hours'
      `),
      db.execute(sql`
        SELECT count(*)::int AS total,
               count(*) FILTER (WHERE result_count > 0)::int AS hits
        FROM rag_query_log
        WHERE created_at > now() - interval '30 days'
      `),

      // ── Trend (30d), grouped by day ──
      db.execute(sql`
        SELECT to_char(to_timestamp(timestamp / 1000.0)::date, 'YYYY-MM-DD') AS day,
               count(*)::int AS count
        FROM activity_events
        WHERE to_timestamp(timestamp / 1000.0) > now() - interval '30 days'
        GROUP BY day ORDER BY day
      `),
      db.execute(sql`
        SELECT to_char(to_timestamp(timestamp / 1000.0)::date, 'YYYY-MM-DD') AS day,
               count(*)::int AS total,
               count(*) FILTER (WHERE type = 'error')::int AS errors
        FROM activity_events
        WHERE to_timestamp(timestamp / 1000.0) > now() - interval '30 days'
        GROUP BY day ORDER BY day
      `),
      db.execute(sql`
        SELECT to_char(to_timestamp(timestamp / 1000.0)::date, 'YYYY-MM-DD') AS day,
               coalesce(sum(input_tokens), 0)::bigint AS input,
               coalesce(sum(output_tokens), 0)::bigint AS output
        FROM activity_events
        WHERE to_timestamp(timestamp / 1000.0) > now() - interval '30 days'
        GROUP BY day ORDER BY day
      `),
      db.execute(sql`
        SELECT to_char(to_timestamp(timestamp / 1000.0)::date, 'YYYY-MM-DD') AS day,
               round(coalesce(sum(cost_usd), 0)::numeric, 4)::float AS total
        FROM activity_events
        WHERE to_timestamp(timestamp / 1000.0) > now() - interval '30 days'
        GROUP BY day ORDER BY day
      `),

      // ── Top 5 lists ──
      db.execute(sql`
        SELECT a.id, a.name, a.display_name,
               count(ae.id)::int AS calls
        FROM agents a
        LEFT JOIN activity_events ae
          ON ae.bot_id = a.id
          AND to_timestamp(ae.timestamp / 1000) > now() - interval '24 hours'
        WHERE a.is_active
        GROUP BY a.id, a.name, a.display_name
        ORDER BY calls DESC NULLS LAST, a.name ASC
        LIMIT 5
      `),
      db.execute(sql`
        SELECT u.id, u.name, u.avatar_url,
               count(ap.id)::int AS tasks
        FROM users u
        LEFT JOIN agent_pipelines ap
          ON ap.owner_id = u.id AND ap.status != 'archived'
        WHERE u.employee_status = 'active'
        GROUP BY u.id, u.name, u.avatar_url
        ORDER BY tasks DESC NULLS LAST, u.name ASC
        LIMIT 5
      `),
      db.execute(sql`
        SELECT id, title, hit_count, last_hit_at
        FROM documents
        WHERE hit_count > 0
        ORDER BY hit_count DESC NULLS LAST, title ASC
        LIMIT 5
      `),

      // ── Recent activity (legacy compat — kept, frontend no longer renders) ──
      db.execute(sql`
        SELECT pr.id, pr.tenant_id, pr.pipeline_id, pr.triggered_by, pr.triggered_by_ref,
               pr.status, pr.error, pr.started_at, pr.finished_at, pr.duration_ms,
               pr.label_snapshot, ap.name AS pipeline_name
        FROM pipeline_runs pr
        LEFT JOIN agent_pipelines ap ON ap.id = pr.pipeline_id
        ORDER BY pr.started_at DESC NULLS LAST
        LIMIT 10
      `),
      db.execute(sql`
        SELECT id, action, resource_type, resource_id, created_at, details
        FROM audit_logs
        ORDER BY created_at DESC
        LIMIT 10
      `),
      db.execute(sql`
        SELECT s.id, s.bot_name, s.title, s.platform, s.updated_at,
               COALESCE(c.msg_count, 0)::int AS message_count
        FROM sessions s
        LEFT JOIN (
          SELECT session_id, count(*)::int AS msg_count
          FROM session_messages GROUP BY session_id
        ) c ON c.session_id = s.id
        ORDER BY s.updated_at DESC NULLS LAST
        LIMIT 5
      `),

      // ── R14-A · todo column ── active non-template pipelines that haven't
      // completed a run yet (run_count = 0) OR were updated today.
      db.execute(sql`
        SELECT ap.id, ap.name, ap.status, ap.run_count, ap.success_count,
               ap.trigger_type, ap.updated_at, ap.owner_id,
               u.name AS owner_name
        FROM agent_pipelines ap
        LEFT JOIN users u ON u.id = ap.owner_id
        WHERE ap.is_template = false
          AND ap.status = 'active'
          AND (
            ap.run_count = 0
            OR ap.updated_at > date_trunc('day', now())
          )
        ORDER BY ap.updated_at DESC NULLS LAST
        LIMIT 8
      `),

      // ── R14-A · completed column ── last 8 successful pipeline_runs
      db.execute(sql`
        SELECT pr.id, pr.pipeline_id, pr.status, pr.started_at, pr.finished_at,
               pr.duration_ms, pr.triggered_by, pr.triggered_by_ref,
               ap.name AS pipeline_name,
               u.name AS owner_name
        FROM pipeline_runs pr
        LEFT JOIN agent_pipelines ap ON ap.id = pr.pipeline_id
        LEFT JOIN users u ON u.id = ap.owner_id
        WHERE pr.status = 'completed'
        ORDER BY pr.finished_at DESC NULLS LAST
        LIMIT 8
      `),

      // ── R14-A · alerts input 1 ── 24h failed pipeline_runs grouped
      db.execute(sql`
        SELECT pipeline_id,
               count(*)::int AS fails,
               max(started_at) AS last_fail_at,
               max(error) AS last_error
        FROM pipeline_runs
        WHERE status = 'failed'
          AND started_at > now() - interval '24 hours'
        GROUP BY pipeline_id
        ORDER BY fails DESC
        LIMIT 5
      `),

      // ── R14-A · alerts input 2 ── users with error events in 24h
      db.execute(sql`
        SELECT user_id,
               count(*)::int AS errors
        FROM activity_events
        WHERE type = 'error'
          AND user_id IS NOT NULL
          AND to_timestamp(timestamp / 1000.0) > now() - interval '24 hours'
        GROUP BY user_id
        ORDER BY errors DESC
        LIMIT 5
      `),

      // ── R14-A · alerts input 3 ── documents stale (>90d no update)
      db.execute(sql`
        SELECT count(*)::int AS stale_count
        FROM documents
        WHERE updated_at < now() - interval '90 days'
      `),

      // ── R14-A · health input: 24h active employees ──
      db.execute(sql`
        SELECT count(DISTINCT user_id)::int AS active_users,
               (SELECT count(*)::int FROM users WHERE employee_status = 'active') AS total_active
        FROM activity_events
        WHERE user_id IS NOT NULL
          AND to_timestamp(timestamp / 1000.0) > now() - interval '24 hours'
      `),

      // ── R14-A · health input: 24h pipeline success rate ──
      db.execute(sql`
        SELECT count(*)::int AS total,
               count(*) FILTER (WHERE status = 'completed')::int AS completed,
               count(*) FILTER (WHERE status = 'failed')::int AS failed
        FROM pipeline_runs
        WHERE started_at > now() - interval '24 hours'
      `),

      // ── DB ping (separate timing) ──
      (async () => {
        const t0 = Date.now();
        await db.execute(sql`SELECT 1::int AS n`);
        return Date.now() - t0;
      })(),
    ]);

    // ── Fire external probes in parallel (TCP ports, AI providers, disk) ──
    // These don't depend on DB results.
    const [backendUp, webUp, dbUp, redisUp, aiProbe, diskPct] = await Promise.all([
      probePort('127.0.0.1', 9100, 1500),
      probePort('127.0.0.1', 3200, 1500),
      probePort('127.0.0.1', 5432, 1500),
      probePort('127.0.0.1', 6379, 1500),
      probeAiProviders(),
      diskUsagePercent(),
    ]);
    const mem = memoryUsagePercent();
    const cpu = cpuLoadPercent();

    // ── shape KPIs ──
    const e = asArr(employeesRaw)[0] ?? {};
    const a = asArr(agentsRaw)[0] ?? {};
    const p = asArr(pipelinesRaw)[0] ?? {};
    const d = asArr(documentsRaw)[0] ?? {};
    const c = asArr(calls24hRaw)[0] ?? {};
    const r = asArr(rag30dRaw)[0] ?? {};
    const calls24h = toInt(c.calls);
    const errors24h = toInt(c.errors);
    const errorRate24h = calls24h > 0 ? Number(((errors24h / calls24h) * 100).toFixed(2)) : 0;
    const ragTotal = toInt(r.total);
    const ragHits = toInt(r.hits);
    const ragHitRate = ragTotal > 0 ? Number(((ragHits / ragTotal) * 100).toFixed(1)) : 0;

    // ── shape trend (fill 30d gaps) ──
    const callsTrend = fillDays(asArr(trendCallsRaw), 'count', {});
    const errorsTrend = fillDays(asArr(trendErrorsRaw).map((row) => ({
      ...row,
      rate: toInt(row.total) > 0
        ? Number(((toInt(row.errors) / toInt(row.total)) * 100).toFixed(2))
        : 0,
    })), 'total', { errors: 0, rate: 0 });
    const tokensTrend = fillDays(asArr(trendTokensRaw).map((row) => ({
      ...row,
      input: toInt(row.input),
      output: toInt(row.output),
    })), 'input', { input: 0, output: 0 });
    const costTrend = fillDays(asArr(trendCostRaw).map((row) => ({
      ...row,
      total: toNum(row.total),
    })), 'total', { total: 0 });

    // ── shape health (R14-A: 6 项, all real) ──
    // 1) 系统服务 — 4 ports
    const services = [
      { key: '后端', ok: backendUp },
      { key: '前端', ok: webUp },
      { key: 'DB', ok: dbUp },
      { key: 'Redis', ok: redisUp },
    ];
    const servicesUp = services.filter((s) => s.ok).length;
    const servicesStatus: 'ok' | 'warn' | 'error' =
      servicesUp === 4 ? 'ok' : servicesUp >= 3 ? 'warn' : 'error';

    // 2) AI 大模型
    const aiStatus: 'ok' | 'warn' | 'error' =
      aiProbe.total === 0 ? 'warn'
      : aiProbe.reachable >= aiProbe.total ? 'ok'
      : aiProbe.reachable >= Math.ceil(aiProbe.total * 0.8) ? 'warn'
      : 'error';

    // 3) RAG 命中
    const ragStatus: 'ok' | 'warn' | 'error' =
      ragTotal === 0 ? 'warn'
      : ragHitRate >= 60 ? 'ok'
      : ragHitRate >= 30 ? 'warn'
      : 'error';

    // 4) 任务执行 24h
    const pipelineStats = asArr(pipelineStats24hRaw)[0] ?? {};
    const pipelineTotal24h = toInt(pipelineStats.total);
    const pipelineCompleted24h = toInt(pipelineStats.completed);
    const pipelineFailed24h = toInt(pipelineStats.failed);
    const pipelineSuccessRate = pipelineTotal24h > 0
      ? Number(((pipelineCompleted24h / pipelineTotal24h) * 100).toFixed(1))
      : 0;
    const pipelineStatus: 'ok' | 'warn' | 'error' =
      pipelineTotal24h === 0 ? 'warn'
      : pipelineSuccessRate >= 90 ? 'ok'
      : pipelineSuccessRate >= 75 ? 'warn'
      : 'error';

    // 5) 资源 — 主看磁盘 (container 可控), mem/cpu 显示但不主导
    //    reason: container 内 os.loadavg 反映宿主机, 不准; 内存受 cgroup 限制也不准
    //    spec threshold: 磁盘 < 80%
    const diskStatus: 'ok' | 'warn' | 'error' =
      diskPct < 80 ? 'ok' : diskPct < 90 ? 'warn' : 'error';
    const memStatus: 'ok' | 'warn' | 'error' =
      mem.usedPct < 85 ? 'ok' : mem.usedPct < 95 ? 'warn' : 'error';
    // CPU 在 container 内不可靠 — 仅展示, 不参与 status 判定
    const resourceStatus: 'ok' | 'warn' | 'error' =
      diskStatus === 'error' || memStatus === 'error' ? 'error'
      : diskStatus === 'warn' || memStatus === 'warn' ? 'warn'
      : 'ok';

    // 6) 正式员工活跃 — 业务指标, 不算系统 error (最低 warn, 不下到 error)
    const activeEmpRow = asArr(employeesActive24hRaw)[0] ?? {};
    const employeesActive24h = toInt(activeEmpRow.active_users);
    const employeesTotalActive = toInt(activeEmpRow.total_active);
    const empRatio = employeesTotalActive > 0 ? employeesActive24h / employeesTotalActive : 0;
    const empActivityStatus: 'ok' | 'warn' | 'error' =
      employeesTotalActive === 0 ? 'warn'
      : empRatio >= 0.5 ? 'ok'
      : empRatio >= 0.2 ? 'warn'
      : 'warn';

    const health = [
      {
        name: '系统服务',
        status: servicesStatus,
        value: `${servicesUp}/4 在线`,
        threshold: '全在线',
        detail: { services, up: servicesUp, total: 4 },
      },
      {
        name: 'AI 大模型',
        status: aiStatus,
        value: aiProbe.total > 0 ? `${aiProbe.reachable}/${aiProbe.total} 连通` : '未配置',
        threshold: '>= 80%',
        detail: { reachable: aiProbe.reachable, total: aiProbe.total, list: aiProbe.list },
      },
      {
        name: '知识库检索',
        status: ragStatus,
        value: ragTotal > 0 ? `${ragHitRate}% 命中` : '—',
        threshold: '>= 60%',
        detail: { percent: ragHitRate, total: ragTotal, hits: ragHits, windowDays: 30 },
      },
      {
        name: '任务执行',
        status: pipelineStatus,
        value: pipelineTotal24h > 0 ? `${pipelineSuccessRate}% 成功` : '—',
        threshold: '>= 90%',
        detail: {
          total: pipelineTotal24h,
          completed: pipelineCompleted24h,
          failed: pipelineFailed24h,
          rate: pipelineSuccessRate,
          windowHours: 24,
        },
      },
      {
        name: '资源',
        status: resourceStatus,
        value: `磁盘 ${diskPct}%`,
        threshold: '磁盘 < 80%',
        detail: {
          diskPct,
          memPct: mem.usedPct,
          memUsedGb: mem.usedGb,
          memTotalGb: mem.totalGb,
          cpuPct: cpu.pct,
          cpuLoad1: cpu.load1,
          cpuCores: cpu.cores,
        },
      },
      {
        name: '正式员工活跃',
        status: empActivityStatus,
        value: `${employeesActive24h}/${employeesTotalActive} 今日在线`,
        threshold: '>= 80%',
        detail: { active: employeesActive24h, total: employeesTotalActive, windowHours: 24 },
      },
    ];

    // ── shape top lists ──
    const topAgents = asArr(topAgentsRaw).map((row) => ({
      id: toStr(row.id),
      name: toStr(row.display_name || row.name, '未命名'),
      calls: toInt(row.calls),
    }));
    const topEmployees = asArr(topEmployeesRaw).map((row) => ({
      id: toStr(row.id),
      name: toStr(row.name, '未命名'),
      avatarUrl: row.avatar_url ? toStr(row.avatar_url) : null,
      tasks: toInt(row.tasks),
    }));
    const topDocuments = asArr(topDocumentsRaw).map((row) => ({
      id: toStr(row.id),
      title: toStr(row.title, '无标题'),
      hitCount: toInt(row.hit_count),
      lastHitAt: toISO(row.last_hit_at),
    }));

    // ── shape legacy recent activity (kept for compat — no longer rendered) ──
    const recentPipelines = asArr(recentPipelinesRaw).map((row) => {
      const labels = row.label_snapshot && typeof row.label_snapshot === 'object'
        ? (row.label_snapshot as Record<string, unknown>)
        : {};
      const labelValues = Object.values(labels).map((v) => toStr(v)).filter(Boolean);
      return {
        id: toStr(row.id),
        pipelineId: row.pipeline_id ? toStr(row.pipeline_id) : null,
        name: toStr(row.pipeline_name) || (labelValues[0] ?? '(未命名流水线)'),
        status: toStr(row.status, 'unknown'),
        triggeredBy: row.triggered_by ? toStr(row.triggered_by) : null,
        startedAt: toISO(row.started_at),
        finishedAt: toISO(row.finished_at),
        durationMs: row.duration_ms !== null && row.duration_ms !== undefined
          ? toInt(row.duration_ms)
          : null,
        error: row.error ? toStr(row.error) : null,
      };
    });
    const recentAudit = asArr(recentAuditRaw).map((row) => ({
      id: toStr(row.id),
      action: toStr(row.action),
      resourceType: row.resource_type ? toStr(row.resource_type) : null,
      resourceId: row.resource_id ? toStr(row.resource_id) : null,
      createdAt: toISO(row.created_at),
      details: row.details ?? null,
    }));
    const recentSessions = asArr(recentSessionsRaw).map((row) => ({
      id: toStr(row.id),
      botName: row.bot_name ? toStr(row.bot_name) : null,
      title: row.title ? toStr(row.title) : null,
      platform: row.platform ? toStr(row.platform) : null,
      updatedAt: toISO(row.updated_at),
      messageCount: toInt(row.message_count),
    }));

    // ── shape R14-A bottom 3 columns ──
    const todo = asArr(todoRaw).map((row) => ({
      id: toStr(row.id),
      name: toStr(row.name, '(未命名任务)'),
      status: toStr(row.status, 'active'),
      runCount: toInt(row.run_count),
      successCount: toInt(row.success_count),
      triggerType: toStr(row.trigger_type, 'manual'),
      updatedAt: toISO(row.updated_at),
      ownerId: row.owner_id ? toStr(row.owner_id) : null,
      ownerName: row.owner_name ? toStr(row.owner_name) : null,
      // semantic state for the frontend pill
      kind: toInt(row.run_count) === 0 ? 'pending' as const : 'scheduled' as const,
    }));

    const completed = asArr(completedRaw).map((row) => ({
      id: toStr(row.id),
      pipelineId: row.pipeline_id ? toStr(row.pipeline_id) : null,
      name: toStr(row.pipeline_name, '(未命名任务)'),
      status: 'completed' as const,
      startedAt: toISO(row.started_at),
      finishedAt: toISO(row.finished_at),
      durationMs: row.duration_ms !== null && row.duration_ms !== undefined
        ? toInt(row.duration_ms)
        : null,
      ownerId: null,
      ownerName: row.owner_name ? toStr(row.owner_name) : null,
      triggeredBy: row.triggered_by ? toStr(row.triggered_by) : null,
    }));

    // ── shape alerts (aggregated from 3 sources) ──
    interface AlertItem {
      key: string;
      severity: 'error' | 'warn';
      type: 'pipeline_failed' | 'user_errors' | 'ai_provider' | 'docs_stale';
      label: string;
      detail: string;
      href?: string;
    }
    const alerts: AlertItem[] = [];

    // 1) failed pipelines (24h)
    const failedRows = asArr(failed24hRaw);
    for (const row of failedRows) {
      const fails = toInt(row.fails);
      const lastError = row.last_error ? toStr(row.last_error).slice(0, 80) : '';
      alerts.push({
        key: `pf-${toStr(row.pipeline_id)}`,
        severity: 'error',
        type: 'pipeline_failed',
        label: `任务 24h 失败 ${fails} 次`,
        detail: lastError || '查看诊断页',
        href: row.pipeline_id ? `/tasks/${toStr(row.pipeline_id)}` : '/overview/diagnosis',
      });
    }

    // 2) users with errors (24h) — needs name lookup
    const errorUserRows = asArr(errorUsers24hRaw);
    let errorUserAlerts: AlertItem[] = [];
    if (errorUserRows.length > 0) {
      const userIds = errorUserRows.map((r) => toStr(r.user_id));
      const userNames = asArr(
        await db.execute(sql`
          SELECT id, name FROM users
          WHERE id = ANY(${sql.raw(`ARRAY['${userIds.join("','")}']::uuid[]`)})
        `),
      );
      const nameMap = new Map(userNames.map((u) => [toStr(u.id), toStr(u.name, '?')]));
      errorUserAlerts = errorUserRows.map((row) => {
        const uid = toStr(row.user_id);
        const errors = toInt(row.errors);
        return {
          key: `ue-${uid}`,
          severity: errors >= 5 ? 'error' : 'warn',
          type: 'user_errors' as const,
          label: `员工 ${nameMap.get(uid) ?? '?'} ${errors} 次错误`,
          detail: '24h 错误事件',
          href: `/overview/people/${uid}`,
        };
      });
    }
    alerts.push(...errorUserAlerts);

    // 3) AI providers unreachable
    for (const p of aiProbe.list) {
      if (!p.ok) {
        alerts.push({
          key: `ai-${p.name}`,
          severity: 'warn',
          type: 'ai_provider',
          label: `AI 模型 ${p.name} 不通`,
          detail: '3s ping 失败',
          href: '/models',
        });
      }
    }

    // 4) stale docs
    const staleCount = toInt(asArr(staleDocsRaw)[0]?.stale_count);
    if (staleCount > 0) {
      alerts.push({
        key: 'docs-stale',
        severity: 'warn',
        type: 'docs_stale',
        label: `${staleCount} 篇文档超过 90 天未更新`,
        detail: '建议复审或归档',
        href: '/knowledge',
      });
    }

    // sort alerts: error first, then warn
    alerts.sort((a, b) => {
      if (a.severity === 'error' && b.severity !== 'error') return -1;
      if (a.severity !== 'error' && b.severity === 'error') return 1;
      return 0;
    });

    jsonResponse(res, 200, {
      success: true,
      kpis: {
        employees: toInt(e.total),
        employeesActive: toInt(e.active),
        digitalEmployees: toInt(a.total),
        digitalEmployeesActive: toInt(a.active),
        pipelines: toInt(p.total),
        pipelinesActive: toInt(p.active),
        documents: toInt(d.total),
        documentsAddedToday: toInt(d.today),
        calls24h,
        errorRate24h,
        avgLatencyMs24h: toInt(c.avg_latency),
        ragHitRate,
      },
      trend: {
        calls: callsTrend,
        errors: errorsTrend,
        tokens: tokensTrend,
        cost: costTrend,
      },
      health,
      topAgents,
      topEmployees,
      topDocuments,
      // R14-A new bottom 3 columns
      todo,
      alerts,
      completed,
      // legacy (kept for backward compat — frontend no longer renders these
      // three but other callers might exist)
      recentPipelines,
      recentAudit,
      recentSessions,
      meta: {
        generatedAt: new Date().toISOString(),
        ragTotal,
        ragHits,
        servicesUp,
        servicesTotal: 4,
        aiReachable: aiProbe.reachable,
        aiTotal: aiProbe.total,
        diskPct,
        memPct: mem.usedPct,
        cpuPct: cpu.pct,
        pipelineTotal24h,
        pipelineCompleted24h,
        pipelineFailed24h,
        pipelineSuccessRate,
        employeesActive24h,
        employeesTotalActive,
      },
    });
    return true;
  } catch (err) {
    jsonResponse(res, 500, {
      error: 'dashboard_aggregate_failed',
      message: err instanceof Error ? err.message : 'unknown',
    });
    return true;
  }
}
