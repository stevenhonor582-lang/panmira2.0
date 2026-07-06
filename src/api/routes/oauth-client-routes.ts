/**
 * Plan B-3 OAuth client CRUD 端点:
 *   /api/v2/admin/oauth-clients         (GET list, POST create)
 *   /api/v2/admin/oauth-clients/:id     (GET / PATCH / DELETE)
 *   /api/v2/admin/oauth-clients/:id/secret/rotate  (POST)
 *
 * 模式: 跟 resource-routes 一样,挂 http-server
 * 权限: oauth:admin
 * 注意: client_secret 明文只在创建 / rotate 时返回一次
 */
import type http from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { oauthClients, tenants } from '../../db/schema.js';
import { jsonResponse, parseJsonBody } from './helpers.js';
import { requireBearer, requireAnyScope } from '../oauth-middleware.js';

const TYPES = ['web', 'native', 'cli', 'mcp_server'] as const;

function isValidType(t: unknown): t is typeof TYPES[number] {
  return typeof t === 'string' && (TYPES as readonly string[]).includes(t);
}

function genClientId(): string {
  return 'cli_' + randomBytes(16).toString('base64url');
}

function genClientSecret(): string {
  return randomBytes(32).toString('base64url');
}

function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

// ── list ────────────────────────────────────────────────────────────────
async function listOAuthClients(req: http.IncomingMessage, res: http.ServerResponse) {
  const ctx = await requireBearer(req, res);
  if (!ctx) return;
  if (!requireAnyScope(ctx, ['oauth:admin'])) {
    jsonResponse(res, 403, { error: 'insufficient_scope', required: 'oauth:admin' }); return;
  }
  const rows = await db.select().from(oauthClients)
    .where(eq(oauthClients.tenantId, ctx.tenantId))
    .orderBy(desc(oauthClients.createdAt));
  // 不返回 clientSecretHash (内部字段)
  const safe = rows.map(({ clientSecretHash, ...rest }) => rest);
  jsonResponse(res, 200, { success: true, data: safe });
}

// ── create ──────────────────────────────────────────────────────────────
async function createOAuthClient(req: http.IncomingMessage, res: http.ServerResponse) {
  const ctx = await requireBearer(req, res);
  if (!ctx) return;
  if (!requireAnyScope(ctx, ['oauth:admin'])) {
    jsonResponse(res, 403, { error: 'insufficient_scope', required: 'oauth:admin' }); return;
  }

  const body = (await parseJsonBody(req)) as Record<string, unknown>;
  const { name, type, redirectUris, scopes, generateSecret } = body;
  if (!name || typeof name !== 'string') { jsonResponse(res, 400, { error: 'name required' }); return; }
  if (!isValidType(type)) { jsonResponse(res, 400, { error: 'invalid type', allowed: TYPES }); return; }
  if (redirectUris && !Array.isArray(redirectUris)) { jsonResponse(res, 400, { error: 'redirectUris must be array' }); return; }
  if (scopes && !Array.isArray(scopes)) { jsonResponse(res, 400, { error: 'scopes must be array' }); return; }

  // 验证 tenant 存在
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, ctx.tenantId)).limit(1);
  if (!tenant) { jsonResponse(res, 400, { error: 'tenant not found' }); return; }

  const clientId = genClientId();
  const shouldGenerate = generateSecret !== false; // 默认 true
  const clientSecret = shouldGenerate ? genClientSecret() : null;
  const clientSecretHash = clientSecret ? hashSecret(clientSecret) : null;

  const [row] = await db.insert(oauthClients).values({
    tenantId: ctx.tenantId,
    name: String(name),
    type,
    clientId,
    clientSecretHash,
    redirectUris: (redirectUris as string[]) || [],
    scopes: (scopes as string[]) || [],
    status: 'active',
  }).returning();

  // 响应里返回明文 secret (仅此一次)
  const { clientSecretHash: _h, ...safe } = row;
  jsonResponse(res, 201, {
    success: true,
    data: { ...safe, ...(clientSecret ? { clientSecret } : {}) },
  });
}

// ── get by id ───────────────────────────────────────────────────────────
async function getOAuthClient(req: http.IncomingMessage, res: http.ServerResponse, id: string) {
  const ctx = await requireBearer(req, res);
  if (!ctx) return;
  if (!requireAnyScope(ctx, ['oauth:admin'])) {
    jsonResponse(res, 403, { error: 'insufficient_scope', required: 'oauth:admin' }); return;
  }
  const [row] = await db.select().from(oauthClients).where(eq(oauthClients.id, id)).limit(1);
  if (!row) { jsonResponse(res, 404, { error: 'client not found' }); return; }
  if (row.tenantId !== ctx.tenantId) { jsonResponse(res, 403, { error: 'forbidden' }); return; }
  const { clientSecretHash, ...safe } = row;
  jsonResponse(res, 200, { success: true, data: safe });
}

