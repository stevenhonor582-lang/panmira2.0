/**
 * R13-C · Foundation Memory CRUD (2026-07-08)
 *
 * 补全 r10-data-routes 的 memory 端点 (GET /:list 仍由 r10 处理):
 *   GET    /api/v2/foundation/memory/item/:id  — 单条详情 (不含 embedding)
 *   PATCH  /api/v2/foundation/memory/:id       — 改 layer / importance / content / subject / tags
 *   DELETE /api/v2/foundation/memory/:id       — 删除 (admin only)
 *   POST   /api/v2/foundation/memory           — 手动添加
 *
 * memories.tenant_id 是字符串 (user:xxx),不过滤,看全部。
 * embedding 字段绝不返回。
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

function publicRow(r: Record<string, any>): Record<string, unknown> {
  const { embedding, ...rest } = r;
  void embedding;
  return {
    ...rest,
    createdAt: toISO(r.created_at ?? r.createdAt),
    updatedAt: toISO(r.updated_at ?? r.updatedAt),
    lastHitAt: toISO(r.last_hit_at ?? r.lastHitAt),
    lastAccessed: toISO(r.last_accessed ?? r.lastAccessed),
  };
}

function isAdmin(ctx: { scopes: string[] }): boolean {
  return requireAnyScope(ctx as any, ['memory:admin', 'memory:write', '*']);
}

const VALID_LAYERS = new Set([1, 2, 3]);
const VALID_TYPES = new Set(['fact', 'event', 'preference', 'entity', 'decision']);

// ── GET /api/v2/foundation/memory/item/:id ──────────────────────────────
async function memoryDetail(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  _ctx: { tenantId: string; userId: string | null },
  id: string,
) {
  const result = await pool.query(
    `SELECT id, layer, subject, subject_normalized, content, importance, type, polarity,
            bot_id, tenant_id, user_id, hit_count, access_count, confidence,
            metadata_json AS metadata,
            metadata_json->'tags' AS tags,
            created_at, updated_at, last_hit_at, last_accessed,
            superseded_by, invalidated_at
       FROM memories
       WHERE id = $1
       LIMIT 1`,
    [id],
  );
  if (result.rows.length === 0) {
    jsonResponse(res, 404, { error: 'not_found', id });
    return;
  }
  jsonResponse(res, 200, { success: true, memory: publicRow(result.rows[0]) });
}

// ── PATCH /api/v2/foundation/memory/:id ─────────────────────────────────
async function memoryPatch(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: { tenantId: string; userId: string | null; scopes: string[] },
  id: string,
) {
  if (!isAdmin(ctx)) {
    jsonResponse(res, 403, { error: 'insufficient_scope', required: 'memory:admin | *' });
    return;
  }
  const body: any = await parseJsonBody(req).catch(() => ({}));
  const sets: string[] = [];
  const params: unknown[] = [];
  const add = (col: string, val: unknown) => {
    params.push(val);
    sets.push(`${col} = $${params.length}`);
  };

  if (body.layer !== undefined) {
    const l = Number(body.layer);
    if (!VALID_LAYERS.has(l)) {
      jsonResponse(res, 400, { error: 'invalid_layer', allowed: [1, 2, 3] });
      return;
    }
    add('layer', l);
  }
  if (body.importance !== undefined) {
    const f = Number(body.importance);
    if (!Number.isFinite(f) || f < 0 || f > 1) {
      jsonResponse(res, 400, { error: 'invalid_importance', range: '[0, 1]' });
      return;
    }
    add('importance', f);
  }
  if (typeof body.content === 'string') add('content', body.content);
  if (typeof body.subject === 'string') {
    add('subject', body.subject);
    add('subject_normalized', body.subject.toLowerCase().replace(/\s+/g, '_').slice(0, 200));
  }
  if (body.type !== undefined) {
    if (!VALID_TYPES.has(body.type)) {
      jsonResponse(res, 400, { error: 'invalid_type', allowed: [...VALID_TYPES] });
      return;
    }
    add('type', body.type);
  }
  if (body.polarity !== undefined && ['affirm', 'negate'].includes(body.polarity)) {
    add('polarity', body.polarity);
  }
  if (body.tags !== undefined) {
    if (!Array.isArray(body.tags)) {
      jsonResponse(res, 400, { error: 'invalid_tags', expected: 'string[]' });
      return;
    }
    params.push(JSON.stringify({ tags: body.tags }));
    sets.push(`metadata_json = COALESCE(metadata_json, '{}'::jsonb) || $${params.length}::jsonb`);
  }
  if (sets.length === 0) {
    jsonResponse(res, 400, { error: 'no_fields', hint: 'layer|importance|content|subject|type|polarity|tags' });
    return;
  }
  sets.push(`updated_at = now()`);
  params.push(id);
  const q = `
    UPDATE memories SET ${sets.join(', ')}
    WHERE id = $${params.length}
    RETURNING id, layer, subject, subject_normalized, content, importance, type, polarity,
              bot_id, tenant_id, user_id, hit_count, access_count, confidence,
              metadata_json AS metadata,
              metadata_json->'tags' AS tags,
              created_at, updated_at, last_hit_at, last_accessed,
              superseded_by, invalidated_at`;
  try {
    const result = await pool.query(q, params);
    if (result.rows.length === 0) {
      jsonResponse(res, 404, { error: 'not_found', id });
      return;
    }
    jsonResponse(res, 200, { success: true, memory: publicRow(result.rows[0]) });
  } catch (e) {
    jsonResponse(res, 500, { error: 'update_failed', message: e instanceof Error ? e.message : 'unknown' });
  }
}

// ── DELETE /api/v2/foundation/memory/:id ────────────────────────────────
async function memoryDelete(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: { tenantId: string; userId: string | null; scopes: string[] },
  id: string,
) {
  if (!requireAnyScope(ctx as any, ['memory:admin', '*'])) {
    jsonResponse(res, 403, { error: 'insufficient_scope', required: 'memory:admin | *' });
    return;
  }
  const result = await pool.query('DELETE FROM memories WHERE id = $1 RETURNING id', [id]);
  if (result.rows.length === 0) {
    jsonResponse(res, 404, { error: 'not_found', id });
    return;
  }
  jsonResponse(res, 200, { success: true, deleted: id });
}

// ── POST /api/v2/foundation/memory ──────────────────────────────────────
async function memoryCreate(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: { tenantId: string; userId: string | null; scopes: string[] },
) {
  if (!isAdmin(ctx)) {
    jsonResponse(res, 403, { error: 'insufficient_scope', required: 'memory:admin | *' });
    return;
  }
  const body: any = await parseJsonBody(req).catch(() => ({}));
  const layer = Number(body.layer ?? 1);
  if (!VALID_LAYERS.has(layer)) {
    jsonResponse(res, 400, { error: 'invalid_layer', allowed: [1, 2, 3] });
    return;
  }
  if (typeof body.content !== 'string' || body.content.trim() === '') {
    jsonResponse(res, 400, { error: 'content_required' });
    return;
  }
  const importance = body.importance !== undefined ? Number(body.importance) : 0.5;
  if (!Number.isFinite(importance) || importance < 0 || importance > 1) {
    jsonResponse(res, 400, { error: 'invalid_importance', range: '[0, 1]' });
    return;
  }
  const type = VALID_TYPES.has(body.type) ? body.type : 'event';
  const tags = Array.isArray(body.tags) ? body.tags.filter((t: unknown) => typeof t === 'string') : [];
  const subjectRaw = typeof body.subject === 'string' && body.subject.trim()
    ? body.subject.trim()
    : body.content.slice(0, 80);
  const subjectNorm = body.subject
    ? String(body.subject).toLowerCase().replace(/\s+/g, '_').slice(0, 200)
    : `${subjectRaw.toLowerCase().replace(/\s+/g, '_').slice(0, 30)}_${Math.random().toString(36).slice(2, 8)}`;
  const id = typeof body.id === 'string' && body.id
    ? body.id
    : `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const tenantId = typeof body.tenantId === 'string' && body.tenantId
    ? body.tenantId
    : `user:${ctx.userId ?? 'admin'}`;
  const userId = typeof body.userId === 'string' ? body.userId : (ctx.userId ?? 'admin');
  const botId = typeof body.botId === 'string' && body.botId ? body.botId : null;
  const meta = JSON.stringify({
    tags,
    source: 'manual',
    createdBy: ctx.userId ?? null,
    ...(body.metadata && typeof body.metadata === 'object' ? body.metadata as Record<string, unknown> : {}),
  });

  try {
    const result = await pool.query(
      `INSERT INTO memories
         (id, layer, content, importance, subject, subject_normalized, type,
          bot_id, tenant_id, user_id, metadata_json, confidence, hit_count, access_count,
          created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 1.0, 0, 0, now(), now())
       RETURNING id, layer, subject, subject_normalized, content, importance, type, polarity,
                 bot_id, tenant_id, user_id, hit_count, access_count, confidence,
                 metadata_json AS metadata,
                 metadata_json->'tags' AS tags,
                 created_at, updated_at, last_hit_at, last_accessed,
                 superseded_by, invalidated_at`,
      [id, layer, body.content, importance, subjectRaw, subjectNorm, type,
       botId, tenantId, userId, meta],
    );
    jsonResponse(res, 201, { success: true, memory: publicRow(result.rows[0]) });
  } catch (e) {
    jsonResponse(res, 500, { error: 'create_failed', message: e instanceof Error ? e.message : 'unknown' });
  }
}

// ── dispatch ────────────────────────────────────────────────────────────
export async function handleFoundationMemoryRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  method: string,
  url: string,
): Promise<boolean> {
  // 只接管 detail / PATCH / DELETE / POST；GET layer list 留给 r10
  if (!url.startsWith('/api/v2/foundation/memory')) return false;

  const ctx = await requireBearer(req, res);
  if (!ctx) return true;

  const parsed = new URL(url, 'http://localhost');
  const path = parsed.pathname.replace(/\/+$/, '');

  // GET /api/v2/foundation/memory/item/:id  (必须在 :id 之前匹配)
  const detailMatch = path.match(/^\/api\/v2\/foundation\/memory\/item\/([^/]+)$/);
  if (detailMatch && method === 'GET') {
    await memoryDetail(req, res, ctx, decodeURIComponent(detailMatch[1]));
    return true;
  }

  // POST /api/v2/foundation/memory (新建)
  if (path === '/api/v2/foundation/memory' && method === 'POST') {
    await memoryCreate(req, res, ctx);
    return true;
  }

  // PATCH | DELETE /api/v2/foundation/memory/:id
  const idMatch = path.match(/^\/api\/v2\/foundation\/memory\/([^/]{1,200})$/);
  if (idMatch && (method === 'PATCH' || method === 'DELETE')) {
    const id = decodeURIComponent(idMatch[1]);
    if (method === 'PATCH') await memoryPatch(req, res, ctx, id);
    else await memoryDelete(req, res, ctx, id);
    return true;
  }

  return false;
}
