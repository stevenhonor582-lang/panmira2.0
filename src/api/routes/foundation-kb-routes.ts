/**
 * R13-C · Foundation KB CRUD (2026-07-08)
 *
 * folders + documents CRUD:
 *   GET    /api/v2/foundation/folders/tree             — 全部文件夹 (带 doc_count)
 *   POST   /api/v2/foundation/folders                   — 新建子文件夹
 *   PATCH  /api/v2/foundation/folders/:id              — 改名 / 移动 parent / visibility
 *   DELETE /api/v2/foundation/folders/:id              — 删除 (?mode=cascade|reassign,默认 reassign)
 *
 *   GET    /api/v2/foundation/documents/:id            — 文档详情 (含 folder / chunk 统计)
 *   GET    /api/v2/foundation/documents/:id/chunks     — chunks 列表
 *   PATCH  /api/v2/foundation/documents/:id           — 改 title / tags / module / folderId
 *   DELETE /api/v2/foundation/documents/:id           — 删除文档 (cascade chunks)
 *   POST   /api/v2/foundation/documents/:id/reindex   — 重新 chunk + 入队 embedding (202)
 *   POST   /api/v2/foundation/documents/upload         — 新建文档 + 同步 chunk (异步 embed)
 *
 * notes:
 *   - folders.id 是 varchar (text),不是 uuid
 *   - folders.created_at / updated_at 是 text,用 to_char 写入
 *   - documents.created_at 是 timestamptz
 *   - 删除文件夹前必须确认 (前端弹窗),后端默认 reassign 到 parent
 */
import type * as http from 'node:http';
import { pool } from '../../db/index.js';
import { jsonResponse, parseJsonBody } from './helpers.js';
import { requireBearer, requireAnyScope } from '../oauth-middleware.js';

// ── helpers ─────────────────────────────────────────────────────────────
function toISO(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'number' && v > 0) {
    return new Date(v < 1e12 ? v * 1000 : v).toISOString();
  }
  return String(v);
}

function isAdmin(ctx: { scopes: string[] }): boolean {
  return requireAnyScope(ctx as any, ['knowledge:admin', '*']);
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '_').replace(/[^\w-]/g, '').slice(0, 60);
}

function nowText(): string {
  // folders.created_at 是 text,统一格式
  return new Date().toISOString();
}

const VALID_MODULES = new Set(['knowledge', 'feedback', 'log', 'other']);
const VALID_VISIBILITY = new Set(['private', 'team', 'shared', 'company']);

// ── folders ─────────────────────────────────────────────────────────────
async function foldersTree(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  _ctx: { tenantId: string; userId: string | null },
) {
  const result = await pool.query(
    `SELECT f.id, f.name, f.parent_id AS "parentId", f.path, f.visibility,
            f.bot_id AS "botId", f.created_at AS "createdAt", f.updated_at AS "updatedAt",
            (SELECT count(*)::int FROM documents d WHERE d.folder_id = f.id) AS "docCount"
       FROM folders f
       ORDER BY f.path`,
  );
  jsonResponse(res, 200, { success: true, folders: result.rows });
}

