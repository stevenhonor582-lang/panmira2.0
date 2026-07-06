/**
 * Plan B-2 数智底座 KB 端点:
 *   /api/v2/admin/knowledge-bases        (CRUD,需 knowledge:admin scope)
 *   /api/v2/admin/knowledge-bases/:id    (GET/PATCH/DELETE)
 *   /api/v2/admin/knowledge-bases/:id/indexing  (POST, 异步 202)
 *
 * 模式: 跟 resource-routes 一样,纯函数 handleKnowledgeBaseRoutes,挂 http-server
 * 权限:
 *   - knowledge:read / knowledge:admin  读
 *   - knowledge:admin                   写
 *   - 8 类 type enum 校验
 *   - visibility 权限 (personal/team/company)
 */
import type http from 'node:http';
import { eq, and, desc, isNull, or } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { knowledgeBases, agentKnowledgeRefs } from '../../db/schema.js';
import { jsonResponse, parseJsonBody } from './helpers.js';
import { requireBearer, requireScopes } from '../oauth-middleware.js';

const KB_TYPES = ['industry', 'product', 'competitor', 'solution', 'pricing', 'company', 'department', 'personal'] as const;
const VISIBILITIES = ['private', 'team', 'company'] as const;

function isValidType(t: unknown): t is typeof KB_TYPES[number] {
  return typeof t === 'string' && (KB_TYPES as readonly string[]).includes(t);
}
function isValidVisibility(v: unknown): v is typeof VISIBILITIES[number] {
  return typeof v === 'string' && (VISIBILITIES as readonly string[]).includes(v);
}

/** 检查 ctx 是否有权访问某 KB(visibility 规则) */
function canAccessKb(ctx: { tenantId: string; userId?: string; teamId?: string }, kb: {
  tenantId: string;
  visibility: string;
  ownerUserId: string | null;
  teamId: string | null;
}): boolean {
  if (ctx.tenantId !== kb.tenantId) return false;
  if (kb.visibility === 'company') return true;
  if (kb.visibility === 'private') {
    return !!(kb.ownerUserId && ctx.userId && kb.ownerUserId === ctx.userId);
  }
  // team
  if (kb.teamId && ctx.teamId && kb.teamId === ctx.teamId) return true;
  // Company 级 KB 给 team 看
  if (!kb.teamId && kb.visibility === 'team') return true;
  return false;
}

// ── list ────────────────────────────────────────────────────────────────
async function listKnowledgeBases(req: http.IncomingMessage, res: http.ServerResponse) {
  const ctx = await requireBearer(req, res);
  if (!ctx) return;
  const check = requireScopes(ctx, ['knowledge:read', 'knowledge:admin']);
  if (!check.ok) { jsonResponse(res, 403, { error: 'insufficient_scope', missing: check.missing }); return; }

  const url = req.url || '';
  const qp = new URL(url, 'http://localhost').searchParams;
  const typeFilter = qp.get('type');

  // 拉所有同 tenant 的 KB,在内存里按 visibility 过滤(简单实现;数据量大会卡)
  const conditions = [eq(knowledgeBases.tenantId, ctx.tenantId)];
  if (typeFilter && isValidType(typeFilter)) {
    conditions.push(eq(knowledgeBases.type, typeFilter));
  }
  const rows = await db.select().from(knowledgeBases)
    .where(and(...conditions))
    .orderBy(desc(knowledgeBases.createdAt));

  const visible = rows.filter(kb => canAccessKb(ctx, kb));
  jsonResponse(res, 200, { success: true, data: visible });
}

