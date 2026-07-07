import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../db/index.js', () => ({
  db: { execute: vi.fn() },
  pool: { query: vi.fn() },
}));

import { db } from '../../db/index.js';
import { executePipeline } from '../pipeline-engine.js';
import { findPipelinesForAgent, triggerPipelineForBot, invalidatePipelineCache } from '../pipeline-bot-trigger.js';

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