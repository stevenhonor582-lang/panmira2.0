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
      // R13E: derive health from bot_configs + endpoint_health (where endpoint_id is bot_id)
      const result = await pool.query(`
        SELECT b.id, b.name, b.platform, b.purpose, b.is_active, b.is_healthy,
               b.last_health_check_at,
               h.latency_ms, h.healthy, h.checked_at, h.error
          FROM bot_configs b
          LEFT JOIN LATERAL (
            SELECT latency_ms, healthy, checked_at, error
              FROM endpoint_health
             WHERE endpoint_id = b.bot_id
             ORDER BY checked_at DESC LIMIT 1
          ) h ON true
        ORDER BY b.purpose, b.name
      `);
      jsonResponse(res, 200, ok({ endpoints: result.rows }));
      return true;
    } catch (e) {
      jsonResponse(res, 500, fail('internal_error', String(e)));
      return true;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // R13E: Endpoints (bot_configs) CRUD — /api/v2/channels/endpoints
  // ═══════════════════════════════════════════════════════════════
  // GET list — supports ?purpose=outbound|inbound
  if (method === 'GET' && u.pathname === '/api/v2/channels/endpoints') {
    if (!requireAnyScope(ctx, ['channel:read', 'channel:admin', '*'])) {
      jsonResponse(res, 403, fail('forbidden', '需要 channel:read 或 channel:admin'));
      return true;
    }
    try {
      const purpose = u.searchParams.get('purpose'); // 'outbound' | 'inbound'
      const params: unknown[] = [];
      let where = '1=1';
      if (purpose) { params.push(purpose); where += ` AND purpose = $${params.length}`; }
      params.push(Math.min(parseInt(u.searchParams.get('limit') || '100', 10), 500));
      params.push(parseInt(u.searchParams.get('offset') || '0', 10));
      const result = await pool.query(
        `SELECT id, name, platform, config_json, is_active, purpose, remark,
                display_name, bot_id, is_healthy, last_health_check_at, created_at, updated_at
         FROM bot_configs
         WHERE ${where}
         ORDER BY purpose, name
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );
      jsonResponse(res, 200, ok({
        items: result.rows.map((r: any) => ({
          id: r.id,
          name: r.name,
          displayName: r.display_name,
          platform: r.platform,
          endpointType: r.purpose,
          config: r.config_json,
          isActive: r.is_active,
          isHealthy: r.is_healthy,
          lastHealthCheckAt: r.last_health_check_at,
          remark: r.remark,
          botId: r.bot_id,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        })),
        total: result.rows.length,
      }));
      return true;
    } catch (e) {
      jsonResponse(res, 500, fail('internal_error', String(e)));
      return true;
    }
  }

  // POST create endpoint
  if (method === 'POST' && u.pathname === '/api/v2/channels/endpoints') {
    if (!requireAnyScope(ctx, ['channel:admin', '*'])) {
      jsonResponse(res, 403, fail('forbidden', '需要 channel:admin'));
      return true;
    }
    try {
      const body = await parseJsonBody(req);
      const { name, platform, purpose, config, remark, isActive } = body as Record<string, any>;
      if (!name || !platform) {
        jsonResponse(res, 400, fail('invalid', 'name and platform required'));
        return true;
      }
      const p = purpose === 'inbound' ? 'inbound' : 'outbound';
      const result = await pool.query(
        `INSERT INTO bot_configs (name, platform, config_json, is_active, purpose, remark)
         VALUES ($1, $2, $3::jsonb, $4, $5, $6)
         RETURNING id, name, platform, purpose, is_active, created_at`,
        [String(name), String(platform), JSON.stringify(config || {}), isActive !== false, p, String(remark || '')],
      );
      jsonResponse(res, 201, ok({ endpoint: result.rows[0] }));
      return true;
    } catch (e: any) {
      jsonResponse(res, 500, fail('internal_error', String(e?.message || e)));
      return true;
    }
  }

  // PATCH /api/v2/channels/endpoints/:id
  const epIdMatch = u.pathname.match(/^\/api\/v2\/channels\/endpoints\/([0-9a-f-]{36})$/);
  const epMessagesMatch = u.pathname.match(/^\/api\/v2\/channels\/endpoints\/([0-9a-f-]{36})\/messages$/);
  const epLogsMatch = u.pathname.match(/^\/api\/v2\/channels\/endpoints\/([0-9a-f-]{36})\/logs$/);
  const epCallbackMatch = u.pathname.match(/^\/api\/v2\/channels\/endpoints\/([0-9a-f-]{36})\/callback-url$/);

  if (epIdMatch && method === 'PATCH') {
    if (!requireAnyScope(ctx, ['channel:admin', '*'])) {
      jsonResponse(res, 403, fail('forbidden', '需要 channel:admin'));
      return true;
    }
    try {
      const body = await parseJsonBody(req);
      const sets: string[] = ['updated_at = now()'];
      const params: any[] = [];
      let idx = 1;
      if (body.name !== undefined) { sets.push(`name = $${idx++}`); params.push(body.name); }
      if (body.platform !== undefined) { sets.push(`platform = $${idx++}`); params.push(body.platform); }
      if (body.config !== undefined) { sets.push(`config_json = $${idx++}`); params.push(JSON.stringify(body.config)); }
      if (body.isActive !== undefined) { sets.push(`is_active = $${idx++}`); params.push(!!body.isActive); }
      if (body.purpose !== undefined) { sets.push(`purpose = $${idx++}`); params.push(body.purpose); }
      if (body.remark !== undefined) { sets.push(`remark = $${idx++}`); params.push(body.remark); }
      params.push(epIdMatch[1]);
      const result = await pool.query(
        `UPDATE bot_configs SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
        params,
      );
      if (result.rows.length === 0) {
        jsonResponse(res, 404, fail('not_found', 'Endpoint not found'));
      } else {
        jsonResponse(res, 200, ok({ endpoint: result.rows[0] }));
      }
      return true;
    } catch (e: any) {
      jsonResponse(res, 500, fail('internal_error', String(e?.message || e)));
      return true;
    }
  }

  if (epIdMatch && method === 'DELETE') {
    if (!requireAnyScope(ctx, ['channel:admin', '*'])) {
      jsonResponse(res, 403, fail('forbidden', '需要 channel:admin'));
      return true;
    }
    try {
      await pool.query('DELETE FROM bot_configs WHERE id = $1', [epIdMatch[1]]);
      jsonResponse(res, 200, ok({ deleted: true, id: epIdMatch[1] }));
      return true;
    } catch (e: any) {
      jsonResponse(res, 500, fail('internal_error', String(e?.message || e)));
      return true;
    }
  }

  // GET messages flow for an endpoint (activity_events via bot_name or bot_id)
  if (epMessagesMatch && method === 'GET') {
    if (!requireAnyScope(ctx, ['channel:read', 'channel:admin', '*'])) {
      jsonResponse(res, 403, fail('forbidden', 'insufficient_scope'));
      return true;
    }
    try {
      // Resolve bot_name from bot_configs
      const { rows: cfgRows } = await pool.query(
        'SELECT name, bot_id FROM bot_configs WHERE id = $1',
        [epMessagesMatch[1]],
      );
      if (cfgRows.length === 0) {
        jsonResponse(res, 404, fail('not_found', 'Endpoint not found'));
        return true;
      }
      const botName = cfgRows[0].name;
      const { rows } = await pool.query(
        `SELECT id, type, chat_id, user_id, prompt, response_preview, cost_usd, duration_ms,
                error_message, timestamp, model
         FROM activity_events
         WHERE bot_name = $1
         ORDER BY timestamp DESC
         LIMIT 20`,
        [botName],
      );
      jsonResponse(res, 200, ok({
        endpointId: epMessagesMatch[1],
        botName,
        messages: rows.map((r: any) => ({
          id: r.id,
          type: r.type,
          chatId: r.chat_id,
          userId: r.user_id,
          prompt: r.prompt,
          responsePreview: r.response_preview,
          costUsd: r.cost_usd,
          durationMs: r.duration_ms,
          error: r.error_message,
          timestamp: r.timestamp,
          model: r.model,
        })),
      }));
      return true;
    } catch (e: any) {
      jsonResponse(res, 500, fail('internal_error', String(e?.message || e)));
      return true;
    }
  }

  // GET inbound logs (calls into our system) — derived from oauth_access_tokens + audit_logs
  if (epLogsMatch && method === 'GET') {
    if (!requireAnyScope(ctx, ['channel:read', 'channel:admin', '*'])) {
      jsonResponse(res, 403, fail('forbidden', 'insufficient_scope'));
      return true;
    }
    try {
      const { rows } = await pool.query(
        `SELECT a.id, a.action, a.resource_type, a.resource_id, a.created_at, a.details
         FROM audit_logs a
         WHERE a.resource_type IN ('channel', 'endpoint', 'inbound')
         ORDER BY a.created_at DESC
         LIMIT 50`,
      );
      jsonResponse(res, 200, ok({
        endpointId: epLogsMatch[1],
        logs: rows.map((r: any) => ({
          id: r.id,
          action: r.action,
          resourceType: r.resource_type,
          resourceId: r.resource_id,
          createdAt: r.created_at,
          details: r.details,
        })),
      }));
      return true;
    } catch (e: any) {
      jsonResponse(res, 500, fail('internal_error', String(e?.message || e)));
      return true;
    }
  }

  // GET callback URL for inbound endpoint
  if (epCallbackMatch && method === 'GET') {
    if (!requireAnyScope(ctx, ['channel:read', 'channel:admin', '*'])) {
      jsonResponse(res, 403, fail('forbidden', 'insufficient_scope'));
      return true;
    }
    try {
      const { rows } = await pool.query(
        'SELECT id, name, bot_id, config_json FROM bot_configs WHERE id = $1 AND purpose = $2',
        [epCallbackMatch[1], 'inbound'],
      );
      if (rows.length === 0) {
        jsonResponse(res, 404, fail('not_found', 'Inbound endpoint not found'));
        return true;
      }
      const callbackUrl = `${process.env.PUBLIC_URL || 'https://api.panmira.example.com'}/api/v2/channels/webhook/${rows[0].bot_id}`;
      const cfg = rows[0].config_json || {};
      jsonResponse(res, 200, ok({
        endpointId: rows[0].id,
        botId: rows[0].bot_id,
        callbackUrl,
        allowedMethods: cfg.allowedMethods || ['POST'],
        rateLimit: cfg.rateLimit || { windowMs: 60000, max: 100 },
      }));
      return true;
    } catch (e: any) {
      jsonResponse(res, 500, fail('internal_error', String(e?.message || e)));
      return true;
    }
  }

  return false;
}
