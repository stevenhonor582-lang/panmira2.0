/**
 * CRUD routes for routing bindings (Phase 3).
 * Endpoints:
 *   GET    /api/bindings           — list all (optional ?groupId=xxx)
 *   POST   /api/bindings           — create
 *   PUT    /api/bindings/:id       — update
 *   DELETE /api/bindings/:id       — delete
 */
import type * as http from 'node:http';
import type { RouteContext, RouteHandler } from './types.js';
import { jsonResponse, parseJsonBody } from './helpers.js';

export const handleBindingRoutes: RouteHandler = async (
  ctx: RouteContext,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  method: string,
  url: string,
): Promise<boolean> => {
  if (!url.startsWith('/api/bindings')) return false;
  const engine = ctx.bindingEngine;
  if (!engine) {
    jsonResponse(res, 503, { error: 'BindingEngine not configured' });
    return true;
  }

  // GET /api/bindings
  if (method === 'GET' && url === '/api/bindings') {
    const bindings = await engine.list();
    jsonResponse(res, 200, { bindings });
    return true;
  }

  // GET /api/bindings?groupId=xxx
  const listMatch = url.match(/^\/api\/bindings\?groupId=(.+)$/);
  if (method === 'GET' && (listMatch || url.includes('groupId='))) {
    const params = new URL(url, 'http://localhost');
    const groupId = params.searchParams.get('groupId');
    const bindings = await engine.list(groupId || undefined);
    jsonResponse(res, 200, { bindings });
    return true;
  }

  // POST /api/bindings
  if (method === 'POST' && url === '/api/bindings') {
    const body: any = await parseJsonBody(req);
    if (!body.groupId || !body.targetBots?.length) {
      jsonResponse(res, 400, { error: 'groupId and targetBots are required' });
      return true;
    }
    const binding = await engine.create({
      groupId: body.groupId as string,
      pattern: body.pattern,
      targetBots: body.targetBots as string[],
      priority: body.priority,
      enabled: body.enabled,
    });
    jsonResponse(res, 201, { binding });
    return true;
  }

  // PUT /api/bindings/:id
  const putMatch = url.match(/^\/api\/bindings\/([0-9a-f-]+)$/);
  if (method === 'PUT' && putMatch) {
    const body: any = await parseJsonBody(req);
    const binding = await engine.update(putMatch[1], {
      pattern: body.pattern,
      targetBots: body.targetBots,
      priority: body.priority,
      enabled: body.enabled,
    });
    if (!binding) { jsonResponse(res, 404, { error: 'Binding not found' }); return true; }
    jsonResponse(res, 200, { binding });
    return true;
  }

  // DELETE /api/bindings/:id
  const delMatch = url.match(/^\/api\/bindings\/([0-9a-f-]+)$/);
  if (method === 'DELETE' && delMatch) {
    const ok = await engine.delete(delMatch[1]);
    if (!ok) { jsonResponse(res, 404, { error: 'Binding not found' }); return true; }
    jsonResponse(res, 200, { ok: true });
    return true;
  }

  return false;
};
