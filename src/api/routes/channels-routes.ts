/**
 * channels-routes.ts — IA v6 + 老路径并存
 *
 * 老路径(继续工作 + Deprecation 头):
 *   GET    /api/v2/admin/channels — routing_bindings 列表
 *   POST   /api/v2/admin/channels — 创建 routing binding
 *   DELETE /api/v2/admin/channels/:id
 *   GET    /api/v2/admin/channels/usage/* (老 channel-usage-routes.ts 承担)
 *
 * 新路径(IA v6 /api/v2/channels):
 *   GET    /api/v2/channels — endpoints view 列表(资源频道·接入点)
 *   GET    /api/v2/channels/:id — 详情
 *   GET    /api/v2/channels/health — 健康监测
 */
import type * as http from 'node:http';
import { eq, desc } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { routingBindings } from '../../db/schema.js';
import { pool } from '../../db/index.js';
import { jsonResponse, parseJsonBody, ok, fail, paginated } from './helpers.js';
import { requireBearer, requireAnyScope } from '../oauth-middleware.js';

// ── 老路径 handler(原 handleChannelsRoutes)───────────────────────
export async function handleChannelsRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  method: string,
  url: string,
): Promise<boolean> {
  const u = new URL(url, 'http://localhost');
  if (!u.pathname.startsWith('/api/v2/admin/channels')) return false;

  const ctx = await requireBearer(req, res);
  if (!ctx) return true;

  if (method === 'GET' && u.pathname === '/api/v2/admin/channels') {
    if (!requireAnyScope(ctx, ['channel:read', 'channel:admin', '*'])) {
      jsonResponse(res, 403, { error: 'insufficient_scope', required: 'channel:read OR channel:admin' });
      return true;
    }
    try {
      const rows = await db.select().from(routingBindings).orderBy(desc(routingBindings.priority));
      jsonResponse(res, 200, { channels: rows });
      return true;
    } catch (err) {
      jsonResponse(res, 500, { error: 'internal_error', message: String(err) });
      return true;
    }
  }

  if (method === 'POST' && u.pathname === '/api/v2/admin/channels') {
    if (!requireAnyScope(ctx, ['channel:admin', '*'])) {
      jsonResponse(res, 403, { error: 'insufficient_scope', required: 'channel:admin' });
      return true;
    }
    try {
      const body = await parseJsonBody(req);
      const result = await db.insert(routingBindings).values({
        groupId: body.groupId,
        pattern: body.pattern || null,
        targetBots: body.targetBots || [],
        priority: body.priority || 50,
        enabled: body.enabled !== false,
      } as any).returning();
      jsonResponse(res, 201, { channel: result[0] });
      return true;
    } catch (err: any) {
      jsonResponse(res, 500, { error: 'internal_error', message: String(err) });
      return true;
    }
  }

  const chMatch = u.pathname.match(/^\/api\/v2\/admin\/channels\/([0-9a-f-]{36})$/);
  if (chMatch) {
    const id = chMatch[1];
    if (method === 'DELETE') {
      if (!requireAnyScope(ctx, ['channel:admin', '*'])) {
        jsonResponse(res, 403, { error: 'insufficient_scope' });
        return true;
      }
      try {
        await db.delete(routingBindings).where(eq(routingBindings.id, id));
        jsonResponse(res, 200, { deleted: true });
        return true;
      } catch (err: any) {
        jsonResponse(res, 500, { error: 'internal_error', message: String(err) });
        return true;
      }
    }
    if (method === 'PATCH') {
      if (!requireAnyScope(ctx, ['channel:admin', '*'])) {
        jsonResponse(res, 403, { error: 'insufficient_scope' });
        return true;
      }
      try {
        const body = await parseJsonBody(req);
        await db.update(routingBindings).set({
          pattern: body.pattern,
          targetBots: body.targetBots,
          priority: body.priority,
          enabled: body.enabled,
        } as any).where(eq(routingBindings.id, id));
        jsonResponse(res, 200, { updated: true });
        return true;
      } catch (err: any) {
        jsonResponse(res, 500, { error: 'internal_error', message: String(err) });
        return true;
      }
    }
  }

  return false;
}

// ── IA v6 新路径 handleChannelsRoutesV6(/api/v2/channels)─────────
export async function handleChannelsRoutesV6(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  method: string,
  url: string,
): Promise<boolean> {
  const u = new URL(url, 'http://localhost');
  if (!u.pathname.startsWith('/api/v2/channels')) return false;

  const ctx = await requireBearer(req, res);
  if (!ctx) return true;

  if (method === 'GET' && u.pathname === '/api/v2/channels') {
    if (!requireAnyScope(ctx, ['channel:read', 'channel:admin', '*'])) {
      jsonResponse(res, 403, fail('forbidden', '需要 channel:read 或 channel:admin'));
      return true;
    }
    try {
      const limit = Math.min(parseInt(u.searchParams.get('limit') || '50', 10), 200);
      const offset = parseInt(u.searchParams.get('offset') || '0', 10);
      const type = u.searchParams.get('type');
      const params: unknown[] = [];
      let where = '1=1';
      if (type) { params.push(type); where += ` AND endpoint_type = $${params.length}`; }
      params.push(limit); params.push(offset);
      const result = await pool.query(
        `SELECT id, name, display_name, platform, endpoint_type, config,
                is_active, remark, created_at, updated_at
           FROM endpoints
          WHERE ${where}
          ORDER BY created_at DESC
          LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );
      const countResult = await pool.query(`SELECT count(*) AS c FROM endpoints WHERE ${where}`, params.slice(0, params.length - 2));
      jsonResponse(res, 200, paginated(result.rows, parseInt(countResult.rows[0].c, 10), Math.floor(offset / limit) + 1, limit));
      return true;
    } catch (e) {
      jsonResponse(res, 500, fail('internal_error', String(e)));
      return true;
    }
  }

  const chMatch = u.pathname.match(/^\/api\/v2\/channels\/([0-9a-f-]{36})$/);
  if (method === 'GET' && chMatch) {
    const id = chMatch[1];
    try {
      const result = await pool.query(`SELECT * FROM endpoints WHERE id = $1`, [id]);
      if (result.rows.length === 0) {
        jsonResponse(res, 404, fail('not_found', `Endpoint ${id} 不存在`));
        return true;
      }
      jsonResponse(res, 200, ok(result.rows[0]));
      return true;
    } catch (e) {
      jsonResponse(res, 500, fail('internal_error', String(e)));
      return true;
    }
  }

  if (method === 'GET' && u.pathname === '/api/v2/channels/health') {
    if (!requireAnyScope(ctx, ['channel:read', 'channel:admin', '*'])) {
      jsonResponse(res, 403, fail('forbidden', '需要 channel:read 或 channel:admin'));
      return true;
    }
    try {
      const result = await pool.query(`
        SELECT e.id, e.name, e.endpoint_type, e.is_active,
               h.latency_ms, h.healthy, h.checked_at, h.error
          FROM endpoints e
          LEFT JOIN LATERAL (
            SELECT latency_ms, healthy, checked_at, error
              FROM endpoint_health
             WHERE endpoint_id = e.id
             ORDER BY checked_at DESC LIMIT 1
          ) h ON true
      `);
      jsonResponse(res, 200, ok({ endpoints: result.rows }));
      return true;
    } catch (e) {
      jsonResponse(res, 500, fail('internal_error', String(e)));
      return true;
    }
  }

  return false;
}
