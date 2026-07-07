import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../db/index.js', () => ({
  db: { execute: vi.fn() },
  pool: { query: vi.fn() },
}));

import { db } from '../../db/index.js';
import { executePipeline } from '../pipeline-engine.js';
import { findPipelinesForAgent, triggerPipelineForBot, invalidatePipelineCache } from '../pipeline-bot-trigger.js';
import { setPipelineWsHandle } from '../../api/pipeline-events.js';

beforeEach(() => {
  vi.clearAllMocks();
  invalidatePipelineCache();
});

function makeRow(overrides: Partial<{ id: string; name: string; nodes: unknown; edges: unknown; timeout_ms: number | null; retry_policy: unknown }> = {}): Record<string, unknown> {
  return {
    id: overrides.id ?? 'p-1',
    name: overrides.name ?? 'Test Pipeline',
    nodes: overrides.nodes ?? [
      { id: 'n1', label: 'A', agentTemplateId: 'a-1' },
    ],
    edges: overrides.edges ?? [],
    timeout_ms: overrides.timeout_ms ?? null,
    retry_policy: overrides.retry_policy ?? null,
    ...Object.fromEntries(Object.entries(overrides).filter(([k]) => !['id','name','nodes','edges','timeout_ms','retry_policy'].includes(k))),
  };
}

describe('pipeline-bot-trigger › findPipelinesForAgent', () => {
  it('空 agentTemplateId → 返 [] 不查 DB', async () => {
    const out = await findPipelinesForAgent('');
    expect(out).toEqual([]);
    expect(db.execute).not.toHaveBeenCalled();
  });

  it('DB 返 1 个含 agent 的 pipeline → 缓存 + 返', async () => {
    (db.execute as any).mockResolvedValue([makeRow({ id: 'p-1', name: 'P1' })]);
    const out1 = await findPipelinesForAgent('a-1');
    expect(out1).toHaveLength(1);
    expect(out1[0]!.id).toBe('p-1');
    expect(out1[0]!.name).toBe('P1');
    expect(db.execute).toHaveBeenCalledTimes(1);
    // Second call uses cache
    const out2 = await findPipelinesForAgent('a-1');
    expect(out2).toEqual(out1);
    expect(db.execute).toHaveBeenCalledTimes(1);
  });

  it('DB 返多 pipeline → 全返(按 name 排序已由 SQL ORDER BY 处理)', async () => {
    (db.execute as any).mockResolvedValue([
      makeRow({ id: 'p-2', name: 'B' }),
      makeRow({ id: 'p-1', name: 'A' }),
    ]);
    const out = await findPipelinesForAgent('a-1');
    expect(out).toHaveLength(2);
  });

  it('DB 返 0 → 返 [] + 缓存 []', async () => {
    (db.execute as any).mockResolvedValue([]);
    const out = await findPipelinesForAgent('a-1');
    expect(out).toEqual([]);
    const out2 = await findPipelinesForAgent('a-1');
    expect(out2).toEqual([]);
    expect(db.execute).toHaveBeenCalledTimes(1);
  });

  it('invalidatePipelineCache() → 下一查重打 DB', async () => {
    (db.execute as any).mockResolvedValueOnce([makeRow()]);
    await findPipelinesForAgent('a-1');
    expect(db.execute).toHaveBeenCalledTimes(1);
    invalidatePipelineCache('a-1');
    (db.execute as any).mockResolvedValueOnce([]);
    await findPipelinesForAgent('a-1');
    expect(db.execute).toHaveBeenCalledTimes(2);
  });
});