async function folderCreate(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: { tenantId: string; userId: string | null; scopes: string[] },
) {
  if (!isAdmin(ctx)) {
    jsonResponse(res, 403, { error: 'insufficient_scope', required: 'knowledge:admin | *' });
    return;
  }
  const body: any = await parseJsonBody(req).catch(() => ({}));
  const name = String(body.name ?? '').trim();
  if (!name) {
    jsonResponse(res, 400, { error: 'name_required' });
    return;
  }
  const parentId = body.parentId || null;
  let parentPath = '';
  if (parentId) {
    const p = await pool.query('SELECT path FROM folders WHERE id = $1', [parentId]);
    if (p.rows.length === 0) {
      jsonResponse(res, 404, { error: 'parent_not_found' });
      return;
    }
    parentPath = p.rows[0].path;
  }
  const path = parentPath ? `${parentPath}/${name}` : `/${name}`;
  const exists = await pool.query('SELECT id FROM folders WHERE path = $1', [path]);
  if (exists.rows.length > 0) {
    jsonResponse(res, 409, { error: 'path_exists', path, existingId: exists.rows[0].id });
    return;
  }
  const id = `fld_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const botId = body.botId || null;
  const visibility = VALID_VISIBILITY.has(body.visibility) ? body.visibility : 'shared';
  const ts = nowText();
  const result = await pool.query(
    `INSERT INTO folders (id, name, parent_id, path, visibility, bot_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
     RETURNING id, name, parent_id AS "parentId", path, visibility, bot_id AS "botId",
               created_at AS "createdAt", updated_at AS "updatedAt"`,
    [id, name, parentId, path, visibility, botId, ts],
  );
  jsonResponse(res, 201, { success: true, folder: result.rows[0] });
}

async function folderPatch(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: { tenantId: string; userId: string | null; scopes: string[] },
  id: string,
) {
  if (!isAdmin(ctx)) {
    jsonResponse(res, 403, { error: 'insufficient_scope', required: 'knowledge:admin | *' });
    return;
  }
  const cur = await pool.query('SELECT id, name, path, parent_id FROM folders WHERE id = $1', [id]);
  if (cur.rows.length === 0) {
    jsonResponse(res, 404, { error: 'not_found', id });
    return;
  }
  const folder = cur.rows[0];
  const body: any = await parseJsonBody(req).catch(() => ({}));
  const sets: string[] = [];
  const params: unknown[] = [];
  const add = (col: string, val: unknown) => { params.push(val); sets.push(`${col} = $${params.length}`); };

  let newName = folder.name;
  let newParentId = folder.parent_id;

  if (typeof body.name === 'string' && body.name.trim()) {
    newName = body.name.trim();
  }
  if (body.parentId !== undefined) {
    if (body.parentId === id) {
      jsonResponse(res, 400, { error: 'circular_parent' });
      return;
    }
    if (body.parentId) {
      const p = await pool.query('SELECT id, path FROM folders WHERE id = $1', [body.parentId]);
      if (p.rows.length === 0) {
        jsonResponse(res, 404, { error: 'parent_not_found' });
        return;
      }
      // 不能把自己挂到自己的后代下
      if (p.rows[0].path.startsWith(folder.path + '/')) {
        jsonResponse(res, 400, { error: 'circular_parent', reason: 'descendant' });
        return;
      }
      newParentId = body.parentId;
    } else {
      newParentId = null;
    }
  }

  // 重算 path (无论改 name 还是 parent 都要重算)
  let newParentPath = '';
  if (newParentId) {
    const p = await pool.query('SELECT path FROM folders WHERE id = $1', [newParentId]);
    newParentPath = p.rows[0]?.path ?? '';
  }
  const newPath = newParentPath ? `${newParentPath}/${newName}` : `/${newName}`;
  if (newPath !== folder.path) {
    // path 唯一约束检查
    const ex = await pool.query('SELECT id FROM folders WHERE path = $1 AND id <> $2', [newPath, id]);
    if (ex.rows.length > 0) {
      jsonResponse(res, 409, { error: 'path_exists', path: newPath });
      return;
    }
  }

  add('name', newName);
  add('parent_id', newParentId);
  add('path', newPath);
  if (typeof body.visibility === 'string' && VALID_VISIBILITY.has(body.visibility)) add('visibility', body.visibility);
  if (body.botId !== undefined) add('bot_id', body.botId || null);
  add('updated_at', nowText());

  params.push(id);
  const q = `UPDATE folders SET ${sets.join(', ')} WHERE id = $${params.length}
             RETURNING id, name, parent_id AS "parentId", path, visibility,
                       bot_id AS "botId", created_at AS "createdAt", updated_at AS "updatedAt"`;
  // 如果 path 变了,同步重算所有后代的 path 前缀
  if (newPath !== folder.path) {
    await pool.query(
      `WITH RECURSIVE d AS (
         SELECT id, path FROM folders WHERE id = $1
         UNION ALL
         SELECT f.id, fp.path || substring(f.path from length($2::text) + 1)
         FROM folders f JOIN d fp ON f.parent_id = fp.id
       )
       UPDATE folders SET path = d.path FROM d WHERE folders.id = d.id AND folders.id <> $1`,
      [id, folder.path],
    ).catch(() => undefined); // best-effort
  }
  const result = await pool.query(q, params);
  jsonResponse(res, 200, { success: true, folder: result.rows[0] });
}

async function folderDelete(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: { tenantId: string; userId: string | null; scopes: string[] },
  id: string,
) {
  if (!isAdmin(ctx)) {
    jsonResponse(res, 403, { error: 'insufficient_scope', required: 'knowledge:admin | *' });
    return;
  }
  const parsed = new URL(req.url ?? '', 'http://localhost');
  const mode = parsed.searchParams.get('mode') === 'cascade' ? 'cascade' : 'reassign';
  const cur = await pool.query('SELECT id, parent_id FROM folders WHERE id = $1', [id]);
  if (cur.rows.length === 0) {
    jsonResponse(res, 404, { error: 'not_found', id });
    return;
  }
  const newParent = mode === 'cascade' ? null : (cur.rows[0].parent_id ?? null);

  if (mode === 'cascade') {
    // 递归收集本节点 + 所有后代,删除关联文档 (chunks 跟 documents cascade),再删 folders
    await pool.query(
      `WITH RECURSIVE d AS (
         SELECT id FROM folders WHERE id = $1
         UNION ALL SELECT f.id FROM folders f JOIN d ON f.parent_id = d.id
       )
       DELETE FROM documents WHERE folder_id IN (SELECT id FROM d)`,
      [id],
    );
    await pool.query(
      `WITH RECURSIVE d AS (
         SELECT id FROM folders WHERE id = $1
         UNION ALL SELECT f.id FROM folders f JOIN d ON f.parent_id = d.id
       )
       DELETE FROM folders WHERE id IN (SELECT id FROM d)`,
      [id],
    );
  } else {
    // reassign: 把子文档挂到 parent,把直接子文件夹也挂到 parent,然后删本节点
    await pool.query('UPDATE documents SET folder_id = $2 WHERE folder_id = $1', [id, newParent]);
    await pool.query('UPDATE folders SET parent_id = $2 WHERE parent_id = $1', [id, newParent]);
    await pool.query('DELETE FROM folders WHERE id = $1', [id]);
  }
  jsonResponse(res, 200, { success: true, deleted: id, mode });
}

// ── documents ───────────────────────────────────────────────────────────
async function documentDetail(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  _ctx: { tenantId: string; userId: string | null },
  id: string,
) {
  const result = await pool.query(
    `SELECT d.id, d.title, d.folder_id AS "folderId", d.path, d.content, d.summary,
            d.tags, d.quality_score AS "qualityScore", d.hit_count AS "hitCount",
            d.last_hit_at AS "lastHitAt", d.version, d.version_group AS "versionGroup",
            d.kb_id AS "kbId", d.kb_type AS "kbType", d.module, d.visibility, d.kb_version AS "kbVersion",
            d.created_by AS "createdBy", d.created_at AS "createdAt", d.updated_at AS "updatedAt",
            d.bot_id AS "botId", d.feedback_count AS "feedbackCount", d.content_hash AS "contentHash",
            f.name AS "folderName", f.path AS "folderPath"
       FROM documents d
       LEFT JOIN folders f ON f.id = d.folder_id
      WHERE d.id = $1
      LIMIT 1`,
    [id],
  );
  if (result.rows.length === 0) {
    jsonResponse(res, 404, { error: 'not_found', id });
    return;
  }
  const chunks = await pool.query(
    `SELECT count(*)::int AS n, COALESCE(sum(chunk_token_count),0)::int AS tokens
       FROM document_chunks WHERE document_id = $1`,
    [id],
  );
  const r: Record<string, unknown> = result.rows[0];
  r.chunkCount = chunks.rows[0]?.n ?? 0;
  r.chunkTokens = chunks.rows[0]?.tokens ?? 0;
  r.createdAt = toISO(r.createdAt);
  r.updatedAt = toISO(r.updatedAt);
  r.lastHitAt = toISO(r.lastHitAt);
  jsonResponse(res, 200, { success: true, document: r });
}

async function documentChunks(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  _ctx: { tenantId: string; userId: string | null },
  id: string,
) {
  // 分页:长文档 chunk 多
  const parsed = new URL(_req.url ?? '', 'http://localhost');
  const limit = Math.min(500, Math.max(1, parseInt(parsed.searchParams.get('limit') ?? '200', 10)));
  const offset = Math.max(0, parseInt(parsed.searchParams.get('offset') ?? '0', 10));
  const result = await pool.query(
    `SELECT id, chunk_index AS "chunkIndex", heading, content, chunk_token_count AS "tokens",
            created_at AS "createdAt"
       FROM document_chunks
       WHERE document_id = $1
       ORDER BY chunk_index
       LIMIT $2 OFFSET $3`,
    [id, limit, offset],
  );
  const total = await pool.query(
    'SELECT count(*)::int AS n FROM document_chunks WHERE document_id = $1',
    [id],
  );
  jsonResponse(res, 200, {
    success: true,
    chunks: result.rows.map((r: Record<string, any>) => ({
      ...r,
      createdAt: toISO(r.createdAt),
    })),
    total: total.rows[0]?.n ?? 0,
    limit,
    offset,
  });
}

async function documentPatch(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: { tenantId: string; userId: string | null; scopes: string[] },
  id: string,
) {
  if (!isAdmin(ctx)) {
    jsonResponse(res, 403, { error: 'insufficient_scope', required: 'knowledge:admin | *' });
    return;
  }
  const body: any = await parseJsonBody(req).catch(() => ({}));
  const sets: string[] = [];
  const params: unknown[] = [];
  const add = (col: string, val: unknown) => { params.push(val); sets.push(`${col} = $${params.length}`); };

  if (typeof body.title === 'string' && body.title.trim()) add('title', body.title.trim());
  if (typeof body.summary === 'string') add('summary', body.summary);
  if (body.tags !== undefined) {
    if (!Array.isArray(body.tags)) {
      jsonResponse(res, 400, { error: 'invalid_tags' });
      return;
    }
    params.push(JSON.stringify(body.tags));
    sets.push(`tags = $${params.length}::jsonb`);
  }
  if (typeof body.module === 'string' && VALID_MODULES.has(body.module)) add('module', body.module);
  if (typeof body.visibility === 'string' && VALID_VISIBILITY.has(body.visibility)) add('visibility', body.visibility);
  if (body.folderId !== undefined) {
    if (body.folderId) {
      const f = await pool.query('SELECT id FROM folders WHERE id = $1', [body.folderId]);
      if (f.rows.length === 0) {
        jsonResponse(res, 404, { error: 'folder_not_found' });
        return;
      }
    }
    add('folder_id', body.folderId || null);
  }
  if (sets.length === 0) {
    jsonResponse(res, 400, { error: 'no_fields' });
    return;
  }
  sets.push(`updated_at = now()`);
  params.push(id);
  const q = `UPDATE documents SET ${sets.join(', ')} WHERE id = $${params.length}
             RETURNING id, title, folder_id AS "folderId", tags, module, visibility,
                       updated_at AS "updatedAt"`;
  const result = await pool.query(q, params);
  if (result.rows.length === 0) {
    jsonResponse(res, 404, { error: 'not_found', id });
    return;
  }
  jsonResponse(res, 200, { success: true, document: result.rows[0] });
}

async function documentDelete(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: { tenantId: string; userId: string | null; scopes: string[] },
  id: string,
) {
  if (!isAdmin(ctx)) {
    jsonResponse(res, 403, { error: 'insufficient_scope', required: 'knowledge:admin | *' });
    return;
  }
  const result = await pool.query('DELETE FROM documents WHERE id = $1 RETURNING id, title', [id]);
  if (result.rows.length === 0) {
    jsonResponse(res, 404, { error: 'not_found', id });
    return;
  }
  jsonResponse(res, 200, { success: true, deleted: id, title: result.rows[0].title });
}

async function documentReindex(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: { tenantId: string; userId: string | null; scopes: string[] },
  id: string,
) {
  if (!isAdmin(ctx)) {
    jsonResponse(res, 403, { error: 'insufficient_scope', required: 'knowledge:admin | *' });
    return;
  }
  const doc = await pool.query(
    `SELECT id, title, content FROM documents WHERE id = $1`,
    [id],
  );
  if (doc.rows.length === 0) {
    jsonResponse(res, 404, { error: 'not_found', id });
    return;
  }
  // 重切 chunk (覆盖)
  const content = String(doc.rows[0].content ?? '');
  if (content) {
    await pool.query('DELETE FROM document_chunks WHERE document_id = $1', [id]);
    const chunks = chunkContent(content, 800, 100);
    const ts = new Date().toISOString();
    for (let i = 0; i < chunks.length; i++) {
      const cid = `${id}_chunk_${i}_${Math.random().toString(36).slice(2, 6)}`;
      await pool.query(
        `INSERT INTO document_chunks (id, document_id, chunk_index, content, heading, chunk_token_count, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [cid, id, i, chunks[i].content, doc.rows[0].title, Math.ceil(chunks[i].content.length / 4), ts],
      );
    }
    // embedding 由 worker 异步处理 (不阻塞 API)
    // documents.embedding 字段保留,worker poll WHERE embedding IS NULL 时会重算
  }
  jsonResponse(res, 202, {
    success: true,
    documentId: id,
    message: 'chunks re-created; embedding will be picked up by indexer',
    requeuedAt: new Date().toISOString(),
  });
}

