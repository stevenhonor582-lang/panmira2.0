import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../db/index.js', () => ({
  db: {
    select: () => ({ from: () => ({ where: async () => [] }) }),
  },
}));
vi.mock('../hybrid-search.js', () => ({
  hybridSearch: vi.fn(),
}));

import { executeTool, TOOL_DEFINITIONS } from '../tool-executor.ts';
import { hybridSearch } from '../hybrid-search.js';

describe('tool-executor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('TOOL_DEFINITIONS 含 knowledge_search', () => {
    expect(TOOL_DEFINITIONS.length).toBeGreaterThan(0);
    expect(TOOL_DEFINITIONS[0]!.name).toBe('knowledge_search');
  });

  it('executeKnowledgeSearch 无 query 返错误', async () => {
    const r = await executeTool('knowledge_search', {}, { agentId: 'a-1', tenantId: 't-1' });
    expect(r.error).toBe('query required');
  });

  it('executeKnowledgeSearch 无 KB refs 返错误', async () => {
    const r = await executeTool('knowledge_search', { query: 'test' }, { agentId: 'a-1', tenantId: 't-1' });
    expect(r.error).toContain('no KBs bound');
  });

  it('executeKnowledgeSearch 有 KB + 命中 chunks', async () => {
    // Mock db.select to return refs
    const { db } = await import('../../db/index.js');
    (db.select as any) = () => ({
      from: () => ({ where: async () => [{ id: 'ref-1', agentId: 'a-1', kbId: 'kb-1' }] }),
    });
    (hybridSearch as any).mockResolvedValue([
      { chunkId: 'c-1', documentId: 'd-1', content: 'RAG content', score: 0.9 },
    ]);
    const r = await executeTool('knowledge_search', { query: 'rag', topK: 5 }, { agentId: 'a-1', tenantId: 't-1' });
    expect(r.error).toBeUndefined();
    expect(r.output).toHaveLength(1);
    expect((r.output as any[])[0].chunkId).toBe('c-1');
  });

  it('未知 tool 返错误', async () => {
    const r = await executeTool('unknown_tool', {}, { agentId: 'a-1', tenantId: 't-1' });
    expect(r.error).toContain('unknown tool');
  });

  it('topK 限制 1-10', async () => {
    const { db } = await import('../../db/index.js');
    (db.select as any) = () => ({ from: () => ({ where: async () => [{ kbId: 'kb-1' }] }) });
    (hybridSearch as any).mockResolvedValue([]);
    // topK=100 → 应被 clamp 到 10
    await executeTool('knowledge_search', { query: 'q', topK: 100 }, { agentId: 'a', tenantId: 't' });
    const lastCall = (hybridSearch as any).mock.calls[0][0];
    expect(lastCall.topK).toBe(10);
  });
});