// ── create ──────────────────────────────────────────────────────────────
async function createKnowledgeBase(req: http.IncomingMessage, res: http.ServerResponse) {
  const ctx = await requireBearer(req, res);
  if (!ctx) return;
  const check = requireScopes(ctx, ['knowledge:admin']);
  if (!check.ok) { jsonResponse(res, 403, { error: 'insufficient_scope', missing: check.missing }); return; }

  const body = (await parseJsonBody(req)) as Record<string, unknown>;
  const { type, name, description, visibility, teamId, ownerUserId, embeddingProviderId, chunkSize, chunkOverlap } = body;

  if (!isValidType(type)) { jsonResponse(res, 400, { error: 'invalid type', allowed: KB_TYPES }); return; }
  if (!name || typeof name !== 'string') { jsonResponse(res, 400, { error: 'name required' }); return; }
  if (visibility && !isValidVisibility(visibility)) { jsonResponse(res, 400, { error: 'invalid visibility', allowed: VISIBILITIES }); return; }

  // 业务规则:personal KB 必须有 ownerUserId,company KB 必须 team/owner 都空
  if (type === 'personal' && !ownerUserId) { jsonResponse(res, 400, { error: 'personal KB requires ownerUserId' }); return; }
  if (type === 'company' && (teamId || ownerUserId)) { jsonResponse(res, 400, { error: 'company KB must not have team/owner' }); return; }

  const [row] = await db.insert(knowledgeBases).values({
    tenantId: ctx.tenantId,
    teamId: teamId ? String(teamId) : null,
    ownerUserId: ownerUserId ? String(ownerUserId) : null,
    type,
    name: String(name),
    description: description ? String(description) : null,
    visibility: visibility ? String(visibility) : 'team',
    embeddingProviderId: embeddingProviderId ? String(embeddingProviderId) : null,
    chunkSize: Number(chunkSize) || 512,
    chunkOverlap: Number(chunkOverlap) || 64,
    createdBy: ctx.userId ? String(ctx.userId) : null,
  }).returning();

  jsonResponse(res, 201, { success: true, data: row });
}

// ── get by id ───────────────────────────────────────────────────────────
async function getKnowledgeBase(req: http.IncomingMessage, res: http.ServerResponse, id: string) {
  const ctx = await requireBearer(req, res);
  if (!ctx) return;
  const check = requireScopes(ctx, ['knowledge:read', 'knowledge:admin']);
  if (!check.ok) { jsonResponse(res, 403, { error: 'insufficient_scope', missing: check.missing }); return; }

  const [kb] = await db.select().from(knowledgeBases).where(eq(knowledgeBases.id, id)).limit(1);
  if (!kb) { jsonResponse(res, 404, { error: 'KB not found' }); return; }
  if (!canAccessKb(ctx, kb)) { jsonResponse(res, 403, { error: 'forbidden' }); return; }

  jsonResponse(res, 200, { success: true, data: kb });
}

// ── patch ───────────────────────────────────────────────────────────────
async function patchKnowledgeBase(req: http.IncomingMessage, res: http.ServerResponse, id: string) {
  const ctx = await requireBearer(req, res);
  if (!ctx) return;
  const check = requireScopes(ctx, ['knowledge:admin']);
  if (!check.ok) { jsonResponse(res, 403, { error: 'insufficient_scope', missing: check.missing }); return; }

  const body = (await parseJsonBody(req)) as Record<string, unknown>;
  const [kb] = await db.select().from(knowledgeBases).where(eq(knowledgeBases.id, id)).limit(1);
  if (!kb) { jsonResponse(res, 404, { error: 'KB not found' }); return; }
  if (!canAccessKb(ctx, kb)) { jsonResponse(res, 403, { error: 'forbidden' }); return; }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name !== undefined) { if (typeof body.name !== 'string') { jsonResponse(res, 400, { error: 'name must be string' }); return; } updates.name = body.name; }
  if (body.description !== undefined) { updates.description = body.description ? String(body.description) : null; }
  if (body.visibility !== undefined) { if (!isValidVisibility(body.visibility)) { jsonResponse(res, 400, { error: 'invalid visibility' }); return; } updates.visibility = body.visibility; }
  if (body.chunkSize !== undefined) { updates.chunkSize = Number(body.chunkSize) || 512; }
  if (body.chunkOverlap !== undefined) { updates.chunkOverlap = Number(body.chunkOverlap) || 64; }
  if (body.embeddingProviderId !== undefined) { updates.embeddingProviderId = body.embeddingProviderId ? String(body.embeddingProviderId) : null; }

  await db.update(knowledgeBases).set(updates).where(eq(knowledgeBases.id, id));
  const [updated] = await db.select().from(knowledgeBases).where(eq(knowledgeBases.id, id)).limit(1);
  jsonResponse(res, 200, { success: true, data: updated });
}

