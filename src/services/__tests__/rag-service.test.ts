import { describe, it, expect, vi, beforeEach } from 'vitest';

// 提前 mock db 和 hybridSearch
vi.mock('../../db/index.js', () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock('../hybrid-search.js', () => ({
  hybridSearch: vi.fn(),
}));

import { buildRagContext } from '../rag-service.ts';
import { db } from '../../db/index.js';
import { hybridSearch } from '../hybrid-search.js';

describe('buildRagContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 构造一个可 thenable 的 query builder,支持 where() 和直接 await
  function makeChainable(result: any) {
    const thenable: any = {
      where: vi.fn(() => Promise.resolve(result)),
      then: (onFulfilled: any) => Promise.resolve(result).then(onFulfilled),
    };
    return thenable;
  }

  it('agent 无 KB refs → 空 context + 通用 prompt', async () => {
    // 第一次: select(agentKnowledgeRefs).where → []
    // 第二次: select(knowledgeBases).from → [] (不会调用,因为 refs 为空直接返回)
    (db.select as any).mockReturnValue({
      from: () => makeChainable([]),
    });

    const result = await buildRagContext({
      agentId: 'agent-1',
      userQuery: 'What is RAG?',
      userId: 'user-1',
      tenantId: 'tenant-1',
    });

    expect(result.usedKbIds).toEqual([]);
    expect(result.retrievedChunks).toEqual([]);
    expect(result.prompt).toContain('What is RAG?');
    expect(result.prompt).toContain('No relevant knowledge base context');
  });

  it('agent 有 KB refs 但 KB 不可见 → 空 context', async () => {
    // 第一次 select(agentKnowledgeRefs).where → 有 1 个 ref
    // 第二次 select(knowledgeBases) → [] (空)
    let callCount = 0;
    (db.select as any).mockImplementation(() => ({
      from: () => {
        callCount++;
        if (callCount === 1) return makeChainable([{ id: 'ref-1', agentId: 'agent-1', kbId: 'kb-1' }]);
        return makeChainable([]);  // knowledgeBases empty
      },
    }));

    const result = await buildRagContext({
      agentId: 'agent-1',
      userQuery: 'test',
      userId: 'user-1',
      tenantId: 'tenant-1',
    });

    expect(result.usedKbIds).toEqual([]);
    expect(result.retrievedChunks).toEqual([]);
  });

  it('KB 有命中 → 拼装 prompt 包含所有 chunks', async () => {
    let callCount = 0;
    (db.select as any).mockImplementation(() => ({
      from: () => {
        callCount++;
        if (callCount === 1) return makeChainable([{ id: 'ref-1', agentId: 'agent-1', kbId: 'kb-1' }]);
        return makeChainable([{ id: 'kb-1', tenantId: 'tenant-1', name: 'Test KB' }]);
      },
    }));
    (hybridSearch as any).mockResolvedValue([
      { chunkId: 'c1', documentId: 'kb-1::doc::1', content: 'RAG is a technique.', score: 0.95 },
      { chunkId: 'c2', documentId: 'kb-1::doc::1', content: 'It uses vector search.', score: 0.85 },
    ]);

    const result = await buildRagContext({
      agentId: 'agent-1',
      userQuery: 'What is RAG?',
      userId: 'user-1',
      tenantId: 'tenant-1',
    });

    expect(result.usedKbIds).toEqual(['kb-1']);
    expect(result.retrievedChunks.length).toBe(2);
    expect(result.prompt).toContain('RAG is a technique.');
    expect(result.prompt).toContain('It uses vector search.');
    expect(result.prompt).toContain('[1]');
    expect(result.prompt).toContain('[2]');
    expect(result.prompt).toContain('What is RAG?');
  });

  it('minScore 过滤低分 chunk', async () => {
    let callCount = 0;
    (db.select as any).mockImplementation(() => ({
      from: () => {
        callCount++;
        if (callCount === 1) return makeChainable([{ id: 'ref-1', agentId: 'agent-1', kbId: 'kb-1' }]);
        return makeChainable([{ id: 'kb-1', tenantId: 'tenant-1' }]);
      },
    }));
    (hybridSearch as any).mockResolvedValue([
      { chunkId: 'c1', documentId: 'kb-1::d1', content: 'high', score: 0.95 },
      { chunkId: 'c2', documentId: 'kb-1::d1', content: 'low', score: 0.3 },
    ]);

    const result = await buildRagContext({
      agentId: 'agent-1',
      userQuery: 'q',
      userId: 'user-1',
      tenantId: 'tenant-1',
      minScore: 0.5,
    });

    expect(result.retrievedChunks.length).toBe(1);
    expect(result.retrievedChunks[0]!.chunkId).toBe('c1');
  });

  it('pipeline context: userId=null + tenantId=null 不应抛 uuid 错误', async () => {
    // 模拟 pipeline 触发场景:pipeline-engine.ts:234 把 userId='pipeline:'+ctx.runId 改成 null
    // 修复前: 'pipeline:xxx' 被 buildVisibilityWhere cast 成 uuid 报错
    // 修复后: null → 跳过 private + tenant 过滤,正常返回
    let callCount = 0;
    (db.select as any).mockImplementation(() => ({
      from: () => {
        callCount++;
        if (callCount === 1) return makeChainable([{ id: 'ref-1', agentId: 'agent-1', kbId: 'kb-1' }]);
        return makeChainable([{ id: 'kb-1', tenantId: null }]);
      },
    }));
    (hybridSearch as any).mockResolvedValue([
      { chunkId: 'c1', documentId: 'kb-1::d1', content: 'chunk content', score: 0.9 },
    ]);

    const result = await buildRagContext({
      agentId: 'agent-1',
      userQuery: 'pipeline question',
      userId: null,         // ← pipeline 没有真实 user
      tenantId: null,       // ← cron 没有 tenantId
    });

    expect(result.usedKbIds).toEqual(['kb-1']);
    expect(result.retrievedChunks.length).toBe(1);
    expect(hybridSearch).toHaveBeenCalledWith(expect.objectContaining({
      visibilityFilter: { userId: null, tenantId: null },
    }));
  });
});
