/**
 * Plan G Tool Executor
 * 工具注册中心: 给 LLM 调的工具集
 * - knowledge_search: 在 agent 绑的 KB 中搜索 (复用 hybrid-search)
 */
import { hybridSearch, type SearchResult } from './hybrid-search.js';
import { db } from '../db/index.js';
import { agentKnowledgeRefs } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
}

export interface ToolCall {
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResult {
  tool: string;
  input: Record<string, unknown>;
  output: unknown;
  error?: string;
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'knowledge_search',
    description: 'Search the agent\'s knowledge base for relevant information. Use this when you need specific facts from the knowledge base to answer the user\'s question.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query' },
        topK: { type: 'string', description: 'Number of results to return (default 3, max 10)' },
      },
      required: ['query'],
    },
  },
];

/** 调 knowledge_search 工具 */
export async function executeKnowledgeSearch(
  agentId: string,
  tenantId: string,
  input: Record<string, unknown>,
): Promise<ToolResult> {
  const query = String(input.query || '');
  const topK = Math.min(Math.max(Number(input.topK) || 3, 1), 10);
  if (!query) {
    return { tool: 'knowledge_search', input, output: null, error: 'query required' };
  }
  // 拿 agent 绑的 KB
  const refs = await db.select().from(agentKnowledgeRefs).where(eq(agentKnowledgeRefs.agentId, agentId));
  const kbIds = refs.map(r => r.kbId);
  if (kbIds.length === 0) {
    return { tool: 'knowledge_search', input, output: [], error: 'no KBs bound to agent' };
  }
  const chunks = await hybridSearch({
    query,
    kbIds,
    topK,
    mode: 'hybrid',
    visibilityFilter: { userId: '', tenantId },
  });
  const output = chunks.map((c: SearchResult) => ({
    chunkId: c.chunkId,
    content: c.content.slice(0, 500),
    score: c.score,
  }));
  return { tool: 'knowledge_search', input, output };
}

/** 工具分发: 拿 tool name + input, 返 result */
export async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  ctx: { agentId: string; tenantId: string },
): Promise<ToolResult> {
  if (toolName === 'knowledge_search') {
    return executeKnowledgeSearch(ctx.agentId, ctx.tenantId, toolInput);
  }
  return { tool: toolName, input: toolInput, output: null, error: `unknown tool: ${toolName}` };
}
