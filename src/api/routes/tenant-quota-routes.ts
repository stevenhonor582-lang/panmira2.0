/**
 * Plan C Tenant Quota CRUD 端点:
 *   /api/v2/admin/tenants/:tenantId/quotas          (GET list, POST create)
 *   /api/v2/admin/tenants/:tenantId/quotas/:id     (PATCH / DELETE)
 *
 * 权限: quota:read / quota:admin
 */
import type http from 'node:http';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { tenantQuotas } from '../../db/schema.js';
import { jsonResponse, parseJsonBody } from './helpers.js';
import { requireBearer, requireAnyScope } from '../oauth-middleware.js';
import { DIMENSIONS, type Dimension } from '../../services/usage-tracker.js';

const PERIODS = ['daily', 'monthly'] as const;
type Period = typeof PERIODS[number];

function isValidDimension(d: unknown): d is Dimension {
  return typeof d === 'string' && (DIMENSIONS as readonly string[]).includes(d);
}
function isValidPeriod(p: unknown): p is Period {
  return typeof p === 'string' && (PERIODS as readonly string[]).includes(p);
}

async function listQuotas(req: http.IncomingMessage, res: http.ServerResponse, tenantId: string) {
  const ctx = await requireBearer(req, res);
  if (!ctx) return;
  if (!requireAnyScope(ctx, ['quota:read', 'quota:admin'])) {
    jsonResponse(res, 403, { error: 'insufficient_scope', required: 'quota:read OR quota:admin' }); return;
  }
  const rows = await db.select().from(tenantQuotas)
    .where(eq(tenantQuotas.tenantId, tenantId))
    .orderBy(desc(tenantQuotas.createdAt));
  jsonResponse(res, 200, { success: true, data: rows });
}

async function createQuota(req: http.IncomingMessage, res: http.ServerResponse, tenantId: string) {
  const ctx = await requireBearer(req, res);
  if (!ctx) return;
  if (!requireAnyScope(ctx, ['quota:admin'])) {
    jsonResponse(res, 403, { error: 'insufficient_scope', required: 'quota:admin' }); return;
  }
  const body = (await parseJsonBody(req)) as Record<string, unknown>;
  const { dimension, period, limitValue, enabled } = body;
  if (!isValidDimension(dimension)) { jsonResponse(res, 400, { error: 'invalid dimension', allowed: DIMENSIONS }); return; }
  if (period && !isValidPeriod(period)) { jsonResponse(res, 400, { error: 'invalid period', allowed: PERIODS }); return; }
  if (typeof limitValue !== 'number' || limitValue <= 0) { jsonResponse(res, 400, { error: 'limitValue must be positive number' }); return; }

  // 同 tenant+dimension+period 不能重复(避免累加冲突)
  const existing = await db.select().from(tenantQuotas)
    .where(and(
      eq(tenantQuotas.tenantId, tenantId),
      eq(tenantQuotas.dimension, dimension as string),
      eq(tenantQuotas.period, (period as string) || 'daily'),
    ));
  if (existing.length > 0) {
    jsonResponse(res, 200, { success: true, data: existing[0], note: 'already exists' });
    return;
  }

  const [row] = await db.insert(tenantQuotas).values({
    tenantId,
    dimension: dimension as string,
    period: (period as string) || 'daily',
    limitValue,
    enabled: enabled !== false,
  }).returning();
  jsonResponse(res, 201, { success: true, data: row });
}

async function patchQuota(req: http.IncomingMessage, res: http.ServerResponse, tenantId: string, quotaId: string) {
  const ctx = await requireBearer(req, res);
  if (!ctx) return;
  if (!requireAnyScope(ctx, ['quota:admin'])) {
    jsonResponse(res, 403, { error: 'insufficient_scope', required: 'quota:admin' }); return;
  }
  const body = (await parseJsonBody(req)) as Record<string, unknown>;
  const [row] = await db.select().from(tenantQuotas)
    .where(and(eq(tenantQuotas.id, quotaId), eq(tenantQuotas.tenantId, tenantId)))
    .limit(1);
  if (!row) { jsonResponse(res, 404, { error: 'quota not found' }); return; }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.limitValue !== undefined) {
    if (typeof body.limitValue !== 'number' || body.limitValue <= 0) {
      jsonResponse(res, 400, { error: 'limitValue must be positive number' }); return;
    }
    updates.limitValue = body.limitValue;
  }
  if (body.enabled !== undefined) updates.enabled = Boolean(body.enabled);
  if (body.period !== undefined) {
    if (!isValidPeriod(body.period)) { jsonResponse(res, 400, { error: 'invalid period' }); return; }
    updates.period = body.period;
  }

  await db.update(tenantQuotas).set(updates).where(eq(tenantQuotas.id, quotaId));
  const [updated] = await db.select().from(tenantQuotas).where(eq(tenantQuotas.id, quotaId)).limit(1);
  jsonResponse(res, 200, { success: true, data: updated });
}

async function deleteQuota(req: http.IncomingMessage, res: http.ServerResponse, tenantId: string, quotaId: string) {
  const ctx = await requireBearer(req, res);
  if (!ctx) return;
  if (!requireAnyScope(ctx, ['quota:admin'])) {
    jsonResponse(res, 403, { error: 'insufficient_scope', required: 'quota:admin' }); return;
  }
  const [row] = await db.select().from(tenantQuotas)
    .where(and(eq(tenantQuotas.id, quotaId), eq(tenantQuotas.tenantId, tenantId)))
    .limit(1);
  if (!row) { jsonResponse(res, 404, { error: 'quota not found' }); return; }
  // 软删: enabled=false
  await db.update(tenantQuotas).set({ enabled: false, updatedAt: new Date() }).where(eq(tenantQuotas.id, quotaId));
  jsonResponse(res, 200, { success: true, data: { id: quotaId, disabled: true } });
}

export async function handleTenantQuotaRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  method: string,
  url: string,
): Promise<boolean> {
  const listMatch = url.match(/^\/api\/v2\/admin\/tenants\/([^/]+)\/quotas$/);
  if (listMatch) {
    if (method === 'GET') { await listQuotas(req, res, listMatch[1]!); return true; }
    if (method === 'POST') { await createQuota(req, res, listMatch[1]!); return true; }
  }
  const itemMatch = url.match(/^\/api\/v2\/admin\/tenants\/([^/]+)\/quotas\/([^/]+)$/);
  if (itemMatch) {
    if (method === 'PATCH') { await patchQuota(req, res, itemMatch[1]!, itemMatch[2]!); return true; }
    if (method === 'DELETE') { await deleteQuota(req, res, itemMatch[1]!, itemMatch[2]!); return true; }
  }
  return false;
}
