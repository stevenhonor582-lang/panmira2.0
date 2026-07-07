/**
 * IA v6 — /api/v2/models — 资源频道·LLM 模型池
 * 数据源: model_pool view (= provider_configs)
 */
import type * as http from 'node:http';
import { pool } from '../../db/index.js';
import { jsonResponse, ok, fail, paginated } from './helpers.js';
import { requireBearer, requireAnyScope } from '../oauth-middleware.js';

export async function handleModelsV6Routes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  method: string,
  url: string,
): Promise<boolean> {
  const u = new URL(url, 'http://localhost');
  if (!u.pathname.startsWith('/api/v2/models')) return false;

  const ctx = await requireBearer(req, res);
  if (!ctx) return true;

  // GET /api/v2/models — LLM 模型池列表
  if (method === 'GET' && u.pathname === '/api/v2/models') {
    if (!requireAnyScope(ctx, ['model:read', 'model:admin', '*'])) {
      jsonResponse(res, 403, fail('forbidden', '需要 model:read 或 model:admin'));
      return true;
    }
    try {
      const result = await pool.query(
        `SELECT id, name, type, base_url, model, is_default, status, created_at, updated_at
           FROM model_pool
          ORDER BY is_default DESC, name ASC`,
      );
      jsonResponse(res, 200, paginated(result.rows, result.rows.length, 1, 50));
      return true;
    } catch (e) {
      jsonResponse(res, 500, fail('internal_error', String(e)));
      return true;
    }
  }

  // GET /api/v2/models/:id
  const modelMatch = u.pathname.match(/^\/api\/v2\/models\/([^/]+)$/);
  if (method === 'GET' && modelMatch) {
    const id = modelMatch[1];
    try {
      const result = await pool.query(`SELECT * FROM model_pool WHERE id = $1`, [id]);
      if (result.rows.length === 0) {
        jsonResponse(res, 404, fail('not_found', `Model ${id} 不存在`));
        return true;
      }
      jsonResponse(res, 200, ok(result.rows[0]));
      return true;
    } catch (e) {
      jsonResponse(res, 500, fail('internal_error', String(e)));
      return true;
    }
  }

  return false;
}
