import type * as http from 'node:http';
import { eq, desc } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { agents } from '../../db/schema.js';
import { jsonResponse, parseJsonBody } from './helpers.js';
import { requireBearer, requireAnyScope } from '../oauth-middleware.js';


/**
 * L9 #C: Normalize a pipeline trigger strategy value coming from the request body.
 * Accepts the canonical union ('first' | 'all' | 'race'); anything else is dropped
 * so the backend never persists an unknown value into the jsonb column.
 */
const TRIGGER_STRATEGIES = new Set(['first', 'all', 'race']);
function normalizeTriggerStrategy(raw: unknown): 'first' | 'all' | 'race' | undefined {
  return typeof raw === 'string' && TRIGGER_STRATEGIES.has(raw)
    ? (raw as 'first' | 'all' | 'race')
    : undefined;
}

/**
 * L9 #C: Merge a triggerStrategy into an existing orchestration jsonb blob.
 * Preserves every other key (orchestration may hold unrelated future config).
 * Returns undefined if there is nothing to persist.
 */
function mergeStrategyIntoOrchestration(
  orchestration: unknown,
  strategy: 'first' | 'all' | 'race' | undefined,
): Record<string, unknown> | undefined {
  if (!strategy) {
    return orchestration && typeof orchestration === 'object'
      ? (orchestration as Record<string, unknown>)
      : undefined;
  }
  const base = orchestration && typeof orchestration === 'object'
    ? (orchestration as Record<string, unknown>)
    : {};
  return { ...base, triggerStrategy: strategy };
}

export async function handleAgentsCrudRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  method: string,
  url: string,
): Promise<boolean> {
  const u = new URL(url, 'http://localhost');
  if (!u.pathname.startsWith('/api/v2/admin/agents')) return false;

  const ctx = await requireBearer(req, res);
  if (!ctx) return true;

  if (method === 'GET' && u.pathname === '/api/v2/admin/agents') {
    if (!requireAnyScope(ctx, ['agent:read', 'agent:admin'])) {
      jsonResponse(res, 403, { error: 'insufficient_scope', required: 'agent:read OR agent:admin' });
      return true;
    }
    try {
      const tenantId = ctx.tenantId || '00000000-0000-0000-0000-000000000000';
      const rows = await db.select().from(agents)
        .where(eq(agents.tenantId, tenantId))
        .orderBy(desc(agents.createdAt));
      jsonResponse(res, 200, { agents: rows });
      return true;
    } catch (err) {
      jsonResponse(res, 500, { error: 'internal_error', message: String(err) });
      return true;
    }
  }

  if (method === 'POST' && u.pathname === '/api/v2/admin/agents') {
    if (!requireAnyScope(ctx, ['agent:admin'])) {
      jsonResponse(res, 403, { error: 'insufficient_scope', required: 'agent:admin' });
      return true;
    }
    try {
      const body = await parseJsonBody(req);
      // L9 #C: accept triggerStrategy at the top level and merge into orchestration jsonb.
      const orchestration = mergeStrategyIntoOrchestration(
        body.orchestration,
        normalizeTriggerStrategy(body.triggerStrategy),
      );
      const result = await db.insert(agents).values({
        tenantId: ctx.tenantId || '00000000-0000-0000-0000-000000000000',
        name: body.name,
        description: body.description || null,
        systemPrompt: body.systemPrompt || '',
        roleTemplate: body.roleTemplate || 'general',
        capabilities: body.capabilities || [],
        tools: body.tools || [],
        isActive: true,
        ...(orchestration ? { orchestration } : {}),
      } as any).returning();
      jsonResponse(res, 201, { agent: result[0] });
      return true;
    } catch (err) {
      jsonResponse(res, 500, { error: 'internal_error', message: String(err) });
      return true;
    }
  }

  const detailMatch = u.pathname.match(/^\/api\/v2\/admin\/agents\/([^/]+)$/);
  if (method === 'GET' && detailMatch) {
    if (!requireAnyScope(ctx, ['agent:read', 'agent:admin'])) {
      jsonResponse(res, 403, { error: 'insufficient_scope', required: 'agent:read OR agent:admin' });
      return true;
    }
    const id = detailMatch[1];
    try {
      const [row] = await db.select().from(agents).where(eq(agents.id, id)).limit(1);
      if (!row) { jsonResponse(res, 404, { error: 'not_found' }); return true; }
      jsonResponse(res, 200, { agent: row });
      return true;
    } catch (err) {
      jsonResponse(res, 500, { error: 'internal_error', message: String(err) });
      return true;
    }
  }

  if (method === 'PATCH' && detailMatch) {
    if (!requireAnyScope(ctx, ['agent:admin'])) {
      jsonResponse(res, 403, { error: 'insufficient_scope', required: 'agent:admin' });
      return true;
    }
    const id = detailMatch[1];
    try {
      const body = await parseJsonBody(req);
      const updates: any = { updatedAt: new Date() };
      if (body.name !== undefined) updates.name = body.name;
      if (body.description !== undefined) updates.description = body.description;
      if (body.systemPrompt !== undefined) updates.systemPrompt = body.systemPrompt;
      if (body.isActive !== undefined) updates.isActive = !!body.isActive;
      if (body.deploymentType !== undefined) updates.deploymentType = body.deploymentType;
      if (body.orchestration !== undefined) updates.orchestration = body.orchestration;
      // L9 #C: triggerStrategy field at top-level → merge into orchestration jsonb.
      const strategyPatch = normalizeTriggerStrategy(body.triggerStrategy);
      if (strategyPatch !== undefined) {
        const existing = (updates.orchestration && typeof updates.orchestration === 'object')
          ? (updates.orchestration as Record<string, unknown>)
          : (body.orchestration && typeof body.orchestration === 'object'
              ? (body.orchestration as Record<string, unknown>)
              : {});
        updates.orchestration = { ...existing, triggerStrategy: strategyPatch };
      }
      if (body.tools !== undefined) updates.tools = body.tools;
      if (body.boundary !== undefined) updates.boundary = body.boundary;
      if (body.ironLaws !== undefined) updates.ironLaws = body.ironLaws;
      const [row] = await db.update(agents).set(updates).where(eq(agents.id, id)).returning();
      if (!row) { jsonResponse(res, 404, { error: 'not_found' }); return true; }
      jsonResponse(res, 200, { agent: row });
      return true;
    } catch (err) {
      jsonResponse(res, 500, { error: 'internal_error', message: String(err) });
      return true;
    }
  }

  if (method === 'DELETE' && detailMatch) {
    if (!requireAnyScope(ctx, ['agent:admin'])) {
      jsonResponse(res, 403, { error: 'insufficient_scope', required: 'agent:admin' });
      return true;
    }
    const id = detailMatch[1];
    try {
      await db.delete(agents).where(eq(agents.id, id));
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
