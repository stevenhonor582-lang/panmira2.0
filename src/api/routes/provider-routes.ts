import type * as http from 'node:http';
import { jsonResponse, parseJsonBody } from './helpers.js';
import type { RouteContext } from './types.js';
import { requireRole } from '../../middleware/rbac.js';

export async function handleProviderRoutes(
  ctx: RouteContext,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  method: string,
  url: string,
): Promise<boolean> {
  const store = ctx.providerConfigStore;
  if (!store) return false;

  // GET /api/providers — admin only. Returns safe list (no plaintext key).
  if (method === 'GET' && url === '/api/providers') {
    const guard = await requireRole('admin')(req, res);
    if (!guard) return true;
    const providers = await store.listSafe();
    jsonResponse(res, 200, { providers });
    return true;
  }

  // GET /api/providers/default — current default provider.
  if (method === 'GET' && url === '/api/providers/default') {
    const guard = await requireRole('admin')(req, res);
    if (!guard) return true;
    const provider = await store.getDefault();
    jsonResponse(res, 200, { provider });
    return true;
  }

  // GET /api/providers/:id — single provider, safe form (no plaintext key).
  if (method === 'GET' && url.match(/^\/api\/providers\/[^/]+$/)) {
    const guard = await requireRole('admin')(req, res);
    if (!guard) return true;
    const id = decodeURIComponent(url.split('/')[3]);
    const p = await store.findById(id);
    if (!p) {
      jsonResponse(res, 404, { error: 'Provider not found' });
      return true;
    }
    const { apiKeyEncrypted, ...safe } = p;
    jsonResponse(res, 200, {
      provider: {
        ...safe,
        hasApiKey: !!apiKeyEncrypted,
        apiKeyMasked: apiKeyEncrypted ? '••••' + apiKeyEncrypted.slice(-4) : null,
      },
    });
    return true;
  }

  // POST /api/providers/test — test connection with provided credentials.
  // body: { baseUrl, apiKey, model, type, providerId? }
  // If apiKey omitted but providerId given, fetch decrypted key from DB.
  if (method === 'POST' && url === '/api/providers/test') {
    const guard = await requireRole('admin')(req, res);
    if (!guard) return true;
    const body = (await parseJsonBody(req)) as Record<string, any>;
    const baseUrl = (body.baseUrl || body.base_url || '') as string;
    let apiKey = (body.apiKey || body.api_key || '') as string;
    const model = (body.model || '') as string;
    const providerId = (body.providerId || '') as string;

    if (!apiKey && providerId) {
      const decrypted = await store.getDecryptedApiKey(providerId);
      if (!decrypted) {
        jsonResponse(res, 400, { ok: false, error: 'Provider not found or no API key stored' });
        return true;
      }
      apiKey = decrypted;
    }

    if (!baseUrl || !apiKey) {
      jsonResponse(res, 400, { ok: false, error: 'baseUrl and apiKey are required' });
      return true;
    }

    const base = baseUrl.replace(/\/$/, '');
    const providerType = (body.type || '') as string;
    const isEmbedding = providerType === 'embedding';

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      };

      let testRes: Response;
      const isAnthropic = /\/anthropic/i.test(base);

      if (isEmbedding) {
        const testModel = model || 'BAAI/bge-m3';
        testRes = await fetch(`${base}/embeddings`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ model: testModel, input: ['test'], encoding_format: 'float' }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (testRes.ok) {
          const data = (await testRes.json().catch(() => ({}))) as any;
          jsonResponse(res, 200, { ok: true, model: data?.model || testModel });
        } else {
          jsonResponse(res, 200, { ok: false, status: testRes.status, error: await extractErr(testRes) });
        }
      } else {
        const testModel = model || 'gpt-3.5-turbo';
        const testUrl = isAnthropic ? `${base}/v1/messages` : `${base}/chat/completions`;

        if (isAnthropic) {
          headers['x-api-key'] = apiKey;
          headers['anthropic-version'] = '2023-06-01';
          delete headers['Authorization'];
        }

        testRes = await fetch(testUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: testModel,
            messages: [{ role: 'user', content: 'Hi' }],
            max_tokens: 5,
            ...(isAnthropic ? {} : { stream: false }),
          }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (testRes.ok) {
          const data = (await testRes.json().catch(() => ({}))) as any;
          jsonResponse(res, 200, { ok: true, model: data?.model || testModel });
        } else {
          jsonResponse(res, 200, { ok: false, status: testRes.status, error: await extractErr(testRes) });
        }
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error && err.name === 'AbortError'
          ? '连接超时 (10s)'
          : err instanceof Error
            ? err.message
            : 'Unknown error';
      jsonResponse(res, 200, { ok: false, error: msg });
    }
    return true;
  }

  // POST /api/providers — create. Admin only.
  // body: { name, type, baseUrl, apiKey, model, contextWindow, isDefault }
  if (method === 'POST' && url === '/api/providers') {
    const guard = await requireRole('admin')(req, res);
    if (!guard) return true;
    const body = (await parseJsonBody(req)) as Record<string, any>;
    const name = (body.name || '').trim();
    const model = (body.model || '').trim();
    if (!name || !model) {
      jsonResponse(res, 400, { error: 'name and model are required' });
      return true;
    }
    try {
      const provider = await store.create({
        name,
        type: body.type || 'openai',
        baseUrl: body.baseUrl || body.base_url || '',
        apiKey: body.apiKey || body.api_key || undefined,
        model,
        contextWindow: numOrNull(body.contextWindow ?? body.context_window),
        isDefault: !!body.isDefault,
        modelCategory: typeof body.modelCategory === 'string' && body.modelCategory.trim()
          ? body.modelCategory.trim()
          : 'llm',
      });
      jsonResponse(res, 201, { provider: sanitize(provider) });
    } catch (err: any) {
      if (err.message?.includes('unique')) {
        jsonResponse(res, 409, { error: `服务商 "${name}" 已存在` });
      } else {
        jsonResponse(res, 500, { error: err.message || 'Create failed' });
      }
    }
    return true;
  }

  // PUT/PATCH /api/providers/:id — update.
  const isPatchId = method === 'PATCH' && url.startsWith('/api/providers/') && !url.includes('/test');
  const isPutId = method === 'PUT' && url.startsWith('/api/providers/') && !url.includes('/test');
  if (isPatchId || isPutId) {
    const guard = await requireRole('admin')(req, res);
    if (!guard) return true;
    const id = decodeURIComponent(url.slice('/api/providers/'.length));
    if (!id || id.includes('/')) {
      jsonResponse(res, 400, { error: 'Missing provider id' });
      return true;
    }
    const body = (await parseJsonBody(req)) as Record<string, any>;
    const patch: Record<string, any> = {};
    if (body.name !== undefined) patch.name = body.name;
    if (body.type !== undefined) patch.type = body.type;
    if (body.baseUrl !== undefined) patch.baseUrl = body.baseUrl;
    if (body.base_url !== undefined) patch.baseUrl = body.base_url;
    if (body.apiKey !== undefined) patch.apiKey = body.apiKey;
    if (body.api_key !== undefined) patch.apiKey = body.api_key;
    if (body.model !== undefined) patch.model = body.model;
    if (body.contextWindow !== undefined) patch.contextWindow = numOrNull(body.contextWindow);
    if (body.context_window !== undefined) patch.contextWindow = numOrNull(body.context_window);
    if (body.isDefault !== undefined) patch.isDefault = !!body.isDefault;
    if (body.is_default !== undefined) patch.isDefault = !!body.is_default;
    if (body.modelCategory !== undefined && typeof body.modelCategory === 'string') {
      patch.modelCategory = body.modelCategory.trim() || 'llm';
    }

    const provider = await store.update(id, patch);
    if (!provider) {
      jsonResponse(res, 404, { error: 'Provider not found' });
      return true;
    }
    jsonResponse(res, 200, { provider: sanitize(provider) });
    return true;
  }

  // DELETE /api/providers/:id — refuses if agents still reference it.
  if (method === 'DELETE' && url.startsWith('/api/providers/')) {
    const guard = await requireRole('admin')(req, res);
    if (!guard) return true;
    const id = decodeURIComponent(url.slice('/api/providers/'.length));
    const result = await store.deleteIfNotInUse(id);
    if (result.inUse) {
      jsonResponse(res, 409, {
        deleted: false,
        error: 'provider_in_use',
        message: `服务商被 ${result.agentCount} 个 agent 引用,请先重新指派`,
        agentCount: result.agentCount,
      });
    } else {
      jsonResponse(res, result.deleted ? 200 : 404, { deleted: result.deleted });
    }
    return true;
  }

  // POST /api/providers/:id/test — speed test using stored api_key. Returns latencyMs.
  if (method === 'POST' && url.match(/^\/api\/providers\/[^/]+\/test$/)) {
    const guard = await requireRole('admin')(req, res);
    if (!guard) return true;
    const id = decodeURIComponent(url.split('/')[3]);
    const provider = await store.findById(id);
    if (!provider) {
      jsonResponse(res, 404, { ok: false, error: 'Provider not found' });
      return true;
    }
    const decryptedKey = await store.getDecryptedApiKey(id);
    const start = Date.now();
    const base = (provider.baseUrl || '').replace(/\/$/, '');
    const isAnthropic = /\/anthropic/i.test(base);
    const isEmbedding = provider.type === 'embedding';
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(decryptedKey
          ? isAnthropic
            ? { 'x-api-key': decryptedKey, 'anthropic-version': '2023-06-01' }
            : { Authorization: `Bearer ${decryptedKey}` }
          : {}),
      };
      const testUrl = isEmbedding
        ? `${base}/embeddings`
        : isAnthropic
          ? `${base}/v1/messages`
          : `${base}/chat/completions`;
      const reqBody = isEmbedding
        ? { model: provider.model || 'BAAI/bge-m3', input: ['ping'], encoding_format: 'float' }
        : isAnthropic
          ? { model: provider.model || 'claude-3-5-sonnet-20241022', messages: [{ role: 'user', content: 'Hi' }], max_tokens: 1 }
          : { model: provider.model || 'gpt-3.5-turbo', messages: [{ role: 'user', content: 'Hi' }], max_tokens: 1, stream: false };
      const r = await fetch(testUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(reqBody),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const latencyMs = Date.now() - start;
      if (r.ok) {
        jsonResponse(res, 200, { ok: true, latencyMs, model: provider.model });
      } else {
        jsonResponse(res, 200, { ok: false, latencyMs, status: r.status, error: await extractErr(r) });
      }
    } catch (err: unknown) {
      const latencyMs = Date.now() - start;
      const msg =
        err instanceof Error && err.name === 'AbortError'
          ? '连接超时 (10s)'
          : err instanceof Error
            ? err.message
            : 'Unknown error';
      jsonResponse(res, 200, { ok: false, latencyMs, error: msg });
    }
    return true;
  }

  return false;
}

async function extractErr(r: Response): Promise<string> {
  const errText = await r.text().catch(() => '');
  let errMsg = `HTTP ${r.status}`;
  try {
    const e = JSON.parse(errText);
    errMsg = e?.error?.message || e?.message || errMsg;
  } catch {
    /* keep default */
  }
  return errMsg;
}

function numOrNull(v: any): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Strip the decrypted api key from a ProviderConfig before sending to client.
 * Returns hasApiKey + masked tail instead. Never echo plaintext.
 */
function sanitize(p: { apiKeyEncrypted?: string | null } & Record<string, any>) {
  const { apiKeyEncrypted, ...rest } = p;
  const tail = apiKeyEncrypted ? apiKeyEncrypted.slice(-4) : '';
  return {
    ...rest,
    hasApiKey: !!apiKeyEncrypted,
    apiKeyMasked: apiKeyEncrypted ? '••••••' + tail : null,
  };
}