async function documentUpload(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: { tenantId: string; userId: string | null; scopes: string[] },
) {
  if (!isAdmin(ctx)) {
    jsonResponse(res, 403, { error: 'insufficient_scope', required: 'knowledge:admin | *' });
    return;
  }
  const body: any = await parseJsonBody(req).catch(() => ({}));
  const title = String(body.title ?? '').trim();
  const content = String(body.content ?? '');
  if (!title || !content) {
    jsonResponse(res, 400, { error: 'title_and_content_required' });
    return;
  }
  const folderId = body.folderId || null;
  const module = VALID_MODULES.has(body.module) ? body.module : 'knowledge';
  const visibility = VALID_VISIBILITY.has(body.visibility) ? body.visibility : 'team';
  const tags = Array.isArray(body.tags) ? body.tags.filter((t: unknown) => typeof t === 'string') : [];
  const id = `doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  let path = `/${slugify(title) || title}`;
  if (folderId) {
    const f = await pool.query('SELECT path FROM folders WHERE id = $1', [folderId]);
    if (f.rows.length > 0) path = `${f.rows[0].path}/${slugify(title) || title}`;
  }
  // path 唯一
  const ex = await pool.query('SELECT id FROM documents WHERE path = $1', [path]);
  if (ex.rows.length > 0) {
    path = `${path}-${Math.random().toString(36).slice(2, 6)}`;
  }
  const result = await pool.query(
    `INSERT INTO documents
       (id, title, folder_id, path, content, tags, module, kb_type, visibility, kb_version,
        quality_score, hit_count, feedback_count, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'industry', $8, 1, 0, 0, 0, now(), now())
     RETURNING id, title, folder_id AS "folderId", path, module, visibility,
               created_at AS "createdAt"`,
    [id, title, folderId, path, content, JSON.stringify(tags), module, visibility],
  );
  // 同步 chunk
  const chunks = chunkContent(content, 800, 100);
  const ts = new Date().toISOString();
  for (let i = 0; i < chunks.length; i++) {
    const cid = `${id}_chunk_${i}_${Math.random().toString(36).slice(2, 6)}`;
    await pool.query(
      `INSERT INTO document_chunks (id, document_id, chunk_index, content, heading, chunk_token_count, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [cid, id, i, chunks[i].content, title, Math.ceil(chunks[i].content.length / 4), ts],
    );
  }
  jsonResponse(res, 201, {
    success: true,
    document: result.rows[0],
    chunkCount: chunks.length,
    note: 'embedding will be generated by indexer worker',
  });
}

