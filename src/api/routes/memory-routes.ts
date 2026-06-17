import type { RouteHandler, RouteContext } from './types.js';
import { jsonResponse, parseJsonBody } from './helpers.js';
import { MemoryManager } from '../../memory-engine/memory-manager.js';
import { PostgresStore } from '../../memory-engine/storage/postgres-store.js';
import { OpenAIEmbedder } from '../../memory-engine/retrieval/embedder.js';
import { MemoryLayer } from '../../core/constants.js';

let manager: MemoryManager | undefined;

function getManager(): MemoryManager {
  if (!manager) {
    const storage = new PostgresStore();
    const embedder = new OpenAIEmbedder();
    manager = new MemoryManager(storage, embedder);
  }
  return manager;
}

export const handleMemoryRoutes: RouteHandler = async (_ctx, req, res, method, url) => {
  if (!url.startsWith('/api/v1/memory')) return false;

  // Internal API key check — requests must come from within the Panmira process
  const internalKey = process.env.MEMORY_INTERNAL_KEY || 'panmira-internal';
  const reqKey = req.headers['x-internal-key'] as string;
  if (reqKey !== internalKey) {
    jsonResponse(res, 403, { error: 'Forbidden' });
    return true;
  }

  const mgr = getManager();
  const tenantId = (req.headers['x-tenant-id'] as string) ?? 'default';
  const userId = (req.headers['x-user-id'] as string) ?? 'anonymous';

  if (url === '/api/v1/memory/store' && method === 'POST') {
    const body = await parseJsonBody(req);
    const id = await mgr.store(body.content as string, userId, tenantId, {
      layer: (body.layer as MemoryLayer) ?? MemoryLayer.USER,
      // 2026-06-17: was agentId (text), now botId (uuid)
      botId: body.bot_id as string,
      importance: body.importance as number,
    });
    jsonResponse(res, 200, { id, status: 'stored' });
    return true;
  }

  if (url === '/api/v1/memory/retrieve' && method === 'POST') {
    const body = await parseJsonBody(req);
    const results = await mgr.retrieve({
      query: body.query as string,
      userId,
      layers: (body.layers as number[] | undefined)?.map((l) => l as MemoryLayer),
      limit: body.limit as number | undefined,
    });
    jsonResponse(res, 200, {
      results: results.map((r) => ({ content: r.memory.content, similarity: r.similarity, layer: r.memory.layer })),
    });
    return true;
  }

  if (url === '/api/v1/memory/synthesize' && method === 'POST') {
    const body = await parseJsonBody(req);
    const context = await mgr.synthesize(body.query as string, userId, {
      layers: (body.layers as number[] | undefined)?.map((l) => l as MemoryLayer),
      limit: body.limit as number | undefined,
    });
    jsonResponse(res, 200, { context });
    return true;
  }

  return false;
};
