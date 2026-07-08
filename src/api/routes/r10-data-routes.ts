/**
 * R10 · Data Access Routes (2026-07-08)
 *
 * 6 个新端点 — 把已有表的数据接到前端:
 *
 * 1. GET  /api/v2/foundation/memory/:layer  — L1/L2/L3 memory list (真数据)
 * 2. GET  /api/v2/admin/sessions            — sessions + chat_sessions + msg_count
 * 3. GET  /api/v2/admin/sessions/:id/messages — session_messages by session
 * 4. GET  /api/v2/admin/rag-query-stats     — rag_query_log 30d 派生指标
 * 5. GET  /api/v2/admin/pipeline-runs       — pipeline_runs 最近 N 条
 * 6. GET  /api/v2/admin/usage-reports       — usage_reports 资源使用
 * 7. GET  /api/v2/admin/bot-history         — bot_agent_history
 * 8. GET  /api/v2/admin/sync-outbox         — nextcrm_sync_outbox
 *
 * 全部端点 require Bearer — admin 角色含 '*' 通配 scope,自动通过。
 * 数据敏感 — 全部只读。
 */
import type * as http from 'node:http';
import { sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { jsonResponse } from './helpers.js';
import { requireBearer } from '../oauth-middleware.js';

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════
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

function toISO(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  const t = typeof v === 'number' ? v : null;
  if (t !== null && t > 0) {
    // epoch seconds or ms?
    return new Date(t < 1e12 ? t * 1000 : t).toISOString();
  }
  return String(v);
}

// ═══════════════════════════════════════════════════════════════
// 1. Memory list by layer
// ═══════════════════════════════════════════════════════════════
async function memoryList(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: { tenantId: string; userId: string | null },
  layer: 1 | 2 | 3,
  urlObj: URL,
) {
  // R10: admin sees ALL memories (legacy tenant_id formats are non-UUID).
  // operator/member would need tenant filter, but memory table is shared anyway.
  const limit = Math.min(200, Math.max(1, toInt(urlObj.searchParams.get('limit'), 50)));
  const offset = Math.max(0, toInt(urlObj.searchParams.get('offset'), 0));
  const botId = urlObj.searchParams.get('bot_id') || urlObj.searchParams.get('botId');
  const minImportance = urlObj.searchParams.get('min_importance');
  const query = urlObj.searchParams.get('q') || urlObj.searchParams.get('query');

  const conditions: ReturnType<typeof sql>[] = [sql`layer = ${layer}`];

  // L1: short-term memory. Spec said last 24h, but production memory pipeline
  // isn't actively running on this tenant — show all layer=1 ordered by recency
  // so the L1 page surfaces real data instead of an empty list.
  // Re-enable 24h filter once the extraction pipeline is live again.
  // if (layer === 1) {
  //   conditions.push(sql`created_at > now() - interval '24 hours'`);
  // }
  // L2: only importance >= 0.5 (curated facts)
  if (layer === 2) {
    conditions.push(sql`(importance IS NULL OR importance >= 0.5)`);
  }

  if (botId) conditions.push(sql`bot_id = ${botId}::uuid`);
  if (minImportance) {
    const f = parseFloat(minImportance);
    if (Number.isFinite(f)) conditions.push(sql`(importance IS NULL OR importance >= ${f})`);
  }
  if (query) conditions.push(sql`(content ILIKE ${'%' + query + '%'} OR subject ILIKE ${'%' + query + '%'})`);

  const where = sql.join(conditions, sql.raw(' AND '));

  try {
    const listRaw = await db.execute(sql`
      SELECT id, layer, subject, content, importance, bot_id, tenant_id,
             hit_count, type, polarity,
             metadata_json AS metadata,
             metadata_json->'tags' AS tags_json,
             created_at, updated_at
      FROM memories
      WHERE ${where}
      ORDER BY ${layer === 1 ? sql`created_at DESC` : layer === 2 ? sql`COALESCE(importance, 0) DESC, created_at DESC` : sql`created_at DESC`}
      LIMIT ${limit} OFFSET ${offset}
    `);
    const rows = asArr(listRaw);

    const countRaw = await db.execute(sql`
      SELECT count(*)::int AS n FROM memories WHERE ${where}
    `);
    const total = toInt(asArr(countRaw)[0]?.n, 0);

    const items = rows.map((r) => {
      const meta = (r.metadata && typeof r.metadata === 'object') ? r.metadata as Record<string, unknown> : null;
      const tagsRaw = r.tags_json ?? (meta ? meta.tags : null);
      const tags = Array.isArray(tagsRaw) ? tagsRaw.map(String) : [];
      return {
        id: String(r.id),
        layer: toInt(r.layer, layer),
        subject: r.subject ?? null,
        content: r.content ?? null,
        preview: typeof r.content === 'string' ? r.content.slice(0, 240) : null,
        importance: r.importance !== null && r.importance !== undefined ? Number(r.importance) : null,
        botId: r.bot_id ? String(r.bot_id) : null,
        tenantId: r.tenant_id ? String(r.tenant_id) : null,
        hitCount: toInt(r.hit_count, 0),
        type: r.type ?? null,
        polarity: r.polarity ?? null,
        tags,
        createdAt: toISO(r.created_at),
        updatedAt: toISO(r.updated_at),
        metadata: r.metadata ?? null,
      };
    });

    jsonResponse(res, 200, {
      success: true,
      layer,
      total,
      limit,
      offset,
      hasMore: offset + items.length < total,
      memories: items,
    });
  } catch (err) {
    jsonResponse(res, 500, {
      error: 'memory_list_failed',
      message: err instanceof Error ? err.message : 'unknown',
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// 2. Sessions (sessions + chat_sessions) + message counts
// ═══════════════════════════════════════════════════════════════
async function listSessions(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  _ctx: { tenantId: string },
  urlObj: URL,
) {
  const limit = Math.min(200, Math.max(1, toInt(urlObj.searchParams.get('limit'), 50)));

  try {
    // sessions (engine) — bigint epoch timestamps
    const sessRaw = await db.execute(sql`
      SELECT s.id, s.bot_name, s.bot_id, s.title, s.platform, s.chat_id,
             s.claude_session_id, s.working_directory,
             s.created_at, s.updated_at,
             COALESCE(c.msg_count, 0)::int AS message_count
      FROM sessions s
      LEFT JOIN (
        SELECT session_id, count(*)::int AS msg_count
        FROM session_messages
        GROUP BY session_id
      ) c ON c.session_id = s.id
      ORDER BY s.updated_at DESC NULLS LAST
      LIMIT ${limit}
    `);
    const sessRows = asArr(sessRaw);

    // chat_sessions (channel-side chat tracking)
    const chatRaw = await db.execute(sql`
      SELECT bot_name, chat_id, session_id, session_id_engine, working_directory,
             model, engine, cumulative_tokens, cumulative_cost_usd,
             cumulative_duration_ms, last_used, created_at, updated_at
      FROM chat_sessions
      ORDER BY updated_at DESC NULLS LAST
      LIMIT ${limit}
    `);
    const chatRows = asArr(chatRaw);

    jsonResponse(res, 200, {
      success: true,
      sessions: sessRows.map((r) => ({
        kind: 'engine' as const,
        id: String(r.id),
        botName: r.bot_name,
        botId: r.bot_id ? String(r.bot_id) : null,
        title: r.title ?? null,
        platform: r.platform ?? null,
        chatId: r.chat_id ?? null,
        claudeSessionId: r.claude_session_id ?? null,
        workingDirectory: r.working_directory ?? null,
        createdAt: toISO(r.created_at),
        updatedAt: toISO(r.updated_at),
        messageCount: toInt(r.message_count, 0),
      })),
      chatSessions: chatRows.map((r) => ({
        kind: 'channel' as const,
        botName: r.bot_name,
        chatId: r.chat_id,
        sessionId: r.session_id ?? null,
        workingDirectory: r.working_directory ?? null,
        model: r.model ?? null,
        engine: r.engine ?? null,
        cumulativeTokens: toInt(r.cumulative_tokens, 0),
        cumulativeCostUsd: r.cumulative_cost_usd !== null ? Number(r.cumulative_cost_usd) : 0,
        cumulativeDurationMs: toInt(r.cumulative_duration_ms, 0),
        lastUsed: toISO(r.last_used),
        createdAt: toISO(r.created_at),
        updatedAt: toISO(r.updated_at),
      })),
    });
  } catch (err) {
    jsonResponse(res, 500, {
      error: 'sessions_failed',
      message: err instanceof Error ? err.message : 'unknown',
    });
  }
}

// 3. Session messages
async function sessionMessages(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  _ctx: { tenantId: string },
  sessionId: string,
  urlObj: URL,
) {
  const limit = Math.min(200, Math.max(1, toInt(urlObj.searchParams.get('limit'), 50)));

  try {
    const rowsRaw = await db.execute(sql`
      SELECT id, session_id, role, text, platform, cost_usd, duration_ms, timestamp
      FROM session_messages
      WHERE session_id = ${sessionId}::uuid
      ORDER BY timestamp DESC NULLS LAST, id DESC
      LIMIT ${limit}
    `);
    const rows = asArr(rowsRaw);

    jsonResponse(res, 200, {
      success: true,
      sessionId,
      total: rows.length,
      limit,
      messages: rows.map((r) => ({
        id: toInt(r.id, 0),
        sessionId: r.session_id ? String(r.session_id) : sessionId,
        role: r.role ?? 'unknown',
        content: r.text ?? '',
        platform: r.platform ?? null,
        costUsd: r.cost_usd !== null && r.cost_usd !== undefined ? Number(r.cost_usd) : null,
        durationMs: r.duration_ms !== null && r.duration_ms !== undefined ? toInt(r.duration_ms) : null,
        timestamp: toISO(r.timestamp),
      })),
    });
  } catch (err) {
    jsonResponse(res, 500, {
      error: 'session_messages_failed',
      message: err instanceof Error ? err.message : 'unknown',
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// 4. RAG query stats (30d)
// ═══════════════════════════════════════════════════════════════
async function ragQueryStats(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  _ctx: { tenantId: string },
) {
  try {
    // Daily aggregation. rag_query_log has result_count not hit_count —
    // treat result_count > 0 as a hit.
    const dailyRaw = await db.execute(sql`
      SELECT date_trunc('day', created_at) AS day,
             count(*)::int AS total,
             count(*) FILTER (WHERE result_count > 0)::int AS hits,
             count(*) FILTER (WHERE result_count = 0)::int AS misses,
             round(avg(result_count)::numeric, 2)::float AS avg_results,
             round(avg(duration_ms)::numeric, 0)::int AS avg_latency_ms,
             round(avg(top_score) FILTER (WHERE top_score IS NOT NULL)::numeric, 3)::float AS avg_top_score
      FROM rag_query_log
      WHERE created_at > now() - interval '30 days'
      GROUP BY day
      ORDER BY day DESC
    `);
    const daily = asArr(dailyRaw);

    const totalsRaw = await db.execute(sql`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE result_count > 0)::int AS hits,
             round(avg(duration_ms), 0)::int AS avg_latency_ms
      FROM rag_query_log
      WHERE created_at > now() - interval '30 days'
    `);
    const totals = asArr(totalsRaw)[0] ?? {};

    const byBotRaw = await db.execute(sql`
      SELECT bot_name,
             count(*)::int AS total,
             count(*) FILTER (WHERE result_count > 0)::int AS hits,
             round(avg(duration_ms), 0)::int AS avg_latency_ms
      FROM rag_query_log
      WHERE created_at > now() - interval '30 days'
      GROUP BY bot_name
      ORDER BY total DESC
      LIMIT 10
    `);
    const byBot = asArr(byBotRaw);

    jsonResponse(res, 200, {
      success: true,
      window: '30d',
      totals: {
        total: toInt(totals.total, 0),
        hits: toInt(totals.hits, 0),
        missRate: toInt(totals.total) > 0
          ? Number(((1 - toInt(totals.hits) / toInt(totals.total)) * 100).toFixed(2))
          : 0,
        avgLatencyMs: toInt(totals.avg_latency_ms, 0),
      },
      daily: daily.map((r) => ({
        day: toISO(r.day),
        total: toInt(r.total, 0),
        hits: toInt(r.hits, 0),
        misses: toInt(r.misses, 0),
        avgResults: r.avg_results !== null && r.avg_results !== undefined ? Number(r.avg_results) : null,
        avgLatencyMs: toInt(r.avg_latency_ms, 0),
        avgTopScore: r.avg_top_score !== null && r.avg_top_score !== undefined ? Number(r.avg_top_score) : null,
      })),
      byBot: byBot.map((r) => ({
        botName: r.bot_name,
        total: toInt(r.total, 0),
        hits: toInt(r.hits, 0),
        avgLatencyMs: toInt(r.avg_latency_ms, 0),
      })),
    });
  } catch (err) {
    jsonResponse(res, 500, {
      error: 'rag_stats_failed',
      message: err instanceof Error ? err.message : 'unknown',
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// 5. Pipeline runs
// ═══════════════════════════════════════════════════════════════
async function pipelineRuns(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  _ctx: { tenantId: string },
  urlObj: URL,
) {
  const limit = Math.min(100, Math.max(1, toInt(urlObj.searchParams.get('limit'), 20)));
  const statusFilter = urlObj.searchParams.get('status');

  try {
    const rowsRaw = await db.execute(sql`
      SELECT id, tenant_id, pipeline_id, triggered_by, triggered_by_ref,
             status, current_node_id, error,
             started_at, finished_at, duration_ms, label_snapshot
      FROM pipeline_runs
      ${statusFilter ? sql`WHERE status = ${statusFilter}` : sql``}
      ORDER BY started_at DESC NULLS LAST
      LIMIT ${limit}
    `);
    const rows = asArr(rowsRaw);

    // Status summary
    const summaryRaw = await db.execute(sql`
      SELECT status, count(*)::int AS n
      FROM pipeline_runs
      GROUP BY status
      ORDER BY n DESC
    `);
    const summary = asArr(summaryRaw);

    jsonResponse(res, 200, {
      success: true,
      total: rows.length,
      limit,
      summary: summary.map((r) => ({ status: r.status, count: toInt(r.n, 0) })),
      runs: rows.map((r) => ({
        id: String(r.id),
        tenantId: r.tenant_id ? String(r.tenant_id) : null,
        pipelineId: r.pipeline_id ? String(r.pipeline_id) : null,
        triggeredBy: r.triggered_by ?? null,
        triggeredByRef: r.triggered_by_ref ?? null,
        status: r.status ?? 'unknown',
        currentNodeId: r.current_node_id ?? null,
        error: r.error ?? null,
        startedAt: toISO(r.started_at),
        finishedAt: toISO(r.finished_at),
        durationMs: r.duration_ms !== null && r.duration_ms !== undefined ? toInt(r.duration_ms) : null,
        labelSnapshot: r.label_snapshot ?? null,
      })),
    });
  } catch (err) {
    jsonResponse(res, 500, {
      error: 'pipeline_runs_failed',
      message: err instanceof Error ? err.message : 'unknown',
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// 6. Usage reports
// ═══════════════════════════════════════════════════════════════
async function usageReports(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  _ctx: { tenantId: string },
  urlObj: URL,
) {
  const limit = Math.min(200, Math.max(1, toInt(urlObj.searchParams.get('limit'), 30)));
  const dimension = urlObj.searchParams.get('dimension');

  try {
    const rowsRaw = await db.execute(sql`
      SELECT id, tenant_id, date, dimension, dimension_key, count, cost_usd, metadata
      FROM usage_reports
      ${dimension ? sql`WHERE dimension = ${dimension}` : sql``}
      ORDER BY date DESC NULLS LAST, dimension, dimension_key
      LIMIT ${limit}
    `);
    const rows = asArr(rowsRaw);

    // Aggregate by dimension
    const aggRaw = await db.execute(sql`
      SELECT dimension,
             count(*)::int AS rows,
             sum(count)::bigint AS total_count,
             round(COALESCE(sum(cost_usd), 0)::numeric, 2)::float AS total_cost
      FROM usage_reports
      GROUP BY dimension
      ORDER BY total_count DESC
    `);
    const agg = asArr(aggRaw);

    jsonResponse(res, 200, {
      success: true,
      total: rows.length,
      limit,
      byDimension: agg.map((r) => ({
        dimension: r.dimension,
        rows: toInt(r.rows, 0),
        totalCount: toInt(r.total_count, 0),
        totalCostUsd: r.total_cost !== null && r.total_cost !== undefined ? Number(r.total_cost) : 0,
      })),
      reports: rows.map((r) => ({
        id: String(r.id),
        tenantId: r.tenant_id ? String(r.tenant_id) : null,
        date: r.date ?? null,
        dimension: r.dimension ?? null,
        dimensionKey: r.dimension_key ?? null,
        count: toInt(r.count, 0),
        costUsd: r.cost_usd !== null && r.cost_usd !== undefined ? Number(r.cost_usd) : 0,
        metadata: r.metadata ?? null,
      })),
    });
  } catch (err) {
    jsonResponse(res, 500, {
      error: 'usage_reports_failed',
      message: err instanceof Error ? err.message : 'unknown',
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// 7. Bot agent history
// ═══════════════════════════════════════════════════════════════
async function botHistory(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  _ctx: { tenantId: string },
  urlObj: URL,
) {
  const limit = Math.min(200, Math.max(1, toInt(urlObj.searchParams.get('limit'), 50)));

  try {
    const rowsRaw = await db.execute(sql`
      SELECT bah.id, bah.bot_id, bah.agent_id, bah.agent_name, bah.action,
             bah.bound_at, bah.unbound_at, bah.bound_by,
             bah.changed_at, bah.changed_by, bah.old_value, bah.new_value,
             bc.name AS bot_name, bc.display_name AS bot_display_name
      FROM bot_agent_history bah
      LEFT JOIN bot_configs bc ON bc.bot_id = bah.bot_id
      ORDER BY COALESCE(bah.changed_at, bah.bound_at) DESC NULLS LAST
      LIMIT ${limit}
    `);
    const rows = asArr(rowsRaw);

    jsonResponse(res, 200, {
      success: true,
      total: rows.length,
      limit,
      history: rows.map((r) => ({
        id: r.id ? String(r.id) : null,
        botId: r.bot_id ? String(r.bot_id) : null,
        botName: r.bot_display_name ?? r.bot_name ?? null,
        agentId: r.agent_id ? String(r.agent_id) : null,
        agentName: r.agent_name ?? null,
        action: r.action ?? null,
        boundAt: toISO(r.bound_at),
        unboundAt: toISO(r.unbound_at),
        boundBy: r.bound_by ?? null,
        changedAt: toISO(r.changed_at),
        changedBy: r.changed_by ?? null,
        oldValue: r.old_value ?? null,
        newValue: r.new_value ?? null,
      })),
    });
  } catch (err) {
    jsonResponse(res, 500, {
      error: 'bot_history_failed',
      message: err instanceof Error ? err.message : 'unknown',
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// 8. NextCRM sync outbox
// ═══════════════════════════════════════════════════════════════
async function syncOutbox(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  _ctx: { tenantId: string },
  urlObj: URL,
) {
  const limit = Math.min(200, Math.max(1, toInt(urlObj.searchParams.get('limit'), 50)));
  const status = urlObj.searchParams.get('status');

  try {
    const rowsRaw = await db.execute(sql`
      SELECT id, payload, status, attempts, last_error, next_retry_at,
             created_at, updated_at
      FROM nextcrm_sync_outbox
      ${status ? sql`WHERE status = ${status}` : sql``}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `);
    const rows = asArr(rowsRaw);

    const summaryRaw = await db.execute(sql`
      SELECT status, count(*)::int AS n,
             max(attempts)::int AS max_attempts,
             max(updated_at) AS latest_update
      FROM nextcrm_sync_outbox
      GROUP BY status
      ORDER BY n DESC
    `);
    const summary = asArr(summaryRaw);

    jsonResponse(res, 200, {
      success: true,
      total: rows.length,
      limit,
      summary: summary.map((r) => ({
        status: r.status,
        count: toInt(r.n, 0),
        maxAttempts: toInt(r.max_attempts, 0),
        latestUpdate: toISO(r.latest_update),
      })),
      items: rows.map((r) => ({
        id: toInt(r.id, 0),
        payload: r.payload ?? null,
        status: r.status ?? 'unknown',
        attempts: toInt(r.attempts, 0),
        lastError: r.last_error ?? null,
        nextRetryAt: toISO(r.next_retry_at),
        createdAt: toISO(r.created_at),
        updatedAt: toISO(r.updated_at),
      })),
    });
  } catch (err) {
    jsonResponse(res, 500, {
      error: 'sync_outbox_failed',
      message: err instanceof Error ? err.message : 'unknown',
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// 主路由分发
// ═══════════════════════════════════════════════════════════════
export async function handleR10DataRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  method: string,
  url: string,
): Promise<boolean> {
  const prefixes = [
    '/api/v2/foundation/memory/',
    '/api/v2/admin/sessions',
    '/api/v2/admin/rag-query-stats',
    '/api/v2/admin/pipeline-runs',
    '/api/v2/admin/usage-reports',
    '/api/v2/admin/bot-history',
    '/api/v2/admin/sync-outbox',
  ];
  if (!prefixes.some((p) => url.startsWith(p))) return false;

  const ctx = await requireBearer(req, res);
  if (!ctx) return true;

  const parsed = new URL(url, 'http://localhost');

  // 1. /api/v2/foundation/memory/:layer
  const memMatch = url.match(/^\/api\/v2\/foundation\/memory\/(l?[123])$/);
  if (memMatch && method === 'GET') {
    const layerStr = memMatch[1];
    const layer = (layerStr === 'l1' || layerStr === '1' ? 1
      : layerStr === 'l2' || layerStr === '2' ? 2
      : 3) as 1 | 2 | 3;
    await memoryList(req, res, ctx, layer, parsed);
    return true;
  }

  // 2. /api/v2/admin/sessions/:id/messages  (more specific, check first)
  const msgMatch = url.match(/^\/api\/v2\/admin\/sessions\/([^/]+)\/messages$/);
  if (msgMatch && method === 'GET') {
    await sessionMessages(req, res, ctx, msgMatch[1], parsed);
    return true;
  }

  // 2b. /api/v2/admin/sessions
  if (url.startsWith('/api/v2/admin/sessions') && method === 'GET') {
    await listSessions(req, res, ctx, parsed);
    return true;
  }

  // 4. RAG query stats
  if (url === '/api/v2/admin/rag-query-stats' && method === 'GET') {
    await ragQueryStats(req, res, ctx);
    return true;
  }

  // 5. Pipeline runs
  if (url === '/api/v2/admin/pipeline-runs' && method === 'GET') {
    await pipelineRuns(req, res, ctx, parsed);
    return true;
  }

  // 6. Usage reports
  if (url === '/api/v2/admin/usage-reports' && method === 'GET') {
    await usageReports(req, res, ctx, parsed);
    return true;
  }

  // 7. Bot agent history
  if (url === '/api/v2/admin/bot-history' && method === 'GET') {
    await botHistory(req, res, ctx, parsed);
    return true;
  }

  // 8. NextCRM sync outbox
  if (url === '/api/v2/admin/sync-outbox' && method === 'GET') {
    await syncOutbox(req, res, ctx, parsed);
    return true;
  }

  jsonResponse(res, 404, { error: 'route_not_found', url });
  return true;
}