describe('pipeline-bot-trigger › triggerPipelineForBot', () => {
  it('无匹配 pipeline → 返 null', async () => {
    (db.execute as any).mockResolvedValue([]);
    const out = await triggerPipelineForBot('a-1', 'hello', 'run-1');
    expect(out).toBeNull();
  });

  it('pipeline 跑成功 → 返最后节点 output.text + runId', async () => {
    (db.execute as any).mockResolvedValue([
      makeRow({
        id: 'p-1',
        nodes: [{ id: 'n1', label: 'A', agentTemplateId: 'a-1' }],
      }),
    ]);
    // Mock executePipeline by mocking the module
    const { executePipeline: realExec } = await import('../pipeline-engine.js');
    const execSpy = vi.spyOn(await import('../pipeline-engine.js'), 'executePipeline');
    execSpy.mockResolvedValue({
      runId: 'run-1',
      status: 'completed',
      nodeStates: {
        n1: {
          status: 'success',
          output: { text: 'Hello from pipeline', model: 'm', provider: 'p' },
          tokensUsed: 10,
        },
      },
      result: { text: 'Hello from pipeline' },
      durationMs: 100,
    });
    const out = await triggerPipelineForBot('a-1', 'hello', 'run-1');
    expect(out).not.toBeNull();
    expect(out!.output).toBe('Hello from pipeline');
    expect(out!.runId).toBe('run-1');
    expect(execSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'p-1' }),
      'run-1',
      expect.objectContaining({ triggeredBy: 'bot', initialInput: { message: 'hello' } }),
      expect.any(Function),
      false,
    );
  });

  it('pipeline 跑 failed → 返 null', async () => {
    (db.execute as any).mockResolvedValue([makeRow()]);
    const execSpy = vi.spyOn(await import('../pipeline-engine.js'), 'executePipeline');
    execSpy.mockResolvedValue({
      runId: 'run-1',
      status: 'failed',
      nodeStates: { n1: { status: 'failed', error: 'x' } },
      error: 'failed',
      durationMs: 0,
    });
    const out = await triggerPipelineForBot('a-1', 'hi', 'run-1');
    expect(out).toBeNull();
  });

  it('executePipeline 抛错 → 返 null(不传播)', async () => {
    (db.execute as any).mockResolvedValue([makeRow()]);
    const execSpy = vi.spyOn(await import('../pipeline-engine.js'), 'executePipeline');
    execSpy.mockRejectedValue(new Error('boom'));
    const out = await triggerPipelineForBot('a-1', 'hi', 'run-1');
    expect(out).toBeNull();
  });

  it('Level4 多租户: 第 4 参 tenantId 透传到 executePipeline 的 RunTrigger', async () => {
    (db.execute as any).mockResolvedValue([makeRow({ id: 'p-tenant' })]);
    const execSpy = vi.spyOn(await import('../pipeline-engine.js'), 'executePipeline');
    execSpy.mockResolvedValue({
      runId: 'run-tenant',
      status: 'completed',
      nodeStates: { n1: { status: 'success', output: { text: 'ok' }, tokensUsed: 1 } },
      result: { text: 'ok' },
      durationMs: 10,
    });
    await triggerPipelineForBot('a-1', 'hi', 'run-tenant', 'tenant-abc');
    expect(execSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'p-tenant' }),
      'run-tenant',
      expect.objectContaining({
        triggeredBy: 'bot',
        initialInput: { message: 'hi' },
        tenantId: 'tenant-abc',
      }),
      expect.any(Function),
      false,
    );
  });

  it('Level4 多租户: 不传 tenantId → RunTrigger.tenantId 为 undefined(executePipeline fallback system)', async () => {
    (db.execute as any).mockResolvedValue([makeRow()]);
    const execSpy = vi.spyOn(await import('../pipeline-engine.js'), 'executePipeline');
    execSpy.mockResolvedValue({
      runId: 'r',
      status: 'completed',
      nodeStates: { n1: { status: 'success', output: { text: 'ok' }, tokensUsed: 1 } },
      result: { text: 'ok' },
      durationMs: 1,
    });
    await triggerPipelineForBot('a-1', 'hi', 'r');
    expect(execSpy).toHaveBeenCalledWith(
      expect.anything(),
      'r',
      expect.objectContaining({ tenantId: undefined }),
      expect.any(Function),
      false,
    );
  });
});

