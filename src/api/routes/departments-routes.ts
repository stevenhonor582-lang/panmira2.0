/**
 * R56-C · 部门 CRUD 路由
 *
 * 端点:
 *   GET    /api/v2/departments     列表(系统部门 + 当前租户的 custom 部门)
 *   POST   /api/v2/departments     新建(custom,自动 source='custom')
 *
 * 决策:
 *   - 系统部门(tenant_id IS NULL)全租户可见,只读
 *   - custom 部门按 tenant_id 过滤
 */
import type * as http from 'node:http';
import { eq, and, or, isNull, ilike, sql } from 'drizzle-orm';
import { db, pool } from '../../db/index.js';
import { departments } from '../../db/schema.js';
import { jsonResponse, parseJsonBody } from './helpers.js';
import { requireBearer, requireAnyScope } from '../oauth-middleware.js';

export async function handleDepartmentsRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  method: string,
  url: string,
): Promise<boolean> {
  const u = new URL(url, 'http://localhost');
  if (!u.pathname.startsWith('/api/v2/departments')) return false;

  const ctx = await requireBearer(req, res);
  if (!ctx) return true;
  const tenantId = ctx.tenantId || null;

  // ── GET /api/v2/departments ── 列表
  if (method === 'GET' && u.pathname === '/api/v2/departments') {
    if (!requireAnyScope(ctx, ['agent:read', 'agent:admin', '*'])) {
      jsonResponse(res, 403, { error: 'forbidden', message: '需要 agent:read 或 agent:admin' });
      return true;
    }
    try {
      const source = u.searchParams.get('source');
      const q = u.searchParams.get('q');

      const conds: any[] = [
        // 系统部门 + 当前租户的 custom 部门
        isNull(departments.tenantId),
        ...(tenantId ? [eq(departments.tenantId, tenantId)] : []),
      ];
      const tenantFilter = or(...conds);

      const where = and(
        source ? eq(departments.source, source) : undefined,
        q ? ilike(departments.name, `%${q}%`) : undefined,
        tenantFilter,
      );

      const rows = await db
        .select()
        .from(departments)
        .where(where)
        .orderBy(sql`source ASC, name ASC`);

      jsonResponse(res, 200, { success: true, data: rows });
      return true;
    } catch (err: any) {
      console.error('[departments] GET error:', err);
      jsonResponse(res, 500, { error: 'internal_error', message: err?.message || String(err) });
      return true;
    }
  }

  // ── POST /api/v2/departments ── 新建
  if (method === 'POST' && u.pathname === '/api/v2/departments') {
    if (!requireAnyScope(ctx, ['agent:admin', '*'])) {
      jsonResponse(res, 403, { error: 'forbidden', message: '需要 agent:admin' });
      return true;
    }
    try {
      const body = (await parseJsonBody(req)) as Record<string, any>;
      const name = String(body?.name || '').trim();
      if (!name) {
        jsonResponse(res, 400, { error: 'invalid_input', message: 'name 必填' });
        return true;
      }
      const color = String(body?.color || '#64748b').trim();

      // 校验名称不与系统部门冲突
      const sysDup = await db
        .select()
        .from(departments)
        .where(and(isNull(departments.tenantId), eq(departments.name, name)))
        .limit(1);
      if (sysDup.length > 0) {
        jsonResponse(res, 409, { error: 'name_conflict', message: `系统已存在同名部门: ${name}` });
        return true;
      }

      const [row] = await db
        .insert(departments)
        .values({
          tenantId: tenantId || null,
          name,
          color,
          source: 'custom',
        })
        .returning();

      jsonResponse(res, 201, { success: true, data: row });
      return true;
    } catch (err: any) {
      const cause = err?.cause;
      const causeCode = cause?.code || '';
      const causeMsg = cause?.message || '';
      if (causeCode === '23505' || causeMsg.includes('duplicate') || causeMsg.includes('unique') || causeMsg.includes('UNIQUE')) {
        jsonResponse(res, 409, { error: 'duplicate', message: '同名部门已存在' });
        return true;
      }
      console.error('[departments] POST error:', err);
      jsonResponse(res, 500, { error: 'internal_error', message: err?.message || String(err) });
      return true;
    }
  }

  return false;
}
