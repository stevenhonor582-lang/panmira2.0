/**
 * IA v6 — /api/v2/people — 组织部
 * 数据源: people view (users + people_profile_extended)
 * 老路径: 无(全新模块,只是组织用户)
 */
import type * as http from 'node:http';
import { pool } from '../../db/index.js';
import { jsonResponse, parseJsonBody, ok, fail, paginated } from './helpers.js';
import { requireBearer, requireAnyScope } from '../oauth-middleware.js';

export async function handlePeopleRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  method: string,
  url: string,
): Promise<boolean> {
  const u = new URL(url, 'http://localhost');
  if (!u.pathname.startsWith('/api/v2/people')) return false;

  const ctx = await requireBearer(req, res);
  if (!ctx) return true;

  const tenantId = ctx.tenantId || '00000000-0000-0000-0000-000000000000';

  // GET /api/v2/people — 列表
  if (method === 'GET' && u.pathname === '/api/v2/people') {
    if (!requireAnyScope(ctx, ['people:read', 'people:admin', '*'])) {
      jsonResponse(res, 403, fail('forbidden', '需要 people:read 或 people:admin'));
      return true;
    }
    try {
      const limit = Math.min(parseInt(u.searchParams.get('limit') || '50', 10), 200);
      const offset = parseInt(u.searchParams.get('offset') || '0', 10);
      const dept = u.searchParams.get('department');
      const params: unknown[] = [tenantId];
      let where = 'tenant_id = $1';
      if (dept) { params.push(dept); where += ` AND department = $${params.length}`; }
      params.push(limit); params.push(offset);
      const result = await pool.query(
        `SELECT id, tenant_id, email, name, avatar_url, role, is_active,
                department, title, status, hired_at, rate_per_min, daily_tokens,
                team_ids, created_at, updated_at
           FROM people
          WHERE ${where}
          ORDER BY created_at DESC
          LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );
      const countResult = await pool.query(
        `SELECT count(*) AS c FROM people WHERE ${where}`,
        params.slice(0, params.length - 2),
      );
      jsonResponse(res, 200, paginated(result.rows, parseInt(countResult.rows[0].c, 10), Math.floor(offset / limit) + 1, limit));
      return true;
    } catch (e) {
      jsonResponse(res, 500, fail('internal_error', String(e)));
      return true;
    }
  }

  // GET /api/v2/people/:id — 详情
  const personMatch = u.pathname.match(/^\/api\/v2\/people\/([0-9a-f-]{36})$/);
  if (method === 'GET' && personMatch) {
    const id = personMatch[1];
    try {
      const result = await pool.query(`SELECT * FROM people WHERE id = $1`, [id]);
      if (result.rows.length === 0) {
        jsonResponse(res, 404, fail('not_found', `Person ${id} 不存在`));
        return true;
      }
      jsonResponse(res, 200, ok(result.rows[0]));
      return true;
    } catch (e) {
      jsonResponse(res, 500, fail('internal_error', String(e)));
      return true;
    }
  }

  // PATCH /api/v2/people/:id — 更新 People 扩展档案
  if (method === 'PATCH' && personMatch) {
    if (!requireAnyScope(ctx, ['people:admin', '*'])) {
      jsonResponse(res, 403, fail('forbidden', '需要 people:admin'));
      return true;
    }
    const id = personMatch[1];
    try {
      const body = await parseJsonBody(req);
      const { department, title, hired_at, skills, status, rate_per_min, bio } = body;
      await pool.query(
        `INSERT INTO people_profile_extended
           (user_id, department, title, hired_at, skills, status, rate_per_min, bio, updated_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, now())
         ON CONFLICT (user_id) DO UPDATE SET
           department = EXCLUDED.department,
           title = EXCLUDED.title,
           hired_at = EXCLUDED.hired_at,
           skills = EXCLUDED.skills,
           status = EXCLUDED.status,
           rate_per_min = EXCLUDED.rate_per_min,
           bio = EXCLUDED.bio,
           updated_at = now()`,
        [id, department, title, hired_at, JSON.stringify(skills || []), status, rate_per_min, bio],
      );
      jsonResponse(res, 200, ok({ updated: true, id }));
      return true;
    } catch (e) {
      jsonResponse(res, 500, fail('internal_error', String(e)));
      return true;
    }
  }

  // GET /api/v2/people/stats — 统计
  if (method === 'GET' && u.pathname === '/api/v2/people/stats') {
    if (!requireAnyScope(ctx, ['people:read', 'people:admin', '*'])) {
      jsonResponse(res, 403, fail('forbidden', '需要 people:read 或 people:admin'));
      return true;
    }
    try {
      const result = await pool.query(
        `SELECT
           count(*)::int AS total,
           count(*) FILTER (WHERE is_active)::int AS active,
           count(DISTINCT department)::int AS departments,
           COALESCE(sum(daily_tokens), 0)::bigint AS total_daily_tokens
         FROM people WHERE tenant_id = $1`,
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
