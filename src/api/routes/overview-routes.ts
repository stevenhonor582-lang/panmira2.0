/**
 * IA v6 — /api/v2/overview — 公司综阅(默认入口)
 * 聚合: people count, employees count, tasks count, channels count, foundation stats
 */
import type * as http from 'node:http';
import { pool } from '../../db/index.js';
import { jsonResponse, ok, fail } from './helpers.js';
import { requireBearer, requireAnyScope } from '../oauth-middleware.js';

export async function handleOverviewRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  method: string,
  url: string,
): Promise<boolean> {
  const u = new URL(url, 'http://localhost');
  if (!u.pathname.startsWith('/api/v2/overview')) return false;

  const ctx = await requireBearer(req, res);
  if (!ctx) return true;

  const tenantId = ctx.tenantId || '00000000-0000-0000-0000-000000000000';

  // GET /api/v2/overview — 总览
  if (method === 'GET' && u.pathname === '/api/v2/overview') {
    if (!requireAnyScope(ctx, ['reports:read', '*'])) {
      jsonResponse(res, 403, fail('forbidden', '需要 reports:read'));
      return true;
    }
    try {
      const stats = await pool.query(`
        SELECT
          (SELECT count(*) FROM people WHERE tenant_id = $1 AND is_active)::int AS people_active,
          (SELECT count(*) FROM digital_employees WHERE tenant_id = $1 AND is_active)::int AS employees_active,
          (SELECT count(*) FROM agent_pipelines WHERE enabled)::int AS pipelines_active,
          (SELECT count(*) FROM scheduled_jobs WHERE enabled)::int AS scheduled_active,
          (SELECT count(*) FROM endpoints WHERE is_active)::int AS endpoints_active,
          (SELECT count(*) FROM model_pool WHERE status = 'active')::int AS llm_active
      `, [tenantId]);
      jsonResponse(res, 200, ok({
        module: 'company-overview',
        stats: stats.rows[0],
        modules: [
          { key: 'people', path: '/api/v2/people', label: '组织部' },
          { key: 'employees', path: '/api/v2/employees', label: '数字员工' },
          { key: 'foundation', path: '/api/v2/foundation', label: '数智底座' },
          { key: 'tasks', path: '/api/v2/tasks', label: '任务协作' },
          { key: 'channels', path: '/api/v2/channels', label: '资源频道' },
        ],
      }));
      return true;
    } catch (e) {
      jsonResponse(res, 500, fail('internal_error', String(e)));
      return true;
    }
  }

  return false;
}
