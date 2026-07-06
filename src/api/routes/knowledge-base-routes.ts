/**
 * Plan B-2 数智底座 KB 端点:
 *   /api/v2/admin/knowledge-bases                          (CRUD, knowledge:admin)
 *   /api/v2/admin/knowledge-bases/:id                      (GET/PATCH/DELETE)
 *   /api/v2/admin/knowledge-bases/:id/indexing             (POST, 异步 202)
 *   /api/v2/admin/knowledge-bases/:id/documents            (GET list / POST bind)
 *   /api/v2/admin/knowledge-bases/:id/documents/upload     (POST 新 doc + chunk + embed)
 *   /api/v2/admin/documents/:docId/versions                (POST 新版本)
 *
 * 模式: 跟 resource-routes 一样,纯函数 handleKnowledgeBaseRoutes,挂 http-server
 * 权限:
 *   - knowledge:read / knowledge:admin  读
 *   - knowledge:admin                   写
 *   - 8 类 type enum 校验
 *   - visibility 权限 (personal/team/company)
 */
import type http from 'node:http';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { knowledgeBases, documents, documentChunks } from '../../db/schema.js';
import { chunkText, makeChunkId } from '../../services/chunker.js';
import { embedText } from '../../services/embedder.js';
import { hybridSearch } from '../../services/hybrid-search.js';
import { jsonResponse, parseJsonBody } from './helpers.js';
import { requireBearer, requireScopes, requireAnyScope } from '../oauth-middleware.js';

const KB_TYPES = ['industry', 'product', 'competitor', 'solution', 'pricing', 'company', 'department', 'personal'] as const;
const VISIBILITIES = ['private', 'team', 'company'] as const;

function isValidType(t: unknown): t is typeof KB_TYPES[number] {
  return typeof t === 'string' && (KB_TYPES as readonly string[]).includes(t);
}
function isValidVisibility(v: unknown): v is typeof VISIBILITIES[number] {
  return typeof v === 'string' && (VISIBILITIES as readonly string[]).includes(v);
}

