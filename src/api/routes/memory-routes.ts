import type { RouteHandler, RouteContext } from './types.js';
import { jsonResponse, parseJsonBody } from './helpers.js';
import { pool } from '../../db/index.js';
import { MemoryManager } from '../../memory-engine/memory-manager.js';
import { PostgresStore } from '../../memory-engine/storage/postgres-store.js';
import { OpenAIEmbedder } from '../../memory-engine/retrieval/embedder.js';
import { MemoryLayer } from '../../core/constants.js';
import { runCurator } from '../../services/memory-curator.js';

/**
 * R38-C4 阶段 3.6: agentId 反查 bot_id 列表。
 * 给定 agent,JOIN bot_configs 找出该 agent 下所有 bot 的 uuid。
 * 返回 bot_id string[]。若 agent 无绑定 bot,返回空数组(查询结果自然为空)。
 */
async function resolveAgentToBotIds(agentId: string): Promise<string[]> {
  const result = await pool.query(
    'SELECT bot_id FROM bot_configs WHERE agent_id = $1',
    [agentId],
  );
  return result.rows.map((r: any) => String(r.bot_id));
}

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
  // D-followup 2026-06-20: require x-tenant-id (was 'default' fallback).
  // CHECK constraint rejects 'default' on active memories.
  const tenantId = (req.headers['x-tenant-id'] as string);
  const userId = (req.headers['x-user-id'] as string);
  if (!tenantId || !userId) {
    jsonResponse(res, 400, { error: 'Missing required header: x-tenant-id and x-user-id' });
    return true;
  }

  if (url === '/api/v1/memory/store' && method === 'POST') {
    const body = await parseJsonBody(req);
    // R38-C4 阶段 3.6: 兼容 agentId,服务端反查 bot_id
    // body.agent_id (新) 优先, body.bot_id (旧) 保留
    let botId = (body.bot_id as string) || (body.botId as string) || '';
    const agentId = (body.agent_id as string) || (body.agentId as string) || '';
    if (!botId && agentId) {
      const botIds = await resolveAgentToBotIds(agentId);
      // 选用第一个 bot_id(若多 bot,记忆跟随第一个;更严谨设计是分别存,此处保持简单)
      botId = botIds[0] || '';
    }
    const id = await mgr.store(body.content as string, userId, tenantId, {
      layer: (body.layer as MemoryLayer) ?? MemoryLayer.USER,
      // 2026-06-17: was agentId (text), now botId (uuid)
      botId: botId || undefined,
      importance: body.importance as number,
    });
    jsonResponse(res, 200, { id, status: 'stored', resolved_bot_id: botId || null });
    return true;
  }

  if (url === '/api/v1/memory/retrieve' && method === 'POST') {
    const body = await parseJsonBody(req);
    const agentId = (body.agent_id as string) || (body.agentId as string) || '';
    const botId = (body.bot_id as string) || (body.botId as string) || '';

    let botIdsFilter: string[] | undefined;
    if (agentId) {
      const resolved = await resolveAgentToBotIds(agentId);
      botIdsFilter = resolved.length > 0 ? resolved : ['__none__']; // 空集用哨兵确保返回空
    } else if (botId) {
      botIdsFilter = [botId];
    }

    const results = await mgr.retrieve({
      query: body.query as string,
      userId,
      layers: (body.layers as number[] | undefined)?.map((l) => l as MemoryLayer),
      limit: body.limit as number | undefined,
      // R38-C4 阶段 3.6: 传入 bot_id 过滤(manager 已支持 botIdFilter)
      botId: botId || undefined,
    });

    // agentId 模式下,post-filter by botIds(若 manager 未原生支持)
    const filtered = botIdsFilter && !botId
      ? results.filter((r: any) => botIdsFilter!.includes(String(r.memory.botId)))
      : results;

    jsonResponse(res, 200, {
      results: filtered.map((r) => ({ content: r.memory.content, similarity: r.similarity, layer: r.memory.layer, bot_id: r.memory.botId })),
      filter: { agentId: agentId || null, botId: botId || null, bot_count: botIdsFilter?.length ?? 0 },
    });
    return true;
  }

  // R48-W1 P1.2 memory-curator manual trigger — 复用上方 internal-key 校验
  if (url === '/api/v1/memory/curate' && method === 'POST') {
    const body = await parseJsonBody(req).catch(() => ({} as any));
    const dryRun = body.dryRun !== false; // 默认 dryRun,符合 W1 策略
    const limit = typeof body.limit === 'number' ? body.limit : 500;
    try {
      const stats = await runCurator({ dryRun, limit });
      jsonResponse(res, 200, { ok: true, dryRun, stats });
    } catch (err: any) {
      jsonResponse(res, 500, { ok: false, error: err.message });
    }
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