describe('pipeline-bot-trigger › cache diagnostics (Phase 4 Level 3 Fix 3)', () => {
  it('getCacheSize 返 0 初始 / 1 after first lookup', async () => {
    const { findPipelinesForAgent, getCacheSize, invalidatePipelineCache } = await import('../pipeline-bot-trigger.js');
    invalidatePipelineCache();
    expect(getCacheSize()).toBe(0);
    (db.execute as any).mockResolvedValue([makeRow()]);
    await findPipelinesForAgent('a-diag');
    expect(getCacheSize()).toBe(1);
    await findPipelinesForAgent('a-diag-2');
    expect(getCacheSize()).toBe(2);
  });
});

describe('pipeline-bot-trigger › L10: bot-triggered WS progress broadcast', () => {
  let broadcastAll: ReturnType<typeof vi.fn>;
  let clientCount: ReturnType<typeof vi.fn>;
  let broadcastEvents: Array<Record<string, unknown>>;

  beforeEach(() => {
    broadcastEvents = [];
    broadcastAll = vi.fn((msg: Record<string, unknown>) => { broadcastEvents.push(msg); });
    clientCount = vi.fn().mockReturnValue(1);
    setPipelineWsHandle({
      broadcastBotList: vi.fn(),
      subscriptions: {} as never,
      broadcastAll: broadcastAll as never,
      clientCount: clientCount as never,
    });
  });

  afterEach(() => {
    setPipelineWsHandle(undefined);
  });

  it('传 broadcast 上下文 → 每个 onNodeUpdate 都 broadcast pipeline_progress,bobot/chat/triggeredBy 字段带上', async () => {
    (db.execute as any).mockResolvedValue([
      makeRow({
        id: 'p-2',
        nodes: [
          { id: 'n1', label: 'A', agentTemplateId: 'a-1' },
          { id: 'n2', label: 'B', agentTemplateId: 'a-1' },
        ],
      }),
    ]);
    const execSpy = vi.spyOn(await import('../pipeline-engine.js'), 'executePipeline');
    execSpy.mockImplementation(async (_pipeline, _runId, _trigger, onNodeUpdate) => {
      // 模拟引擎依次触发 n1 → n2
      await onNodeUpdate!('n1', { status: 'success' } as any);
      await onNodeUpdate!('n2', { status: 'success' } as any);
      return {
        runId: 'run-1',
        status: 'completed' as const,
        nodeStates: {
          n1: { status: 'success', output: { text: 'final', model: 'm', provider: 'p' }, tokensUsed: 5 },
          n2: { status: 'success', output: { text: 'final', model: 'm', provider: 'p' }, tokensUsed: 5 },
        },
        result: { text: 'final' },
        durationMs: 10,
      };
    });

    const out = await triggerPipelineForBot(
      'a-1', 'hello', 'run-1', undefined, 'first',
      { botId: 'feishu-main', chatId: 'oc_chat_123' },
    );

    expect(out).not.toBeNull();
    // 2 per-node broadcasts + 1 terminal = 3
    expect(broadcastAll).toHaveBeenCalledTimes(3);

    // 第一个事件:n1 刚完成 → completedNodes=1/2=50%
    const ev1 = broadcastEvents[0] as Record<string, unknown>;
    expect(ev1.type).toBe('pipeline_progress');
    expect(ev1.runId).toBe('run-1');
    expect(ev1.pipelineId).toBe('p-2');
    expect(ev1.status).toBe('running');
    expect(ev1.currentNodeId).toBe('n1');
    expect(ev1.completedNodes).toBe(1);
    expect(ev1.totalNodes).toBe(2);
    expect(ev1.botId).toBe('feishu-main');
    expect(ev1.chatId).toBe('oc_chat_123');
    expect(ev1.triggeredBy).toBe('bot');

    // 第二个事件:n2 完成 → 2/2=100%
    const ev2 = broadcastEvents[1] as Record<string, unknown>;
    expect(ev2.currentNodeId).toBe('n2');
    expect(ev2.completedNodes).toBe(2);
    expect(ev2.progress).toBe(100);

    // 终态事件:status=completed, currentNodeId=null
    const ev3 = broadcastEvents[2] as Record<string, unknown>;
    expect(ev3.status).toBe('completed');
    expect(ev3.currentNodeId).toBeNull();
    expect(ev3.botId).toBe('feishu-main');
    expect(ev3.chatId).toBe('oc_chat_123');
    expect(ev3.triggeredBy).toBe('bot');
  });

  it('不传 broadcast 上下文 → onNodeUpdate 不 broadcast', async () => {
    (db.execute as any).mockResolvedValue([makeRow()]);
    const execSpy = vi.spyOn(await import('../pipeline-engine.js'), 'executePipeline');
    execSpy.mockImplementation(async (_pipeline, _runId, _trigger, onNodeUpdate) => {
      await onNodeUpdate!('n1', { status: 'success' } as any);
      return {
        runId: 'run-1',
        status: 'completed' as const,
        nodeStates: { n1: { status: 'success', output: { text: 'ok', model: 'm', provider: 'p' }, tokensUsed: 1 } },
        result: { text: 'ok' },
        durationMs: 1,
      };
    });
    const out = await triggerPipelineForBot('a-1', 'hi', 'run-1'); // 5 参,默认 'first',不传 broadcast
    expect(out).not.toBeNull();
    expect(broadcastAll).not.toHaveBeenCalled();
  });

  it('broadcast 部分字段为空对象 → 事件中 botId/chatId 都 undefined', async () => {
    (db.execute as any).mockResolvedValue([makeRow()]);
    const execSpy = vi.spyOn(await import('../pipeline-engine.js'), 'executePipeline');
    execSpy.mockImplementation(async (_pipeline, _runId, _trigger, onNodeUpdate) => {
      await onNodeUpdate!('n1', { status: 'success' } as any);
      return {
        runId: 'run-1',
        status: 'completed' as const,
        nodeStates: { n1: { status: 'success', output: { text: 'ok', model: 'm', provider: 'p' }, tokensUsed: 1 } },
        result: { text: 'ok' },
        durationMs: 1,
      };
    });
    await triggerPipelineForBot('a-1', 'hi', 'run-1', undefined, 'first', {});
    expect(broadcastEvents.length).toBeGreaterThanOrEqual(2);
    const ev = broadcastEvents[0] as Record<string, unknown>;
    expect(ev.botId).toBeUndefined();
    expect(ev.chatId).toBeUndefined();
    expect(ev.triggeredBy).toBe('bot');
  });

  it('run failed → 终态事件 broadcast status=failed,不再继续下游', async () => {
    (db.execute as any).mockResolvedValue([makeRow()]);
    const execSpy = vi.spyOn(await import('../pipeline-engine.js'), 'executePipeline');
    execSpy.mockResolvedValue({
      runId: 'run-1',
      status: 'failed',
      nodeStates: { n1: { status: 'failed', error: 'boom' } },
      error: 'boom',
      durationMs: 5,
    });
    const out = await triggerPipelineForBot(
      'a-1', 'hi', 'run-1', undefined, 'first',
      { botId: 'tg-bot', chatId: 'chat-99' },
    );
    expect(out).toBeNull();
    // 1 个终态事件(broadcastAll 是在 onNodeUpdate 之外)
    expect(broadcastAll).toHaveBeenCalledTimes(1);
    const ev = broadcastEvents[0] as Record<string, unknown>;
    expect(ev.status).toBe('failed');
    expect(ev.triggeredBy).toBe('bot');
    expect(ev.botId).toBe('tg-bot');
    expect(ev.chatId).toBe('chat-99');
  });

  it('executePipeline 抛错 → broadcast status=failed,不抛', async () => {
    (db.execute as any).mockResolvedValue([makeRow()]);
    const execSpy = vi.spyOn(await import('../pipeline-engine.js'), 'executePipeline');
    execSpy.mockImplementation(async () => { throw new Error('synthetic'); });
    const out = await triggerPipelineForBot(
      'a-1', 'hi', 'run-1', undefined, 'first',
      { botId: 'b1', chatId: 'c1' },
    );
    expect(out).toBeNull();
    expect(broadcastAll).toHaveBeenCalledTimes(1);
    const ev = broadcastEvents[0] as Record<string, unknown>;
    expect(ev.status).toBe('failed');
  });
});
