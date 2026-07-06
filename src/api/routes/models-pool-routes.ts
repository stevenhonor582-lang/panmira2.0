import type * as http from 'node:http';
import { pool } from '../../db/index.js';
import { jsonResponse, parseJsonBody } from './helpers.js';
import { requireBearer, requireAnyScope } from '../oauth-middleware.js';

export async function handleModelsPoolRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  method: string,
  url: string,
): Promise<boolean> {
  const u = new URL(url, 'http://localhost');
  if (!u.pathname.startsWith('/api/v2/admin/models')) return false;

  const ctx = await requireBearer(req, res);
  if (!ctx) return true;

  if (method === 'GET' && u.pathname === '/api/v2/admin/models') {
    if (!requireAnyScope(ctx, ['model:read', 'model:admin'])) {
      jsonResponse(res, 403, { error: 'insufficient_scope', required: 'model:read OR model:admin' });
      return true;
    }
    try {
      const llmRes = await pool.query(`
        SELECT id, name, type, base_url, model, is_default, created_at
        FROM provider_configs ORDER BY name
      `);
      const embRes = await pool.query(`
        SELECT id, name, base_url, model_name AS model, dimensions, status, created_at
        FROM embedding_providers ORDER BY name
      `);
      const models = [
        ...llmRes.rows.map((r: any) => ({
          id: r.id, type: 'llm', name: r.name, baseUrl: r.base_url, model: r.model,
          isDefault: r.is_default, status: 'active', createdAt: r.created_at,
        })),
        ...embRes.rows.map((r: any) => ({
          id: r.id, type: 'embedding', name: r.name, baseUrl: r.base_url, model: r.model,
          dimensions: r.dimensions, status: r.status || 'active', createdAt: r.created_at,
        })),
      ];
      jsonResponse(res, 200, { models });
      return true;
    } catch (err) {
      jsonResponse(res, 500, { error: 'internal_error', message: String(err) });
      return true;
    }
  }

  if (method === 'POST' && u.pathname === '/api/v2/admin/models') {
    if (!requireAnyScope(ctx, ['model:admin'])) {
      jsonResponse(res, 403, { error: 'insufficient_scope', required: 'model:admin' });
      return true;
    }
    try {
      const body = await parseJsonBody(req);
      const type = (body.type || 'llm') as string;
      if (type === 'llm') {
        const result = await pool.query(
          `INSERT INTO provider_configs (name, type, base_url, api_key_encrypted, model, is_default)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, name, type, base_url, model, is_default`,
          [body.name, body.providerType || 'openai', body.baseUrl, body.apiKey || '', body.model || '', !!body.isDefault]
        );
        jsonResponse(res, 201, { model: result.rows[0] });
        return true;
      } else if (type === 'embedding') {
        const result = await pool.query(
          `INSERT INTO embedding_providers (name, base_url, api_key_encrypted, model_name, dimensions, status)
           VALUES ($1, $2, $3, $4, $5, 'active') RETURNING id, name, base_url, model_name, dimensions, status`,
          [body.name, body.baseUrl, body.apiKey || '', body.model || '', Number(body.dimensions) || 1024]
        );
        jsonResponse(res, 201, { model: result.rows[0] });
        return true;
      }
      jsonResponse(res, 400, { error: 'invalid_type', message: 'type must be llm or embedding' });
      return true;
    } catch (err) {
      jsonResponse(res, 500, { error: 'internal_error', message: String(err) });
      return true;
    }
  }

  const testMatch = u.pathname.match(/^\/api\/v2\/admin\/models\/([^/]+)\/test$/);
  if (method === 'POST' && testMatch) {
    if (!requireAnyScope(ctx, ['model:test', 'model:read', 'model:admin'])) {
      jsonResponse(res, 403, { error: 'insufficient_scope', required: 'model:test OR model:read OR model:admin' });
      return true;
    }
    const id = testMatch[1];
    try {
      const r = await pool.query(`SELECT base_url, api_key_encrypted, model FROM provider_configs WHERE id = $1`, [id]);
      if (r.rows.length === 0) {
        jsonResponse(res, 404, { error: 'not_found' });
        return true;
      }
      const row = r.rows[0];
      const start = Date.now();
      try {
        const resp = await fetch(`${row.base_url}/models`, {
          headers: row.api_key_encrypted ? { Authorization: `Bearer ${row.api_key_encrypted}` } : {},
          signal: AbortSignal.timeout(5000),
        });
        jsonResponse(res, 200, {
          ok: resp.ok,
          status: resp.status,
          latencyMs: Date.now() - start,
          message: resp.ok ? '连通' : `HTTP ${resp.status}`,
        });
      } catch (fetchErr) {
        jsonResponse(res, 200, { ok: false, error: String(fetchErr), latencyMs: Date.now() - start });
      }
      return true;
    } catch (err) {
      jsonResponse(res, 500, { error: 'internal_error', message: String(err) });
      return true;
    }
  }

  const patchMatch = u.pathname.match(/^\/api\/v2\/admin\/models\/([^/]+)$/);
  if (method === 'PATCH' && patchMatch) {
    if (!requireAnyScope(ctx, ['model:admin'])) {
      jsonResponse(res, 403, { error: 'insufficient_scope', required: 'model:admin' });
      return true;
    }
    const id = patchMatch[1];
    try {
      const body = await parseJsonBody(req);
      const status = (body.status || 'active') as string;
      const result = await pool.query(
        `UPDATE embedding_providers SET status = $1 WHERE id = $2 RETURNING id, status`,
        [status, id]
      );
      if (result.rows.length === 0) {
        jsonResponse(res, 404, { error: 'not_found', message: 'provider not found or does not support status toggle' });
        return true;
      }
      jsonResponse(res, 200, { updated: result.rows[0] });
      return true;
    } catch (err) {
      jsonResponse(res, 500, { error: 'internal_error', message: String(err) });
      return true;
    }
  }

  jsonResponse(res, 404, { error: 'not_found' });
  return true;
}
