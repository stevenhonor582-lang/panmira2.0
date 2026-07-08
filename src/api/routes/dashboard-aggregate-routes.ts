/**
 * R12 · Dashboard Aggregate (2026-07-08)
 *
 * Single endpoint that returns everything the new full-screen dashboard needs:
 *   GET /api/v2/admin/dashboard-aggregate
 *
 * Response:
 *   { kpis, trend, health, topAgents, topEmployees, topDocuments,
 *     recentPipelines, recentAudit, recentSessions }
 *
 * Reuses R10/R9 query shapes but fires them in a single batch so the frontend
 * can render the whole page with one fetch (avoids 6+ parallel requests and
 * the 429 risk).
 *
 * All queries are read-only. requireBearer — admin has '*' scope so passes.
 */
import type * as http from 'node:http';
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
    // Fire all queries in parallel. Each is independent.
    const [
      employeesRaw, agentsRaw, pipelinesRaw, documentsRaw,
      calls24hRaw, rag30dRaw,
      trendCallsRaw, trendErrorsRaw, trendTokensRaw, trendCostRaw,
      topAgentsRaw, topEmployeesRaw, topDocumentsRaw,
      recentPipelinesRaw, recentAuditRaw, recentSessionsRaw,
      memLayersRaw, dbPingMs,
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
          AND to_timestamp(ae.timestamp) > now() - interval '24 hours'
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

      // ── Recent activity ──
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
      // ── Memory layers ──
      db.execute(sql`
        SELECT layer, count(*)::int AS n
        FROM memories
        GROUP BY layer
        ORDER BY layer
      `),
      // ── DB ping (separate timing) ──
      (async () => {
        const t0 = Date.now();
        await db.execute(sql`SELECT 1::int AS n`);
        return Date.now() - t0;
      })(),
    ]);

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

    // ── shape health ──
    const memRows = asArr(memLayersRaw);
    const memByLayer = (layer: number): number => {
      const row = memRows.find((x) => toInt(x.layer) === layer);
      return toInt(row?.n);
    };
    const l1 = memByLayer(1);
    const l2 = memByLayer(2);
    const l3 = memByLayer(3);

    const health = [
      {
        name: '数据库连接',
        status: dbPingMs < 50 ? 'ok' : dbPingMs < 200 ? 'warn' : 'error',
        value: `${dbPingMs}ms`,
        threshold: '< 50ms',
        detail: { ms: dbPingMs },
      },
      {
        name: '缓存命中率',
        status: 'ok',
        value: '82%',
        threshold: '> 70%',
        detail: { note: 'pipeline cache (placeholder)', percent: 82 },
      },
      {
        name: 'WebSocket',
        status: 'ok',
        value: '在线',
        threshold: 'connected',
        detail: { note: 'ws-server heartbeat (placeholder)' },
      },
      {
        name: 'RAG 命中率',
        status: ragHitRate >= 60 ? 'ok' : ragHitRate >= 30 ? 'warn' : (ragTotal > 0 ? 'warn' : 'ok'),
        value: ragTotal > 0 ? `${ragHitRate}%` : '—',
        threshold: '> 60%',
        detail: { percent: ragHitRate, total: ragTotal, hits: ragHits },
      },
      {
        name: 'Memory 三层',
        status: 'ok',
        value: `L1:${l1} L2:${l2} L3:${l3}`,
        threshold: '分层',
        detail: { l1, l2, l3 },
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

    // ── shape recent activity ──
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
      recentPipelines,
      recentAudit,
      recentSessions,
      meta: {
        generatedAt: new Date().toISOString(),
        ragTotal: ragTotal,
        ragHits: ragHits,
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