/** 检查 ctx 是否有权访问某 KB(visibility 规则) */
function canAccessKb(ctx: { tenantId: string; userId: string | null; teamId?: string | undefined }, kb: {
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
  if (!kb.teamId && kb.visibility === 'team') return true;
  return false;
}

// ── KB CRUD handlers ────────────────────────────────────────────────────

async function listKnowledgeBases(req: http.IncomingMessage, res: http.ServerResponse) {
  const ctx = await requireBearer(req, res);
  if (!ctx) return;
  if (!requireAnyScope(ctx, ['knowledge:read', 'knowledge:admin'])) {
    jsonResponse(res, 403, { error: 'insufficient_scope', required: 'knowledge:read OR knowledge:admin' }); return;
  }

  const url = req.url || '';
  const qp = new URL(url, 'http://localhost').searchParams;
  const typeFilter = qp.get('type');

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

async function getKnowledgeBase(req: http.IncomingMessage, res: http.ServerResponse, id: string) {
  const ctx = await requireBearer(req, res);
  if (!ctx) return;
  if (!requireAnyScope(ctx, ['knowledge:read', 'knowledge:admin'])) {
    jsonResponse(res, 403, { error: 'insufficient_scope', required: 'knowledge:read OR knowledge:admin' }); return;
  }

  const [kb] = await db.select().from(knowledgeBases).where(eq(knowledgeBases.id, id)).limit(1);
  if (!kb) { jsonResponse(res, 404, { error: 'KB not found' }); return; }
  if (!canAccessKb(ctx, kb)) { jsonResponse(res, 403, { error: 'forbidden' }); return; }

  jsonResponse(res, 200, { success: true, data: kb });
}

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

async function deleteKnowledgeBase(req: http.IncomingMessage, res: http.ServerResponse, id: string) {
  const ctx = await requireBearer(req, res);
  if (!ctx) return;
  const check = requireScopes(ctx, ['knowledge:admin']);
  if (!check.ok) { jsonResponse(res, 403, { error: 'insufficient_scope', missing: check.missing }); return; }

  const [kb] = await db.select().from(knowledgeBases).where(eq(knowledgeBases.id, id)).limit(1);
  if (!kb) { jsonResponse(res, 404, { error: 'KB not found' }); return; }
  if (!canAccessKb(ctx, kb)) { jsonResponse(res, 403, { error: 'forbidden' }); return; }

  await db.update(knowledgeBases).set({
    description: `[DELETED ${new Date().toISOString()}] ${kb.description || ''}`.slice(0, 1000),
    updatedAt: new Date(),
  }).where(eq(knowledgeBases.id, id));
  jsonResponse(res, 200, { success: true, data: { id, deleted: true } });
}

async function triggerIndexing(req: http.IncomingMessage, res: http.ServerResponse, id: string) {
  const ctx = await requireBearer(req, res);
  if (!ctx) return;
  const check = requireScopes(ctx, ['knowledge:admin']);
  if (!check.ok) { jsonResponse(res, 403, { error: 'insufficient_scope', missing: check.missing }); return; }

  const [kb] = await db.select().from(knowledgeBases).where(eq(knowledgeBases.id, id)).limit(1);
  if (!kb) { jsonResponse(res, 404, { error: 'KB not found' }); return; }
  if (!canAccessKb(ctx, kb)) { jsonResponse(res, 403, { error: 'forbidden' }); return; }

  await db.update(knowledgeBases).set({
    indexStatus: 'indexing',
    updatedAt: new Date(),
  }).where(eq(knowledgeBases.id, id));

  setImmediate(async () => {
    try {
      await db.update(knowledgeBases).set({
        indexStatus: 'ready',
        updatedAt: new Date(),
      }).where(eq(knowledgeBases.id, id));
    } catch {
      await db.update(knowledgeBases).set({
        indexStatus: 'failed',
        updatedAt: new Date(),
      }).where(eq(knowledgeBases.id, id));
    }
  });

  jsonResponse(res, 202, { success: true, data: { id, indexStatus: 'indexing' } });
}

// ── Document handlers ───────────────────────────────────────────────────

async function listKbDocuments(req: http.IncomingMessage, res: http.ServerResponse, kbId: string) {
  const ctx = await requireBearer(req, res);
  if (!ctx) return;
  if (!requireAnyScope(ctx, ['knowledge:read', 'knowledge:admin'])) {
    jsonResponse(res, 403, { error: 'insufficient_scope', required: 'knowledge:read OR knowledge:admin' }); return;
  }

  const [kb] = await db.select().from(knowledgeBases).where(eq(knowledgeBases.id, kbId)).limit(1);
  if (!kb) { jsonResponse(res, 404, { error: 'KB not found' }); return; }
  if (!canAccessKb(ctx, kb)) { jsonResponse(res, 403, { error: 'forbidden' }); return; }

  const rows = await db.select().from(documents)
    .where(eq(documents.kbId, kbId))
    .orderBy(desc(documents.kbVersion), desc(documents.updatedAt));
  jsonResponse(res, 200, { success: true, data: rows });
}

async function bindDocumentToKb(req: http.IncomingMessage, res: http.ServerResponse, kbId: string) {
  const ctx = await requireBearer(req, res);
  if (!ctx) return;
  const check = requireScopes(ctx, ['knowledge:admin']);
  if (!check.ok) { jsonResponse(res, 403, { error: 'insufficient_scope', missing: check.missing }); return; }

  const body = (await parseJsonBody(req)) as Record<string, unknown>;
  const { docId } = body;
  if (!docId) { jsonResponse(res, 400, { error: 'docId required' }); return; }

  const [kb] = await db.select().from(knowledgeBases).where(eq(knowledgeBases.id, kbId)).limit(1);
  if (!kb) { jsonResponse(res, 404, { error: 'KB not found' }); return; }
  if (!canAccessKb(ctx, kb)) { jsonResponse(res, 403, { error: 'forbidden' }); return; }

  const [doc] = await db.select().from(documents).where(eq(documents.id, String(docId))).limit(1);
  if (!doc) { jsonResponse(res, 404, { error: 'document not found' }); return; }

  await db.update(documents).set({
    kbId,
    kbType: kb.type,
    visibility: kb.visibility,
    updatedAt: new Date().toISOString(),
  }).where(eq(documents.id, String(docId)));
  jsonResponse(res, 200, { success: true, data: { docId, kbId } });
}

async function uploadDocumentToKb(req: http.IncomingMessage, res: http.ServerResponse, kbId: string) {
  const ctx = await requireBearer(req, res);
  if (!ctx) return;
  const check = requireScopes(ctx, ['knowledge:admin']);
  if (!check.ok) { jsonResponse(res, 403, { error: 'insufficient_scope', missing: check.missing }); return; }

  const body = (await parseJsonBody(req)) as Record<string, unknown>;
  const { title, content } = body;
  if (!title || !content) { jsonResponse(res, 400, { error: 'title + content required' }); return; }

  const [kb] = await db.select().from(knowledgeBases).where(eq(knowledgeBases.id, kbId)).limit(1);
  if (!kb) { jsonResponse(res, 404, { error: 'KB not found' }); return; }
  if (!canAccessKb(ctx, kb)) { jsonResponse(res, 403, { error: 'forbidden' }); return; }

  const docId = `${kbId}::doc::${Date.now()}`;
  await db.insert(documents).values({
    id: docId,
    title: String(title),
    content: String(content),
    folderId: 'root',
    path: `/kb/${kbId}/${docId}`,
    createdBy: ctx.userId ? String(ctx.userId) : null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    kbId,
    kbType: kb.type,
    visibility: kb.visibility,
    kbVersion: 1,
    ownerUserId: kb.ownerUserId || null,
  });

  const chunks = chunkText(String(content), { chunkSize: kb.chunkSize, chunkOverlap: kb.chunkOverlap });

  let embeddedCount = 0;
  for (const chunk of chunks) {
    let embedding: number[] | null = null;
    if (kb.embeddingProviderId) {
      embedding = await embedText({ providerId: kb.embeddingProviderId, text: chunk.content });
      if (embedding) embeddedCount++;
    }
    await db.insert(documentChunks).values({
      id: makeChunkId(docId, chunk.index),
      documentId: docId,
      chunkIndex: chunk.index,
      content: chunk.content,
      heading: chunk.heading || null,
      embedding: embedding as any,
      chunkTokenCount: chunk.tokenCount,
      createdAt: new Date().toISOString(),
    });
  }

  await db.update(knowledgeBases).set({
    documentCount: (kb.documentCount || 0) + 1,
    chunkCount: (kb.chunkCount || 0) + chunks.length,
    updatedAt: new Date(),
  }).where(eq(knowledgeBases.id, kbId));

  jsonResponse(res, 201, { success: true, data: { docId, chunks: chunks.length, embedded: embeddedCount } });
}

async function createDocumentVersion(req: http.IncomingMessage, res: http.ServerResponse, docId: string) {
  const ctx = await requireBearer(req, res);
  if (!ctx) return;
  const check = requireScopes(ctx, ['knowledge:admin']);
  if (!check.ok) { jsonResponse(res, 403, { error: 'insufficient_scope', missing: check.missing }); return; }

  const body = (await parseJsonBody(req)) as Record<string, unknown>;
  const { content } = body;
  if (!content) { jsonResponse(res, 400, { error: 'content required' }); return; }

  const [doc] = await db.select().from(documents).where(eq(documents.id, docId)).limit(1);
  if (!doc) { jsonResponse(res, 404, { error: 'document not found' }); return; }
  if (doc.kbId) {
    const [kb] = await db.select().from(knowledgeBases).where(eq(knowledgeBases.id, doc.kbId)).limit(1);
    if (kb && !canAccessKb(ctx, kb)) { jsonResponse(res, 403, { error: 'forbidden' }); return; }
  }

  const newVersion = (doc.kbVersion || 1) + 1;
  await db.update(documents).set({
    content: String(content),
    kbVersion: newVersion,
    updatedAt: new Date().toISOString(),
  }).where(eq(documents.id, docId));

  await db.delete(documentChunks).where(eq(documentChunks.documentId, docId));

  const kb = doc.kbId ? (await db.select().from(knowledgeBases).where(eq(knowledgeBases.id, doc.kbId)).limit(1))[0] : null;
  const chunks = chunkText(String(content), {
    chunkSize: kb?.chunkSize || 512,
    chunkOverlap: kb?.chunkOverlap || 64,
  });
  for (const chunk of chunks) {
    let embedding: number[] | null = null;
    if (kb?.embeddingProviderId) {
      embedding = await embedText({ providerId: kb.embeddingProviderId, text: chunk.content });
    }
    await db.insert(documentChunks).values({
      id: makeChunkId(docId, chunk.index),
      documentId: docId,
      chunkIndex: chunk.index,
      content: chunk.content,
      heading: chunk.heading || null,
      embedding: embedding as any,
      chunkTokenCount: chunk.tokenCount,
      createdAt: new Date().toISOString(),
    });
  }

  jsonResponse(res, 201, { success: true, data: { docId, kbVersion: newVersion, chunks: chunks.length } });
}


// POST /api/v2/admin/knowledge-bases/:id/search
async function searchKb(req: http.IncomingMessage, res: http.ServerResponse, kbId: string) {
  const ctx = await requireBearer(req, res);
  if (!ctx) return;
  if (!requireAnyScope(ctx, ['knowledge:read', 'knowledge:admin'])) {
    jsonResponse(res, 403, { error: 'insufficient_scope', required: 'knowledge:read OR knowledge:admin' }); return;
  }

  const [kb] = await db.select().from(knowledgeBases).where(eq(knowledgeBases.id, kbId)).limit(1);
  if (!kb) { jsonResponse(res, 404, { error: 'KB not found' }); return; }
  if (!canAccessKb(ctx, kb)) { jsonResponse(res, 403, { error: 'forbidden' }); return; }

  const body = (await parseJsonBody(req)) as Record<string, unknown>;
  const { query, topK, mode } = body;
  if (!query || typeof query !== 'string') { jsonResponse(res, 400, { error: 'query required' }); return; }

  const results = await hybridSearch({
    query: String(query),
    kbIds: [kbId],
    topK: Number(topK) || 5,
    mode: (mode === 'vector' || mode === 'bm25' || mode === 'hybrid') ? mode : 'hybrid',
    visibilityFilter: {
      userId: ctx.userId || '',
      tenantId: ctx.tenantId,
    },
  });
  jsonResponse(res, 200, { success: true, data: results });
}

// ── Dispatch ────────────────────────────────────────────────────────────

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

  // /api/v2/admin/knowledge-bases/:id/documents
  const docsListMatch = url.match(/^\/api\/v2\/admin\/knowledge-bases\/([^/]+)\/documents$/);
  if (docsListMatch) {
    if (method === 'GET') { await listKbDocuments(req, res, docsListMatch[1]!); return true; }
    if (method === 'POST') { await bindDocumentToKb(req, res, docsListMatch[1]!); return true; }
  }

  // /api/v2/admin/knowledge-bases/:id/documents/upload
  const docsUploadMatch = url.match(/^\/api\/v2\/admin\/knowledge-bases\/([^/]+)\/documents\/upload$/);
  if (docsUploadMatch && method === 'POST') {
    await uploadDocumentToKb(req, res, docsUploadMatch[1]!); return true;
  }

  // /api/v2/admin/documents/:docId/versions
  const docVerMatch = url.match(/^\/api\/v2\/admin\/documents\/([^/]+)\/versions$/);
  if (docVerMatch && method === 'POST') {
    await createDocumentVersion(req, res, docVerMatch[1]!); return true;
  }

  // /api/v2/admin/knowledge-bases/:id/search
  const searchMatch = url.match(/^\/api\/v2\/admin\/knowledge-bases\/([^/]+)\/search$/);
  if (searchMatch && method === 'POST') {
    await searchKb(req, res, searchMatch[1]!); return true;
  }

  return false;
}
