/**
 * R13E: routing-rules-routes.ts — routing_bindings 表 CRUD + 拖拽排序
 *
 *   GET    /api/v2/admin/routing-rules              — list (ordered by priority desc)
 *   POST   /api/v2/admin/routing-rules              — create
 *   PATCH  /api/v2/admin/routing-rules/:id          — update single rule
 *   DELETE /api/v2/admin/routing-rules/:id          — delete
 *   POST   /api/v2/admin/routing-rules/reorder      — body { ids: string[] } → reassign priority by index
 *   POST   /api/v2/admin/routing-rules/probe        — body { payload, ruleId? } → simulate match
 */
import type * as http from 'node:http';
import { eq, desc, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { routingBindings } from '../../db/schema.js';
import { jsonResponse, parseJsonBody } from './helpers.js';
import { requireBearer, requireAnyScope } from '../oauth-middleware.js';

async function list(req: http.IncomingMessage, res: http.ServerResponse) {
  const ctx = await requireBearer(req, res);
  if (!ctx) return;
  if (!requireAnyScope(ctx, ['channel:read', 'channel:admin', '*'])) {
    jsonResponse(res, 403, { error: 'insufficient_scope' }); return;
  }
  const rows = await db.select().from(routingBindings).orderBy(desc(routingBindings.priority));
  jsonResponse(res, 200, { success: true, rules: rows });
}

async function create(req: http.IncomingMessage, res: http.ServerResponse) {
  const ctx = await requireBearer(req, res);
  if (!ctx) return;
  if (!requireAnyScope(ctx, ['channel:admin', '*'])) {
    jsonResponse(res, 403, { error: 'insufficient_scope' }); return;
  }
  const body = await parseJsonBody(req);
  const { groupId, pattern, targetBots, priority, enabled } = body as Record<string, any>;
  if (!targetBots || !Array.isArray(targetBots) || targetBots.length === 0) {
    jsonResponse(res, 400, { error: 'targetBots (string[]) required' }); return;
  }
  const [row] = await db.insert(routingBindings).values({
    groupId: String(groupId || 'default'),
    pattern: pattern || null,
    targetBots: targetBots as string[],
    priority: Number(priority ?? 50),
    enabled: enabled !== false,
  } as any).returning();
  jsonResponse(res, 201, { success: true, rule: row });
}

async function update(req: http.IncomingMessage, res: http.ServerResponse, id: string) {
  const ctx = await requireBearer(req, res);
  if (!ctx) return;
  if (!requireAnyScope(ctx, ['channel:admin', '*'])) {
    jsonResponse(res, 403, { error: 'insufficient_scope' }); return;
  }
  const body = await parseJsonBody(req);
  const sets: Record<string, unknown> = { updatedAt: new Date() };
  if (body.groupId !== undefined) sets.groupId = String(body.groupId);
  if (body.pattern !== undefined) sets.pattern = body.pattern;
  if (body.targetBots !== undefined) sets.targetBots = body.targetBots;
  if (body.priority !== undefined) sets.priority = Number(body.priority);
  if (body.enabled !== undefined) sets.enabled = !!body.enabled;
  const [row] = await db.update(routingBindings).set(sets as any).where(eq(routingBindings.id, id)).returning();
  if (!row) { jsonResponse(res, 404, { error: 'not_found' }); return; }
  jsonResponse(res, 200, { success: true, rule: row });
}

async function remove(req: http.IncomingMessage, res: http.ServerResponse, id: string) {
  const ctx = await requireBearer(req, res);
  if (!ctx) return;
  if (!requireAnyScope(ctx, ['channel:admin', '*'])) {
    jsonResponse(res, 403, { error: 'insufficient_scope' }); return;
  }
  await db.delete(routingBindings).where(eq(routingBindings.id, id));
  jsonResponse(res, 200, { success: true, deleted: true, id });
}

async function reorder(req: http.IncomingMessage, res: http.ServerResponse) {
  const ctx = await requireBearer(req, res);
  if (!ctx) return;
  if (!requireAnyScope(ctx, ['channel:admin', '*'])) {
    jsonResponse(res, 403, { error: 'insufficient_scope' }); return;
  }
  const body = await parseJsonBody(req);
  const ids = Array.isArray(body.ids) ? body.ids as string[] : [];
  if (ids.length === 0) {
    jsonResponse(res, 400, { error: 'ids (string[]) required' }); return;
  }
  // Assign priority = (length - index) * 10 so order is preserved
  const total = ids.length;
  for (let i = 0; i < ids.length; i++) {
    const newPriority = (total - i) * 10;
    await db.update(routingBindings)
      .set({ priority: newPriority, updatedAt: new Date() } as any)
      .where(eq(routingBindings.id, ids[i]));
  }
  const rows = await db.select().from(routingBindings).orderBy(desc(routingBindings.priority));
  jsonResponse(res, 200, { success: true, reordered: ids.length, rules: rows });
}

async function probe(req: http.IncomingMessage, res: http.ServerResponse) {
  const ctx = await requireBearer(req, res);
  if (!ctx) return;
  if (!requireAnyScope(ctx, ['channel:read', 'channel:admin', '*'])) {
    jsonResponse(res, 403, { error: 'insufficient_scope' }); return;
  }
  const body = await parseJsonBody(req);
  const payload = body.payload as Record<string, any> | undefined;
  if (!payload) {
    jsonResponse(res, 400, { error: 'payload required' }); return;
  }
  // Load all enabled rules ordered by priority, return first match
  const rules = await db.select().from(routingBindings)
    .where(eq(routingBindings.enabled, true))
    .orderBy(desc(routingBindings.priority));
  const matches: any[] = [];
  for (const r of rules) {
    let matched = false;
    if (!r.pattern) {
      matched = true; // catch-all
    } else {
      try {
        // pattern is JSON-pointer-ish: { "field": "value" } — all keys must match payload
        const cond = JSON.parse(r.pattern);
        matched = Object.entries(cond).every(([k, v]) => payload[k] === v || String(payload[k]) === String(v));
      } catch {
        // Treat as substring/regex match on payload's "message" or stringified form
        const hay = JSON.stringify(payload);
        matched = hay.includes(String(r.pattern));
      }
    }
    if (matched) {
      matches.push({
        ruleId: r.id,
        groupId: r.groupId,
        pattern: r.pattern,
        targetBots: r.targetBots,
        priority: r.priority,
      });
    }
  }
  jsonResponse(res, 200, {
    success: true,
    matched: matches.length > 0,
    matches,
    firstMatch: matches[0] || null,
  });
}

export async function handleRoutingRulesRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  method: string,
  url: string,
): Promise<boolean> {
  if (!url.startsWith('/api/v2/admin/routing-rules')) return false;
  const u = new URL(url, 'http://localhost');

  if (u.pathname === '/api/v2/admin/routing-rules/reorder' && method === 'POST') {
    await reorder(req, res); return true;
  }
  if (u.pathname === '/api/v2/admin/routing-rules/probe' && method === 'POST') {
    await probe(req, res); return true;
  }
  if (u.pathname === '/api/v2/admin/routing-rules') {
    if (method === 'GET') { await list(req, res); return true; }
    if (method === 'POST') { await create(req, res); return true; }
  }
  const idMatch = u.pathname.match(/^\/api\/v2\/admin\/routing-rules\/([0-9a-f-]{36})$/);
  if (idMatch) {
    if (method === 'PATCH') { await update(req, res, idMatch[1]); return true; }
    if (method === 'DELETE') { await remove(req, res, idMatch[1]); return true; }
  }
  return false;
}
