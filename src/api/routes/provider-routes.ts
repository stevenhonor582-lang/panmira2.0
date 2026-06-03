import type * as http from 'node:http';
import { jsonResponse, parseJsonBody } from './helpers.js';
import type { RouteContext } from './types.js';

export async function handleProviderRoutes(
  ctx: RouteContext,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  method: string,
  url: string,
): Promise<boolean> {
  const store = ctx.providerConfigStore;
  if (!store) return false;

  // GET /api/providers
  if (method === 'GET' && url === '/api/providers') {
    const providers = await store.list();
    jsonResponse(res, 200, { providers });
    return true;
  }

  // GET /api/providers/default
  if (method === 'GET' && url === '/api/providers/default') {
    const provider = await store.getDefault();
    jsonResponse(res, 200, { provider });
    return true;
  }

  // POST /api/providers/test — test connection with provided credentials
  if (method === 'POST' && url === '/api/providers/test') {
    const body = await parseJsonBody(req);
    const baseUrl = (body.baseUrl || body.base_url || '') as string;
    let apiKey = (body.apiKey || body.api_key || '') as string;
    const model = (body.model || '') as string;
    const providerId = (body.providerId || '') as string;

    // If no apiKey provided but providerId given, fetch decrypted key from DB
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
      const timeout = setTimeout(() => controller.abort(), 15000);

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      };

      let testRes: Response;

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
          const errText = await testRes.text().catch(() => '');
          let errMsg = `HTTP ${testRes.status}`;
          try {
            const errData = JSON.parse(errText);
            errMsg = errData?.error?.message || errData?.message || errMsg;
          } catch {
            /* keep default */
          }
          jsonResponse(res, 200, { ok: false, error: errMsg, status: testRes.status });
        }
      } else {
        const testModel = model || 'gpt-3.5-turbo';
        const isAnthropic = /\/anthropic/i.test(base);
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
          const errText = await testRes.text().catch(() => '');
          let errMsg = `HTTP ${testRes.status}`;
          try {
            const errData = JSON.parse(errText);
            errMsg = errData?.error?.message || errData?.message || errMsg;
          } catch {
            /* keep default */
          }
          jsonResponse(res, 200, { ok: false, error: errMsg, status: testRes.status });
        }
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error && err.name === 'AbortError'
          ? '连接超时 (15s)'
          : err instanceof Error
            ? err.message
            : 'Unknown error';
      jsonResponse(res, 200, { ok: false, error: msg });
    }
    return true;
  }

  // POST /api/providers — create
  if (method === 'POST' && url === '/api/providers') {
    const body = await parseJsonBody(req);
    const { name, type, baseUrl, apiKey, model, isDefault } = body as Record<string, any>;
    if (!name || !model) {
      jsonResponse(res, 400, { error: 'name and model are required' });
      return true;
    }
    try {
      const provider = await store.create({
        name,
        type: type || 'openai',
        baseUrl: baseUrl || '',
        apiKey: apiKey || undefined,
        model,
        isDefault: isDefault ?? false,
      });
      jsonResponse(res, 201, { provider });
    } catch (err: any) {
      if (err.message?.includes('unique')) {
        jsonResponse(res, 409, { error: `Provider "${name}" already exists` });
      } else {
        throw err;
      }
    }
    return true;
  }

  // PUT /api/providers/:id — update
  if (method === 'PUT' && url.startsWith('/api/providers/')) {
    const id = decodeURIComponent(url.slice('/api/providers/'.length));
    if (!id) {
      jsonResponse(res, 400, { error: 'Missing provider id' });
      return true;
    }
    const body = await parseJsonBody(req);
    const provider = await store.update(id, body as Record<string, any>);
    if (!provider) {
      jsonResponse(res, 404, { error: 'Provider not found' });
      return true;
    }
    jsonResponse(res, 200, { provider });
    return true;
  }

  // DELETE /api/providers/:id
  if (method === 'DELETE' && url.startsWith('/api/providers/')) {
    const id = decodeURIComponent(url.slice('/api/providers/'.length));
    const deleted = await store.delete(id);
    jsonResponse(res, deleted ? 200 : 404, { deleted });
    return true;
  }

  return false;
}
