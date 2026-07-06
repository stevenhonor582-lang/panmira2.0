import type * as http from 'node:http';
import { eq, desc } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { routingBindings } from '../../db/schema.js';
import { jsonResponse, parseJsonBody } from './helpers.js';
import { requireBearer, requireAnyScope } from '../oauth-middleware.js';

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
    if (!requireAnyScope(ctx, ['channel:read', 'channel:admin'])) {
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
    if (!requireAnyScope(ctx, ['channel:admin'])) {
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
    } catch (err) {
      jsonResponse(res, 500, { error: 'internal_error', message: String(err) });
      return true;
    }
  }

  const detailMatch = u.pathname.match(/^\/api\/v2\/admin\/channels\/([^/]+)$/);
  if (method === 'DELETE' && detailMatch) {
    if (!requireAnyScope(ctx, ['channel:admin'])) {
      jsonResponse(res, 403, { error: 'insufficient_scope', required: 'channel:admin' });
      return true;
    }
    const id = detailMatch[1];
    try {
      await db.delete(routingBindings).where(eq(routingBindings.id, id));
      jsonResponse(res, 200, { deleted: id });
      return true;
    } catch (err) {
      jsonResponse(res, 500, { error: 'internal_error', message: String(err) });
      return true;
    }
  }

  jsonResponse(res, 404, { error: 'not_found' });
  return true;
}
