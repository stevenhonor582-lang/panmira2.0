/**
 * IA v6 — /api/v2/foundation — 数智底座
 * 聚合模块: memory + knowledge + documents + sediment
 */
import type * as http from 'node:http';
import { pool } from '../../db/index.js';
import { jsonResponse, ok, fail } from './helpers.js';
import { requireBearer, requireAnyScope } from '../oauth-middleware.js';

export async function handleFoundationRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  method: string,
  url: string,
): Promise<boolean> {
  const u = new URL(url, 'http://localhost');
  if (!u.pathname.startsWith('/api/v2/foundation')) return false;

  const ctx = await requireBearer(req, res);
  if (!ctx) return true;

  const tenantId = ctx.tenantId || '00000000-0000-0000-0000-000000000000';

  // GET /api/v2/foundation — 数智底座总览
  if (method === 'GET' && u.pathname === '/api/v2/foundation') {
    if (!requireAnyScope(ctx, ['knowledge:read', 'knowledge:admin', 'memory:read', '*'])) {
      jsonResponse(res, 403, fail('forbidden', '需要 knowledge:read 或 memory:read'));
      return true;
    }
    try {
      const overview = await pool.query(`
        SELECT
          (SELECT count(*) FROM knowledge_bases WHERE tenant_id = $1)::int AS knowledge_bases,
          (SELECT count(*) FROM document_chunks)::int AS knowledge_chunks,
          (SELECT count(*) FROM memories WHERE tenant_id = $1::text)::int AS memories,
          (SELECT count(*) FROM memories WHERE tenant_id = $1::text AND created_at > now() - interval '7 days')::int AS memories_recent,
          (SELECT count(*) FROM agent_messages)::int AS agent_messages
      `, [tenantId]);
      jsonResponse(res, 200, ok({
        module: 'foundation',
        stats: overview.rows[0],
        sub_modules: ['memory', 'knowledge', 'documents', 'sediment'],
        new_paths: {
          memory: '/api/v2/foundation/memory',
          knowledge: '/api/v2/foundation/knowledge',
        },
      }));
      return true;
    } catch (e) {
      jsonResponse(res, 500, fail('internal_error', String(e)));
      return true;
    }
  }

  // GET /api/v2/foundation/memory — 记忆列表(代理老路径)
  if (method === 'GET' && u.pathname === '/api/v2/foundation/memory') {
    if (!requireAnyScope(ctx, ['memory:read', '*'])) {
      jsonResponse(res, 403, fail('forbidden', '需要 memory:read'));
      return true;
    }
    try {
      const result = await pool.query(
        `SELECT id, content, layer, importance, hit_count, last_hit_at, created_at, subject
           FROM memories
          WHERE tenant_id = $1
          ORDER BY created_at DESC LIMIT 50`,
        [tenantId],
      );
      jsonResponse(res, 200, ok({ memories: result.rows }));
      return true;
    } catch (e) {
      jsonResponse(res, 500, fail('internal_error', String(e)));
      return true;
    }
  }

  // GET /api/v2/foundation/knowledge — 知识库列表
  if (method === 'GET' && u.pathname === '/api/v2/foundation/knowledge') {
    if (!requireAnyScope(ctx, ['knowledge:read', '*'])) {
      jsonResponse(res, 403, fail('forbidden', '需要 knowledge:read'));
      return true;
    }
    try {
      const result = await pool.query(
        `SELECT id, name, description, visibility AS is_active, document_count, created_at, updated_at
           FROM knowledge_bases
          WHERE tenant_id = $1
          ORDER BY created_at DESC LIMIT 50`,
        [tenantId],
      );
      jsonResponse(res, 200, ok({ knowledge_bases: result.rows }));
      return true;
    } catch (e) {
      jsonResponse(res, 500, fail('internal_error', String(e)));
      return true;
    }
  }

  return false;
}