function chunkContent(content: string, size: number, overlap: number): { content: string }[] {
  if (!content) return [];
  const out: { content: string }[] = [];
  let i = 0;
  const step = Math.max(50, size - overlap);
  while (i < content.length) {
    out.push({ content: content.slice(i, i + size) });
    if (i + size >= content.length) break;
    i += step;
    if (out.length >= 2000) break; // 安全上限
  }
  return out;
}

// ── dispatch ────────────────────────────────────────────────────────────
export async function handleFoundationKbRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  method: string,
  url: string,
): Promise<boolean> {
  if (!url.startsWith('/api/v2/foundation/folders')
      && !url.startsWith('/api/v2/foundation/documents')) {
    return false;
  }
  const ctx = await requireBearer(req, res);
  if (!ctx) return true;

  const parsed = new URL(url, 'http://localhost');
  const path = parsed.pathname.replace(/\/+$/, '');

  // folders
  if (path === '/api/v2/foundation/folders/tree' && method === 'GET') {
    await foldersTree(req, res, ctx);
    return true;
  }
  if (path === '/api/v2/foundation/folders' && method === 'POST') {
    await folderCreate(req, res, ctx);
    return true;
  }
  const folderMatch = path.match(/^\/api\/v2\/foundation\/folders\/([^/]+)$/);
  if (folderMatch) {
    const id = decodeURIComponent(folderMatch[1]);
    if (method === 'PATCH') { await folderPatch(req, res, ctx, id); return true; }
    if (method === 'DELETE') { await folderDelete(req, res, ctx, id); return true; }
  }

  // documents
  // upload (before /:id to avoid pattern clash)
  if (path === '/api/v2/foundation/documents/upload' && method === 'POST') {
    await documentUpload(req, res, ctx);
    return true;
  }
  const docChunksMatch = path.match(/^\/api\/v2\/foundation\/documents\/([^/]+)\/chunks$/);
  if (docChunksMatch && method === 'GET') {
    await documentChunks(req, res, ctx, decodeURIComponent(docChunksMatch[1]));
    return true;
  }
  const docReindexMatch = path.match(/^\/api\/v2\/foundation\/documents\/([^/]+)\/reindex$/);
  if (docReindexMatch && method === 'POST') {
    await documentReindex(req, res, ctx, decodeURIComponent(docReindexMatch[1]));
    return true;
  }
  const docMatch = path.match(/^\/api\/v2\/foundation\/documents\/([^/]+)$/);
  if (docMatch) {
    const id = decodeURIComponent(docMatch[1]);
    if (method === 'GET') { await documentDetail(req, res, ctx, id); return true; }
    if (method === 'PATCH') { await documentPatch(req, res, ctx, id); return true; }
    if (method === 'DELETE') { await documentDelete(req, res, ctx, id); return true; }
  }

  return false;
}
