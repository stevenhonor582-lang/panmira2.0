import type * as http from 'node:http';
import { pool } from '../../db/index.js';
import { jsonResponse } from './helpers.js';
import { requireBearer, requireAnyScope } from '../oauth-middleware.js';

export async function handleMonitoringRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  method: string,
  url: string,
): Promise<boolean> {
  const u = new URL(url, 'http://localhost');
  if (!u.pathname.startsWith('/api/v2/admin/status') &&
      !u.pathname.startsWith('/api/v2/admin/alerts') &&
      !u.pathname.startsWith('/api/v2/admin/diagnose')) return false;

  const ctx = await requireBearer(req, res);
  if (!ctx) return true;

  if (method === 'GET' && u.pathname === '/api/v2/admin/status') {
    if (!requireAnyScope(ctx, ['reports:read', 'reports:admin', 'model:read', 'agent:read', 'knowledge:read'])) {
      jsonResponse(res, 403, { error: 'insufficient_scope' });
      return true;
    }
    try {
      const countsRes = await pool.query(`
        SELECT
          (SELECT count(*) FROM provider_configs) AS llm,
          (SELECT count(*) FROM embedding_providers) AS embedding,
          (SELECT count(*) FROM mcp_servers) AS mcp,
          (SELECT count(*) FROM knowledge_bases) AS kb,
          (SELECT count(*) FROM agents) AS agent,
          (SELECT count(*) FROM oauth_clients) AS oauth
      `);
      const usageRes = await pool.query(`
        SELECT dimension, SUM(count)::bigint AS count
        FROM mv_usage_reports_daily
        WHERE date = TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD') GROUP BY dimension
      `);
      const errorsRes = await pool.query(`
        SELECT count(*)::int AS err_count FROM activity_events
        WHERE type IN ('task_failed', 'error') AND timestamp > (EXTRACT(EPOCH FROM now() - INTERVAL '24 hours') * 1000)::bigint
      `);
      const c = countsRes.rows[0];
      const usage: Record<string, number> = {};
      for (const r of usageRes.rows) usage[r.dimension] = Number(r.count);
      jsonResponse(res, 200, {
        counts: { llm: Number(c.llm), embedding: Number(c.embedding), mcp: Number(c.mcp), kb: Number(c.kb), agent: Number(c.agent), oauth: Number(c.oauth) },
        usageToday: usage,
        errorsLast24h: errorsRes.rows[0]?.err_count || 0,
        timestamp: new Date().toISOString(),
      });
      return true;
    } catch (err) {
      jsonResponse(res, 500, { error: 'internal_error', message: String(err) });
      return true;
    }
  }

  if (method === 'GET' && u.pathname === '/api/v2/admin/alerts') {
    if (!requireAnyScope(ctx, ['reports:read', 'reports:admin'])) {
      jsonResponse(res, 403, { error: 'insufficient_scope' });
      return true;
    }
    try {
      const errorsRes = await pool.query(`
        SELECT id, type, bot_name, error_message, timestamp AS created_at
        FROM activity_events
        WHERE type IN ('task_failed', 'error')
        ORDER BY timestamp DESC LIMIT 50
      `);
      jsonResponse(res, 200, { alerts: errorsRes.rows });
      return true;
    } catch (err) {
      jsonResponse(res, 500, { error: 'internal_error', message: String(err) });
      return true;
    }
  }

  const diagMatch = u.pathname.match(/^\/api\/v2\/admin\/diagnose\/(.+)$/);
  if (method === 'GET' && diagMatch) {
    if (!requireAnyScope(ctx, ['reports:read', 'reports:admin', 'audit:read'])) {
      jsonResponse(res, 403, { error: 'insufficient_scope' });
      return true;
    }
    const taskId = decodeURIComponent(diagMatch[1]);
    try {
      const sessionRes = await pool.query(`SELECT * FROM chat_sessions WHERE id::text = $1 OR bot_name = $1 ORDER BY last_used DESC LIMIT 1`, [taskId]);
      const eventsRes = await pool.query(`SELECT * FROM activity_events WHERE id::text = $1 OR chat_id::text = $1 ORDER BY timestamp DESC LIMIT 100`, [taskId]);
      jsonResponse(res, 200, {
        taskId,
        session: sessionRes.rows[0] || null,
        events: eventsRes.rows,
        found: sessionRes.rows.length + eventsRes.rows.length,
      });
      return true;
    } catch (err) {
      jsonResponse(res, 500, { error: 'internal_error', message: String(err) });
      return true;
    }
  }

  jsonResponse(res, 404, { error: 'not_found' });
  return true;
}
