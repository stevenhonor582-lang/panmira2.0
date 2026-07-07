import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../db/index.js', () => ({
  db: { select: vi.fn() },
  pool: { query: vi.fn() },
}));
vi.mock('../llm-client.js', () => ({
  callLlm: vi.fn(),
  LlmCallError: class extends Error {
    constructor(message: string, public statusCode = 500, public provider?: string) {
      super(message); this.name = 'LlmCallError';
    }
  },
}));
vi.mock('../rag-service.js', () => ({
  buildRagContext: vi.fn(),
}));
vi.mock('../tool-executor.js', () => ({
  executeTool: vi.fn(),
  TOOL_DEFINITIONS: [],
}));
vi.mock('../usage-tracker.js', () => ({
  recordTokenUsage: vi.fn(),
  recordKnowledgeUsage: vi.fn(),
}));

import { executePipeline, stringifyInput } from '../pipeline-engine.js';
import { db } from '../../db/index.js';
import { callLlm } from '../llm-client.js';
import { buildRagContext } from '../rag-service.js';
import { executeTool } from '../tool-executor.js';

function makeDbSelectSequence(rowsByCall: unknown[][]) {
  let i = 0;
  const next = () => {
    const r = rowsByCall[i] ?? [];
    i++;
    return Promise.resolve(r);
  };
  (db.select as any).mockImplementation(() => ({
    from: () => ({
      where: () => ({
        limit: next,
        // some queries (e.g. agentKnowledgeRefs) end at .where()
        then: (resolve: any, reject: any) => next().then(resolve, reject),
      }),
    }),
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('pipeline-engine › useMockLlm (Task 2)', () => {
  it('mock 模式: 节点不调 LLM, output 含 [MOCK] 前缀', async () => {
    const result = await executePipeline(
      { id: 'p1', name: 't', nodes: [{ id: 'n1', label: 'A', agentTemplateId: 'a1' }], edges: [] },
      'run-1',
      { triggeredBy: 'user' as const, initialInput: { topic: 'AI' } },
      async () => {},
      true,
    );
    expect(result.status).toBe('completed');
    expect(result.nodeStates.n1.status).toBe('success');
    expect(JSON.stringify(result.nodeStates.n1.output)).toContain('[MOCK');
    expect(callLlm).not.toHaveBeenCalled();
    expect(db.select).not.toHaveBeenCalled();
  });
});

describe('pipeline-engine › real LLM no RAG no tools (Task 3)', () => {
  it('agent 不存在 → 节点 failed, error 含 agentTemplateId', async () => {
    makeDbSelectSequence([[]]);
    const result = await executePipeline(
      { id: 'p', name: 't', nodes: [{ id: 'n', label: 'A', agentTemplateId: 'missing' }], edges: [] },
      'r', { triggeredBy: 'user' as const }, async () => {}, false,
    );
    expect(result.status).toBe('failed');
    expect(result.nodeStates.n.status).toBe('failed');
    expect(result.nodeStates.n.error).toContain('missing');
  });

  it('成功调用: output.text = LLM text, tokensUsed = totalTokens, system 传 agent.systemPrompt', async () => {
    const fakeAgent = { id: 'a1', name: 'A', systemPrompt: 'You are helpful.', tools: [] };
    makeDbSelectSequence([[fakeAgent], []]);
    (callLlm as any).mockResolvedValue({
      text: 'Hello back', toolUses: [],
      stopReason: 'end_turn',
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      model: 'MiniMax-M3', provider: 'MiniMax', durationMs: 100,
    });
    const result = await executePipeline(
      { id: 'p', name: 't', nodes: [{ id: 'n', label: 'A', agentTemplateId: 'a1' }], edges: [] },
      'r', { triggeredBy: 'user' as const, initialInput: { topic: 'AI' } },
      async () => {}, false,
    );
    expect(result.status).toBe('completed');
    expect((result.nodeStates.n.output as any).text).toBe('Hello back');
    expect(result.nodeStates.n.tokensUsed).toBe(15);
    expect(callLlm).toHaveBeenCalledWith(expect.objectContaining({
      system: 'You are helpful.',
      messages: [{ role: 'user', content: expect.stringContaining('AI') }],
    }));
  });
});

describe('pipeline-engine › RAG (Task 4)', () => {
  it('agent 有 KB refs → buildRagContext 被调, system 拼接 RAG prompt', async () => {
    const fakeAgent = { id: 'aR', name: 'R', systemPrompt: 'Be brief.', tools: [] };
    const fakeRefs = [{ id: 'r1', agentId: 'aR', kbId: 'kb1' }];
    makeDbSelectSequence([[fakeAgent], fakeRefs]);
    (buildRagContext as any).mockResolvedValue({
      prompt: '[RAG-CONTEXT]\nDoc 1\nDoc 2',
      usedKbIds: ['kb1'],
      retrievedChunks: [{ id: 'c1' }, { id: 'c2' }],
      kbBreakdown: { kb1: 2 },
    });
    (callLlm as any).mockResolvedValue({
      text: 'OK', toolUses: [],
      usage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 },
      model: 'm', provider: 'p', durationMs: 50,
    });
    await executePipeline(
      { id: 'p', name: 't', nodes: [{ id: 'n', label: 'R', agentTemplateId: 'aR' }], edges: [] },
      'r', { triggeredBy: 'user' as const, initialInput: { q: '?' } },
      async () => {}, false,
    );
    expect(buildRagContext).toHaveBeenCalled();
    expect(callLlm).toHaveBeenCalledWith(expect.objectContaining({
      system: 'Be brief.\n\n[RAG-CONTEXT]\nDoc 1\nDoc 2',
    }));
  });

  it('agent 无 KB refs → buildRagContext 不调, system = agent.systemPrompt 原值', async () => {
    const fakeAgent = { id: 'aN', name: 'X', systemPrompt: 'No RAG here.', tools: [] };
    makeDbSelectSequence([[fakeAgent], []]);
    (callLlm as any).mockResolvedValue({
      text: 'ok', toolUses: [],
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      model: 'm', provider: 'p', durationMs: 0,
    });
    await executePipeline(
      { id: 'p', name: 't', nodes: [{ id: 'n', label: 'X', agentTemplateId: 'aN' }], edges: [] },
      'r', { triggeredBy: 'user' as const }, async () => {}, false,
    );
    expect(buildRagContext).not.toHaveBeenCalled();
    expect(callLlm).toHaveBeenCalledWith(expect.objectContaining({
      system: 'No RAG here.',
    }));
  });
});

describe('pipeline-engine › tool use 1-hop (Task 5)', () => {
  it('第一次 callLlm 返 tool_use → executeTool → 第二次 callLlm 收 tool_result, token 累加', async () => {
    const fakeAgent = { id: 'aT', name: 'T', systemPrompt: 's', tools: [{ name: 'kb_search', description: '', input_schema: { type: 'object', properties: {}, required: [] } }] };
    makeDbSelectSequence([[fakeAgent], []]);
    (callLlm as any)
      .mockResolvedValueOnce({
        text: '', toolUses: [{ id: 't1', name: 'kb_search', input: { q: 'X' } }],
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        model: 'm', provider: 'p', durationMs: 100,
      })
      .mockResolvedValueOnce({
        text: 'Final answer', toolUses: [],
        usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 },
        model: 'm', provider: 'p', durationMs: 100,
      });
    (executeTool as any).mockResolvedValue({ output: 'tool-result' });

    const result = await executePipeline(
      { id: 'p', name: 't', nodes: [{ id: 'n', label: 'T', agentTemplateId: 'aT' }], edges: [] },
      'r', { triggeredBy: 'user' as const }, async () => {}, false,
    );
    expect(executeTool).toHaveBeenCalledWith('kb_search', { q: 'X' }, expect.objectContaining({ agentId: 'aT' }));
    expect((result.nodeStates.n.output as any).text).toBe('Final answer');
    expect(result.nodeStates.n.tokensUsed).toBe(45);
    expect(callLlm).toHaveBeenCalledTimes(2);
  });
});

describe('pipeline-engine › inter-node flow + stringify (Task 6)', () => {
  it('节点 B 收到节点 A 的 output 序列化结果', async () => {
    let n = 0;
    (db.select as any).mockImplementation(() => ({
      from: () => ({
        where: () => ({
          limit: () => {
            n++;
            return Promise.resolve(n % 2 === 1
              ? [{ id: 'aA', name: 'A', systemPrompt: 'A', tools: [] }]
              : [{ id: 'aB', name: 'B', systemPrompt: 'B', tools: [] }]);
          },
        }),
      }),
    }));
    (callLlm as any)
      .mockResolvedValueOnce({
        text: 'A-said-hello', toolUses: [],
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        model: 'm', provider: 'p', durationMs: 1,
      })
      .mockResolvedValueOnce({
        text: 'B-said-back', toolUses: [],
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        model: 'm', provider: 'p', durationMs: 1,
      });
    const result = await executePipeline(
      {
        id: 'p', name: 't',
        nodes: [
          { id: 'n1', label: 'A', agentTemplateId: 'aA' },
          { id: 'n2', label: 'B', agentTemplateId: 'aB' },
        ],
        edges: [{ from: 'n1', to: 'n2' }],
      },
      'r', { triggeredBy: 'user' as const, initialInput: { topic: 'X' } },
      async () => {}, false,
    );
    expect(result.status).toBe('completed');
    const secondCall = (callLlm as any).mock.calls[1][0];
    expect(secondCall.messages[0].content).toContain('A-said-hello');
  });

  it('stringifyInput: null → ""', () => {
    expect(stringifyInput(null)).toBe('');
    expect(stringifyInput(undefined)).toBe('');
  });

  it('stringifyInput: object → JSON', () => {
    expect(stringifyInput({ a: 1 })).toContain('"a": 1');
  });

  it('stringifyInput: 超长 → 截断带 notice', () => {
    const big = { data: 'x'.repeat(9000) };
    const out = stringifyInput(big);
    expect(out.length).toBeLessThanOrEqual(8200);
    expect(out).toContain('truncated');
  });
});
