/**
 * Plan B-2 Agent Run 端点 (with RAG):
 *   POST /api/v2/agents/:id/run   (agent:edit, body: { query, options? })
 *
 * 流程:
 *   1. 验证 agent 存在
 *   2. 读 agent 的 KB refs
 *   3. 若有 refs → buildRagContext
 *   4. 注入 prompt 进 LLM 调用 (本期 stub, 真实 LLM 留后续接入)
 *   5. 写 usage_reports (knowledge 维度 +1)
 */
import type http from 'node:http';
import { eq, and } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { agents, agentKnowledgeRefs } from '../../db/schema.js';
import { jsonResponse, parseJsonBody } from './helpers.js';
import { requireBearer, requireScopes } from '../oauth-middleware.js';
import { buildRagContext, type RagResult } from '../../services/rag-service.js';

async function runAgent(req: http.IncomingMessage, res: http.ServerResponse, agentId: string) {
  const ctx = await requireBearer(req, res);
  if (!ctx) return;
  const check = requireScopes(ctx, ['agent:edit', 'agent:admin']);
  if (!check.ok) { jsonResponse(res, 403, { error: 'insufficient_scope', missing: check.missing }); return; }

  const [agent] = await db.select().from(agents).where(eq(agents.id, agentId)).limit(1);
  if (!agent) { jsonResponse(res, 404, { error: 'agent not found' }); return; }

  const body = (await parseJsonBody(req)) as Record<string, unknown>;
  const { query, topK, mode, minScore } = body;
  if (!query || typeof query !== 'string') { jsonResponse(res, 400, { error: 'query required' }); return; }

  // 1. 检查 agent 是否有 KB refs
  const refs = await db.select().from(agentKnowledgeRefs).where(eq(agentKnowledgeRefs.agentId, agentId));
  let rag: RagResult | null = null;
  if (refs.length > 0) {
    rag = await buildRagContext({
      agentId,
      userQuery: String(query),
      userId: ctx.userId || '',
      tenantId: ctx.tenantId,
      topK: Number(topK) || 5,
      mode: (mode === 'vector' || mode === 'bm25' || mode === 'hybrid') ? mode : 'hybrid',
      minScore: Number(minScore) || 0,
    });
  }

  // 2. 真实 LLM 调用留作集成 (本期 stub: 返回 RAG 准备结果)
  // 未来: 把 rag.prompt 注入 LLM context, 调 claude-agent-sdk
  const llmContext = rag ? { system: rag.prompt, usedKbs: rag.usedKbIds } : null;

  // 3. 写 usage_reports (knowledge 维度, 异步 fire-and-forget)
  // 简化: 不实际写,仅在响应里返回调用次数
  const usage = { knowledgeCalls: rag ? 1 : 0, retrievedChunks: rag?.retrievedChunks.length || 0 };

  jsonResponse(res, 200, {
    success: true,
    data: {
      agentId,
      query,
      rag: rag ? {
        usedKbIds: rag.usedKbIds,
        retrievedChunks: rag.retrievedChunks.length,
        kbBreakdown: rag.kbBreakdown,
        promptLength: rag.prompt.length,
      } : null,
      llmContext,   // 真实 LLM 调用时用这个
      usage,
      note: 'RAG 上下文已准备, 真实 LLM 调用留后续接入 (claude-agent-sdk 集成)',
    },
  });
}

export async function handleAgentRunRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  method: string,
  url: string,
): Promise<boolean> {
  // /api/v2/agents/:id/run
  const runMatch = url.match(/^\/api\/v2\/agents\/([^/]+)\/run$/);
  if (runMatch && method === 'POST') {
    await runAgent(req, res, runMatch[1]!);
    return true;
  }
  return false;
}
