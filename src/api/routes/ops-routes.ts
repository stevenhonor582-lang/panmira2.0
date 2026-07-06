import type * as http from 'node:http';
import { pool } from '../../db/index.js';
import { jsonResponse } from './helpers.js';
import { requireBearer, requireAnyScope } from '../oauth-middleware.js';

export async function handleOpsRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  method: string,
  url: string,
): Promise<boolean> {
  const u = new URL(url, 'http://localhost');
  if (!u.pathname.startsWith('/api/v2/admin/audit') &&
      !u.pathname.startsWith('/api/v2/admin/cost')) return false;

  const ctx = await requireBearer(req, res);
  if (!ctx) return true;

  if (method === 'GET' && u.pathname === '/api/v2/admin/cost') {
    if (!requireAnyScope(ctx, ['reports:read', 'reports:admin'])) {
      jsonResponse(res, 403, { error: 'insufficient_scope' });
      return true;
    }
    try {
      const res2 = await pool.query(`
        SELECT date, dimension, SUM(cost_usd)::numeric AS cost
        FROM mv_usage_reports_daily
        WHERE date >= (CURRENT_DATE - INTERVAL '30 days')::date
        GROUP BY date, dimension
        ORDER BY date DESC
      `);
      const total = await pool.query(`SELECT COALESCE(SUM(cost_usd), 0)::numeric AS total FROM mv_usage_reports_daily WHERE date >= (CURRENT_DATE - INTERVAL '30 days')::date`);
      jsonResponse(res, 200, {
        totalLast30d: Number(total.rows[0].total),
        breakdown: res2.rows,
      });
      return true;
    } catch (err) {
      jsonResponse(res, 500, { error: 'internal_error', message: String(err) });
      return true;
    }
  }

  if (method === 'GET' && u.pathname === '/api/v2/admin/audit') {
    if (!requireAnyScope(ctx, ['audit:read', 'reports:admin'])) {
      jsonResponse(res, 403, { error: 'insufficient_scope', required: 'audit:read OR reports:admin' });
      return true;
    }
    try {
      const limit = Math.min(Number(u.searchParams.get('limit')) || 50, 200);
      const res2 = await pool.query(`SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT $1`, [limit]);
      jsonResponse(res, 200, { logs: res2.rows });
      return true;
    } catch (err) {
      jsonResponse(res, 500, { error: 'internal_error', message: String(err) });
      return true;
    }
  }

  jsonResponse(res, 404, { error: 'not_found' });
  return true;
}
