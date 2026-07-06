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
import { requireBearer, requireScopes, requireAnyScope } from '../oauth-middleware.js';
import { buildRagContext, type RagResult } from '../../services/rag-service.js';
import { recordKnowledgeUsage } from '../../services/usage-tracker.js';
import { callLlm, LlmCallError, type LlmCallResult } from '../../services/llm-client.js';

async function runAgent(req: http.IncomingMessage, res: http.ServerResponse, agentId: string) {
  const ctx = await requireBearer(req, res);
  if (!ctx) return;
  if (!requireAnyScope(ctx, ['agent:edit', 'agent:admin'])) {
    jsonResponse(res, 403, { error: 'insufficient_scope', required: 'agent:edit OR agent:admin' }); return;
  }

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
    // 记录 knowledge 使用 (每次 RAG retrieve +1,每个 KB 各记一次)
    for (const kbId of rag.usedKbIds) {
      recordKnowledgeUsage(ctx.tenantId, kbId, 1);
    }
  }

  // 2. 真实 LLM 调用 (Plan E)
  let llmResult: LlmCallResult | null = null;
  let llmError: string | null = null;
  // mode: 'real' (默认) | 'mock' (开发/测试, 跳过真 LLM)
  const llmMode = (body.mode === 'mock') ? 'mock' : 'real';

  if (llmMode === 'mock') {
    // Mock 模式: 不真调 LLM, 返 echo + 假 usage
    llmResult = {
      text: `[MOCK] response for: ${query}`,
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      model: 'mock',
      provider: 'mock',
      durationMs: 0,
    };
  } else {
    // Real 模式: 调真 LLM
    try {
      llmResult = await callLlm({
        system: rag?.prompt,
        messages: [{ role: 'user', content: String(query) }],
        maxTokens: Number(body.maxTokens) || 1024,
      });
    } catch (err) {
      if (err instanceof LlmCallError) {
        llmError = err.message;
        jsonResponse(res, err.statusCode, {
          error: err.statusCode === 503 ? 'llm_provider_unavailable' : 'llm_call_failed',
          message: err.message,
          provider: err.provider,
        });
        return;
      }
      jsonResponse(res, 500, { error: 'llm_call_failed', message: (err as Error).message });
      return;
    }
  }

  // 3. 写 usage_reports (knowledge 维度, 异步 + token 维度)
  if (rag) {
    for (const kbId of rag.usedKbIds) {
      recordKnowledgeUsage(ctx.tenantId, kbId, 1);
    }
  }
  if (llmResult && llmResult.usage.totalTokens > 0) {
    recordTokenUsage(ctx.tenantId, 'agent:' + agentId, llmResult.usage.totalTokens);
  }

  jsonResponse(res, 200, {
    success: true,
    data: {
      agentId,
      query,
      mode: llmMode,
      response: llmResult?.text || '',
      rag: rag ? {
        usedKbIds: rag.usedKbIds,
        retrievedChunks: rag.retrievedChunks.length,
        kbBreakdown: rag.kbBreakdown,
        promptLength: rag.prompt.length,
      } : null,
      llm: llmResult ? {
        model: llmResult.model,
        provider: llmResult.provider,
        durationMs: llmResult.durationMs,
        usage: llmResult.usage,
      } : null,
      llmError,
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
