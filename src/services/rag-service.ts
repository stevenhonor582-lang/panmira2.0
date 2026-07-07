/**
 * Plan B-2 RAG 服务
 * 读取 agent 绑定的 KB refs → 混合检索 → 拼装 prompt → 返回
 */
import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import * as schemaMod from '../db/schema.js';
import { hybridSearch, type SearchResult, type SearchMode } from './hybrid-search.js';

export interface RagOptions {
  agentId: string;
  userQuery: string;
  /** Pipeline context: pass null to skip private KB visibility filter. */
  userId: string | null;
  /** Pipeline context: pass null when no real tenant (e.g. cron without tenantId). */
  tenantId: string | null;
  topK?: number;       // 默认 5
  mode?: SearchMode;  // 默认 hybrid
  minScore?: number;   // 过滤低分 chunk, 默认 0
}

export interface RagResult {
  retrievedChunks: SearchResult[];
  prompt: string;
  usedKbIds: string[];
  /** 各 KB 单独命中的 chunk 数 (调试用) */
  kbBreakdown: Record<string, number>;
}

const DEFAULT_TOPK = 5;

/** 构造 RAG prompt */
function buildPrompt(chunks: SearchResult[], usedKbIds: string[], userQuery: string): string {
  if (chunks.length === 0) {
    return `You are an AI assistant. The user asked: "${userQuery}".\n\nNo relevant knowledge base context was found. Please answer based on general knowledge.`;
  }

  const contextLines = chunks.map((c, i) => {
    const meta = `chunk_id=${c.chunkId} doc_id=${c.documentId} score=${c.score.toFixed(3)}`;
    return `[${i + 1}] (${meta})\n${c.content}`;
  }).join('\n\n');

  return `You are an AI assistant with access to the following knowledge base context (from KBs: ${usedKbIds.join(', ')}).

## Context (retrieved chunks)

${contextLines}

## User Question

${userQuery}

Please answer based on the context above. If the context doesn't contain the answer, say so explicitly. Cite chunk numbers like [1], [2] when you reference them.`;
}

/** 主入口: 为 agent 构造 RAG context */
export async function buildRagContext(opts: RagOptions): Promise<RagResult> {
  const { agentKnowledgeRefs, knowledgeBases } = schemaMod;
  const topK = opts.topK || DEFAULT_TOPK;
  const mode = opts.mode || 'hybrid';
  const minScore = opts.minScore || 0;

  // 1. 读 agent 的 KB refs
  const refs = await db.select().from(agentKnowledgeRefs).where(eq(agentKnowledgeRefs.agentId, opts.agentId));
  if (refs.length === 0) {
    return {
      retrievedChunks: [],
      prompt: buildPrompt([], [], opts.userQuery),
      usedKbIds: [],
      kbBreakdown: {},
    };
  }

  // 2. 验证 KBs 存在且 visible
  const kbIds = refs.map(r => r.kbId);
  const kbs = await db.select().from(knowledgeBases);
  const visibleKbIds = kbs.filter(kb => kbIds.includes(kb.id)).map(kb => kb.id);

  if (visibleKbIds.length === 0) {
    return {
      retrievedChunks: [],
      prompt: buildPrompt([], [], opts.userQuery),
      usedKbIds: [],
      kbBreakdown: {},
    };
  }

  // 3. 混合检索
  let chunks = await hybridSearch({
    query: opts.userQuery,
    kbIds: visibleKbIds,
    topK,
    mode,
    visibilityFilter: {
      userId: opts.userId,
      tenantId: opts.tenantId,
    },
  });

  // 4. minScore 过滤
  if (minScore > 0) {
    chunks = chunks.filter(c => c.score >= minScore);
  }

  // 5. KB breakdown 统计
  const kbBreakdown: Record<string, number> = {};
  for (const c of chunks) {
    // 找 chunk 属于哪个 KB(简化:用 kb_id 从 doc 取,这里先按 documentId 统计)
    // TODO: 加 document.kb_id 字段后能精确统计
    for (const kbId of visibleKbIds) {
      if (c.documentId.includes(kbId)) {
        kbBreakdown[kbId] = (kbBreakdown[kbId] || 0) + 1;
        break;
      }
    }
  }

  return {
    retrievedChunks: chunks,
    prompt: buildPrompt(chunks, visibleKbIds, opts.userQuery),
    usedKbIds: visibleKbIds,
    kbBreakdown,
  };
}
