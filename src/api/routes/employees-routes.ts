/**
 * IA v6 — /api/v2/employees — 数字员工
 * 数据源: digital_employees view (= agents)
 * 老路径 /api/v2/admin/agents 加 Deprecation 头继续工作
 */
import type * as http from 'node:http';
import { pool } from '../../db/index.js';
import { jsonResponse, ok, fail, paginated, addDeprecationHeader } from './helpers.js';
import { requireBearer, requireAnyScope } from '../oauth-middleware.js';

export async function handleEmployeesRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  method: string,
  url: string,
): Promise<boolean> {
  const u = new URL(url, 'http://localhost');
  if (!u.pathname.startsWith('/api/v2/employees')) return false;

  const ctx = await requireBearer(req, res);
  if (!ctx) return true;

  const tenantId = ctx.tenantId || '00000000-0000-0000-0000-000000000000';

  // GET /api/v2/employees — 列表(从 digital_employees view)
  if (method === 'GET' && u.pathname === '/api/v2/employees') {
    if (!requireAnyScope(ctx, ['agent:read', 'agent:admin', '*'])) {
      jsonResponse(res, 403, fail('forbidden', '需要 agent:read 或 agent:admin'));
      return true;
    }
    try {
      const limit = Math.min(parseInt(u.searchParams.get('limit') || '50', 10), 200);
      const offset = parseInt(u.searchParams.get('offset') || '0', 10);
      const status = u.searchParams.get('status');
      const params: unknown[] = [tenantId];
      let where = 'tenant_id = $1';
      if (status === 'active') { where += ' AND is_active = true'; }
      else if (status === 'inactive') { where += ' AND is_active = false'; }
      params.push(limit); params.push(offset);
      const result = await pool.query(
        `SELECT id, name, display_name, role_template, description,
                capabilities, tools, deployment_type, is_active,
                version, created_at, updated_at
           FROM digital_employees
          WHERE ${where}
          ORDER BY created_at DESC
          LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );
      const countResult = await pool.query(
        `SELECT count(*) AS c FROM digital_employees WHERE ${where}`,
        params.slice(0, params.length - 2),
      );
      jsonResponse(res, 200, paginated(result.rows, parseInt(countResult.rows[0].c, 10), Math.floor(offset / limit) + 1, limit));
      return true;
    } catch (e) {
      jsonResponse(res, 500, fail('internal_error', String(e)));
      return true;
    }
  }

  // GET /api/v2/employees/:id — 详情
  const empMatch = u.pathname.match(/^\/api\/v2\/employees\/([0-9a-f-]{36})$/);
  if (method === 'GET' && empMatch) {
    const id = empMatch[1];
    try {
      const result = await pool.query(`SELECT * FROM digital_employees WHERE id = $1`, [id]);
      if (result.rows.length === 0) {
        jsonResponse(res, 404, fail('not_found', `Employee ${id} 不存在`));
        return true;
      }
      jsonResponse(res, 200, ok(result.rows[0]));
      return true;
    } catch (e) {
      jsonResponse(res, 500, fail('internal_error', String(e)));
      return true;
    }
  }

  // GET /api/v2/employees/stats
  if (method === 'GET' && u.pathname === '/api/v2/employees/stats') {
    if (!requireAnyScope(ctx, ['agent:read', 'agent:admin', '*'])) {
      jsonResponse(res, 403, fail('forbidden', '需要 agent:read 或 agent:admin'));
      return true;
    }
    try {
      const result = await pool.query(
        `SELECT
           count(*)::int AS total,
           count(*) FILTER (WHERE is_active)::int AS active,
           count(*) FILTER (WHERE deployment_type = 'bot')::int AS bots,
           count(*) FILTER (WHERE deployment_type = 'job')::int AS jobs,
           count(*) FILTER (WHERE deployment_type = 'api')::int AS apis
         FROM digital_employees WHERE tenant_id = $1`,
        [tenantId],
      );
      jsonResponse(res, 200, ok(result.rows[0]));
      return true;
    } catch (e) {
      jsonResponse(res, 500, fail('internal_error', String(e)));
      return true;
    }
  }

  return false;
}
