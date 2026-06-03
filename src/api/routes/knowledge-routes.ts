import type { RouteHandler, RouteContext } from './types.js';
import { jsonResponse, readBody } from './helpers.js';
import { pool } from '../../db/index.js';

export const handleKnowledgeRoutes: RouteHandler = async (ctx, req, res, method, url) => {
  const urlPath = (url || '').split('?')[0];
  if (!urlPath.startsWith('/api/knowledge')) return false;

  const wm = ctx.workspaceManager;
  if (!wm) {
    jsonResponse(res, 500, { error: 'workspaceManager not initialized' });
    return true;
  }

  const qp = new URL(url, 'http://localhost').searchParams;

  // GET /api/knowledge/stats
  if (method === 'GET' && urlPath === '/api/knowledge/stats') {
    const [docRes, folderRes] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS cnt FROM documents'),
      pool.query('SELECT COUNT(*)::int AS cnt FROM folders'),
    ]);
    const totalDocs = docRes.rows[0]?.cnt ?? 0;
    const totalFolders = folderRes.rows[0]?.cnt ?? 0;

    const scopeRes = await pool.query(
      `SELECT
        CASE
          WHEN path LIKE '/组织公共区%' THEN 'org'
          WHEN path LIKE '/数字员工%' THEN 'bot'
          WHEN path LIKE '/群协作区%' THEN 'group'
          ELSE 'other'
        END AS scope,
        COUNT(*)::int AS cnt
      FROM documents
      GROUP BY scope`,
    );
    const documentsByScope = scopeRes.rows.map((r: any) => ({ scope: r.scope, count: r.cnt }));

    jsonResponse(res, 200, { totalDocuments: totalDocs, totalFolders: totalFolders, documentsByScope });
    return true;
  }

  // GET /api/knowledge/config
  if (method === 'GET' && urlPath === '/api/knowledge/config') {
    const { rows } = await pool.query('SELECT key, value FROM memory_settings ORDER BY key');
    const config: Record<string, string> = {};
    for (const r of rows) config[r.key] = r.value;
    jsonResponse(res, 200, { config });
    return true;
  }

  // PUT /api/knowledge/config
  if (method === 'PUT' && urlPath === '/api/knowledge/config') {
    const body = JSON.parse(await readBody(req));
    const { key, value } = body;
    if (!key || value === undefined) {
      jsonResponse(res, 400, { error: 'key and value are required' });
      return true;
    }
    await pool.query(
      `INSERT INTO memory_settings (key, value, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()`,
      [key, String(value)],
    );
    jsonResponse(res, 200, { ok: true });
    return true;
  }

  // GET /api/knowledge/embedding-status
  if (method === 'GET' && urlPath === '/api/knowledge/embedding-status') {
    const { rows } = await pool.query(
      "SELECT base_url, model, type FROM provider_configs WHERE type = 'embedding' ORDER BY is_default DESC LIMIT 1",
    );
    const provider = rows[0] ?? null;
    const hasSiliconflow = !!process.env.SILICONFLOW_API_KEY;
    const available = !!(provider || hasSiliconflow);

    let model = 'N/A';
    let baseUrl = '';
    let providerType = provider?.type ?? 'none';
    if (provider) {
      model = provider.model || 'BAAI/bge-m3';
      baseUrl = provider.base_url || '';
    } else if (hasSiliconflow) {
      model = 'BAAI/bge-m3';
      baseUrl = 'https://api.siliconflow.cn/v1';
      providerType = 'siliconflow';
    }

    jsonResponse(res, 200, { available, provider: providerType, model, baseUrl, dimensions: 1024 });
    return true;
  }

  // POST /api/knowledge/embedding-test
  if (method === 'POST' && urlPath === '/api/knowledge/embedding-test') {
    try {
      const { rows } = await pool.query(
        "SELECT api_key_encrypted, base_url, model FROM provider_configs WHERE type = 'embedding' ORDER BY is_default DESC LIMIT 1",
      );

      let apiKey: string | null = null;
      let baseUrl = '';
      let model = 'BAAI/bge-m3';

      if (rows[0]?.api_key_encrypted) {
        const { decrypt } = await import('../../db/crypto.js');
        apiKey = decrypt(rows[0].api_key_encrypted);
        baseUrl = (rows[0].base_url || '').replace(/\/+$/, '');
        model = rows[0].model || 'BAAI/bge-m3';
      } else {
        apiKey = process.env.SILICONFLOW_API_KEY || null;
        baseUrl = 'https://api.siliconflow.cn/v1';
      }

      if (!apiKey) {
        jsonResponse(res, 200, { success: false, error: '未配置 Embedding API 密钥' });
        return true;
      }

      const start = Date.now();
      const response = await fetch(`${baseUrl}/embeddings`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, input: ['test'], encoding_format: 'float' }),
      });
      const latency = Date.now() - start;

      if (!response.ok) {
        const err = await response.text();
        jsonResponse(res, 200, { success: false, error: `API 返回 ${response.status}: ${err.slice(0, 200)}`, latency });
        return true;
      }

      jsonResponse(res, 200, { success: true, latency, model });
    } catch (err: any) {
      jsonResponse(res, 200, { success: false, error: err.message });
    }
    return true;
  }

  // POST /api/knowledge/cleanup
  if (method === 'POST' && urlPath === '/api/knowledge/cleanup') {
    const body = JSON.parse(await readBody(req));
    const days = parseInt(body.days || '365', 10);
    if (days <= 0) {
      jsonResponse(res, 400, { error: 'days must be > 0' });
      return true;
    }

    const cutoff = new Date(Date.now() - days * 86400000).toISOString();
    const result = await pool.query('DELETE FROM documents WHERE updated_at < $1 RETURNING id', [cutoff]);
    jsonResponse(res, 200, { deleted: result.rowCount ?? 0 });
    return true;
  }

  // GET /api/knowledge/cleanup-preview
  if (method === 'GET' && urlPath === '/api/knowledge/cleanup-preview') {
    const days = parseInt(qp.get('days') || '365', 10);
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();
    const { rows } = await pool.query('SELECT COUNT(*)::int AS cnt FROM documents WHERE updated_at < $1', [cutoff]);
    jsonResponse(res, 200, { count: rows[0]?.cnt ?? 0, days });
    return true;
  }

  // POST /api/knowledge/rebuild-index
  if (method === 'POST' && urlPath === '/api/knowledge/rebuild-index') {
    try {
      const org = await wm.ensureOrgWorkspace();
      await wm.rebuildIndex(org, 'org');
      jsonResponse(res, 200, { ok: true, message: '索引重建完成' });
    } catch (err: any) {
      jsonResponse(res, 500, { error: err.message });
    }
    return true;
  }

  return false;
};
