/**
 * Plan C 维护端点:
 *   POST /api/v2/admin/maintenance/refresh-mv  (maintenance:admin)
 *   调 refresh_daily_usage() 函数刷新物化视图
 */
import type http from 'node:http';
import { pool } from '../../db/index.js';
import { jsonResponse } from './helpers.js';
import { requireBearer, requireAnyScope } from '../oauth-middleware.js';

async function refreshMv(req: http.IncomingMessage, res: http.ServerResponse) {
  const ctx = await requireBearer(req, res);
  if (!ctx) return;
  if (!requireAnyScope(ctx, ['maintenance:admin'])) {
    jsonResponse(res, 403, { error: 'insufficient_scope', required: 'maintenance:admin' }); return;
  }
  const start = Date.now();
  try {
    await pool.query('SELECT refresh_daily_usage()');
    jsonResponse(res, 200, {
      success: true,
      data: { refreshed: 'mv_usage_reports_daily', durationMs: Date.now() - start, at: new Date().toISOString() },
    });
  } catch (err) {
    jsonResponse(res, 500, { error: 'refresh_failed', message: (err as Error).message });
  }
}

export async function handleMaintenanceRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  method: string,
  url: string,
): Promise<boolean> {
  if (url === '/api/v2/admin/maintenance/refresh-mv' && method === 'POST') {
    await refreshMv(req, res);
    return true;
  }
  return false;
}