// ── patch ───────────────────────────────────────────────────────────────
async function patchOAuthClient(req: http.IncomingMessage, res: http.ServerResponse, id: string) {
  const ctx = await requireBearer(req, res);
  if (!ctx) return;
  if (!requireAnyScope(ctx, ['oauth:admin'])) {
    jsonResponse(res, 403, { error: 'insufficient_scope', required: 'oauth:admin' }); return;
  }
  const body = (await parseJsonBody(req)) as Record<string, unknown>;
  const [row] = await db.select().from(oauthClients).where(eq(oauthClients.id, id)).limit(1);
  if (!row) { jsonResponse(res, 404, { error: 'client not found' }); return; }
  if (row.tenantId !== ctx.tenantId) { jsonResponse(res, 403, { error: 'forbidden' }); return; }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name !== undefined) {
    if (typeof body.name !== 'string') { jsonResponse(res, 400, { error: 'name must be string' }); return; }
    updates.name = body.name;
  }
  if (body.redirectUris !== undefined) {
    if (!Array.isArray(body.redirectUris)) { jsonResponse(res, 400, { error: 'redirectUris must be array' }); return; }
    updates.redirectUris = body.redirectUris;
  }
  if (body.scopes !== undefined) {
    if (!Array.isArray(body.scopes)) { jsonResponse(res, 400, { error: 'scopes must be array' }); return; }
    updates.scopes = body.scopes;
  }

  await db.update(oauthClients).set(updates).where(eq(oauthClients.id, id));
  const [updated] = await db.select().from(oauthClients).where(eq(oauthClients.id, id)).limit(1);
  const { clientSecretHash, ...safe } = updated!;
  jsonResponse(res, 200, { success: true, data: safe });
}

// ── delete (软删) ──────────────────────────────────────────────────────
async function deleteOAuthClient(req: http.IncomingMessage, res: http.ServerResponse, id: string) {
  const ctx = await requireBearer(req, res);
  if (!ctx) return;
  if (!requireAnyScope(ctx, ['oauth:admin'])) {
    jsonResponse(res, 403, { error: 'insufficient_scope', required: 'oauth:admin' }); return;
  }
  const [row] = await db.select().from(oauthClients).where(eq(oauthClients.id, id)).limit(1);
  if (!row) { jsonResponse(res, 404, { error: 'client not found' }); return; }
  if (row.tenantId !== ctx.tenantId) { jsonResponse(res, 403, { error: 'forbidden' }); return; }

  await db.update(oauthClients).set({ status: 'revoked', updatedAt: new Date() }).where(eq(oauthClients.id, id));
  jsonResponse(res, 200, { success: true, data: { id, revoked: true } });
}

// ── rotate secret ──────────────────────────────────────────────────────
async function rotateSecret(req: http.IncomingMessage, res: http.ServerResponse, id: string) {
  const ctx = await requireBearer(req, res);
  if (!ctx) return;
  if (!requireAnyScope(ctx, ['oauth:admin'])) {
    jsonResponse(res, 403, { error: 'insufficient_scope', required: 'oauth:admin' }); return;
  }
  const [row] = await db.select().from(oauthClients).where(eq(oauthClients.id, id)).limit(1);
  if (!row) { jsonResponse(res, 404, { error: 'client not found' }); return; }
  if (row.tenantId !== ctx.tenantId) { jsonResponse(res, 403, { error: 'forbidden' }); return; }

  const newSecret = genClientSecret();
  const newHash = hashSecret(newSecret);
  await db.update(oauthClients).set({ clientSecretHash: newHash, updatedAt: new Date() }).where(eq(oauthClients.id, id));
  // 返回明文 secret (仅此一次)
  jsonResponse(res, 200, {
    success: true,
    data: { id, clientId: row.clientId, clientSecret: newSecret, rotatedAt: new Date().toISOString() },
  });
}

// ── dispatch ────────────────────────────────────────────────────────────
export async function handleOAuthClientRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  method: string,
  url: string,
): Promise<boolean> {
  if (url === '/api/v2/admin/oauth-clients') {
    if (method === 'GET') { await listOAuthClients(req, res); return true; }
    if (method === 'POST') { await createOAuthClient(req, res); return true; }
  }

  // /api/v2/admin/oauth-clients/:id
  const idMatch = url.match(/^\/api\/v2\/admin\/oauth-clients\/([^/]+)$/);
  if (idMatch) {
    if (method === 'GET') { await getOAuthClient(req, res, idMatch[1]!); return true; }
    if (method === 'PATCH') { await patchOAuthClient(req, res, idMatch[1]!); return true; }
    if (method === 'DELETE') { await deleteOAuthClient(req, res, idMatch[1]!); return true; }
  }

  // /api/v2/admin/oauth-clients/:id/secret/rotate
  const rotateMatch = url.match(/^\/api\/v2\/admin\/oauth-clients\/([^/]+)\/secret\/rotate$/);
  if (rotateMatch && method === 'POST') {
    await rotateSecret(req, res, rotateMatch[1]!); return true;
  }

  return false;
}