// ── delete (soft) ──────────────────────────────────────────────────────
async function deleteKnowledgeBase(req: http.IncomingMessage, res: http.ServerResponse, id: string) {
  const ctx = await requireBearer(req, res);
  if (!ctx) return;
  const check = requireScopes(ctx, ['knowledge:admin']);
  if (!check.ok) { jsonResponse(res, 403, { error: 'insufficient_scope', missing: check.missing }); return; }

  const [kb] = await db.select().from(knowledgeBases).where(eq(knowledgeBases.id, id)).limit(1);
  if (!kb) { jsonResponse(res, 404, { error: 'KB not found' }); return; }
  if (!canAccessKb(ctx, kb)) { jsonResponse(res, 403, { error: 'forbidden' }); return; }

  // 软删:把 visibility 改 private + 加 'deleted_' 前缀(后续清理)
  // 简单实现:用 description 字段标 'DELETED' (Plan B 范围)
  await db.update(knowledgeBases).set({
    description: `[DELETED ${new Date().toISOString()}] ${kb.description || ''}`.slice(0, 1000),
    updatedAt: new Date(),
  }).where(eq(knowledgeBases.id, id));
  jsonResponse(res, 200, { success: true, data: { id, deleted: true } });
}

// ── indexing trigger (async 202) ───────────────────────────────────────
async function triggerIndexing(req: http.IncomingMessage, res: http.ServerResponse, id: string) {
  const ctx = await requireBearer(req, res);
  if (!ctx) return;
  const check = requireScopes(ctx, ['knowledge:admin']);
  if (!check.ok) { jsonResponse(res, 403, { error: 'insufficient_scope', missing: check.missing }); return; }

  const [kb] = await db.select().from(knowledgeBases).where(eq(knowledgeBases.id, id)).limit(1);
  if (!kb) { jsonResponse(res, 404, { error: 'KB not found' }); return; }
  if (!canAccessKb(ctx, kb)) { jsonResponse(res, 403, { error: 'forbidden' }); return; }

  // 标记 indexing(实际 job 留 B-3,本期直接 ready)
  await db.update(knowledgeBases).set({
    indexStatus: 'indexing',
    updatedAt: new Date(),
  }).where(eq(knowledgeBases.id, id));

  // 立即 fire-and-forget 标记 ready(简化:实际生产要走队列)
  setImmediate(async () => {
    try {
      await db.update(knowledgeBases).set({
        indexStatus: 'ready',
        updatedAt: new Date(),
      }).where(eq(knowledgeBases.id, id));
    } catch (err) {
      await db.update(knowledgeBases).set({
        indexStatus: 'failed',
        updatedAt: new Date(),
      }).where(eq(knowledgeBases.id, id));
    }
  });

  jsonResponse(res, 202, { success: true, data: { id, indexStatus: 'indexing' } });
}

// ── 主路由 dispatch ────────────────────────────────────────────────────
export async function handleKnowledgeBaseRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  method: string,
  url: string,
): Promise<boolean> {
  // /api/v2/admin/knowledge-bases
  if (url === '/api/v2/admin/knowledge-bases') {
    if (method === 'GET') { await listKnowledgeBases(req, res); return true; }
    if (method === 'POST') { await createKnowledgeBase(req, res); return true; }
  }

  // /api/v2/admin/knowledge-bases/:id
  const kbMatch = url.match(/^\/api\/v2\/admin\/knowledge-bases\/([^/]+)$/);
  if (kbMatch) {
    if (method === 'GET') { await getKnowledgeBase(req, res, kbMatch[1]!); return true; }
    if (method === 'PATCH') { await patchKnowledgeBase(req, res, kbMatch[1]!); return true; }
    if (method === 'DELETE') { await deleteKnowledgeBase(req, res, kbMatch[1]!); return true; }
  }

  // /api/v2/admin/knowledge-bases/:id/indexing
  const idxMatch = url.match(/^\/api\/v2\/admin\/knowledge-bases\/([^/]+)\/indexing$/);
  if (idxMatch && method === 'POST') {
    await triggerIndexing(req, res, idxMatch[1]!); return true;
  }

  return false;
}
