/**
 * Level 5 #C — Bot 触发多 pipeline 路由 (strategy: first / all / race)
 *
 * Scope lock:
 * - 只覆盖 triggerPipelineForBot 的 strategy 参数分支
 * - 不改 feishu-bot-starter.ts (仍走默认 'first')
 * - 不动 pipeline-engine.ts
 * - 不动 DB schema
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../db/index.js', () => ({
  db: { execute: vi.fn() },
  pool: { query: vi.fn() },
}));

import { db } from '../../db/index.js';
import { findPipelinesForAgent, triggerPipelineForBot, invalidatePipelineCache } from '../pipeline-bot-trigger.js';

beforeEach(() => {
  vi.clearAllMocks();
  invalidatePipelineCache();
  // Reset the executePipeline spy between tests so mocks don't leak.
  vi.restoreAllMocks();
});

function makeRow(
  overrides: Partial<{
    id: string;
    name: string;
    nodes: unknown;
    edges: unknown;
    timeout_ms: number | null;
    retry_policy: unknown;
  }> = {},
): Record<string, unknown> {
  return {
    id: overrides.id ?? 'p-1',
    name: overrides.name ?? 'Test Pipeline',
    nodes: overrides.nodes ?? [{ id: 'n1', label: 'A', agentTemplateId: 'a-1' }],
    edges: overrides.edges ?? [],
    timeout_ms: overrides.timeout_ms ?? null,
    retry_policy: overrides.retry_policy ?? null,
    ...Object.fromEntries(
      Object.entries(overrides).filter(
        ([k]) => !['id', 'name', 'nodes', 'edges', 'timeout_ms', 'retry_policy'].includes(k),
      ),
    ),
  };
}

function makeCompletedRun(runId: string, text: string) {
  return {
    runId,
    status: 'completed' as const,
    nodeStates: {
      n1: { status: 'success' as const, output: { text, model: 'm', provider: 'p' }, tokensUsed: 10 },
    },
    result: { text },
    durationMs: 100,
  };
}

function makeFailedRun(runId: string) {
  return {
    runId,
    status: 'failed' as const,
    nodeStates: { n1: { status: 'failed' as const, error: 'x' } },
    error: 'failed',
    durationMs: 0,
  };
}

describe('pipeline-bot-trigger › trigger_strategy="first" (default, backwards compat)', () => {
  it('0 pipeline 匹配 → 返 null (与现有行为一致)', async () => {
    (db.execute as any).mockResolvedValue([]);
    const out = await triggerPipelineForBot('a-1', 'hi', 'run-1');
    expect(out).toBeNull();
  });

  it('多 pipeline → 只跑 pipelines[0],其他忽略', async () => {
    (db.execute as any).mockResolvedValue([
      makeRow({ id: 'p-1', name: 'A' }),
      makeRow({ id: 'p-2', name: 'B' }),
      makeRow({ id: 'p-3', name: 'C' }),
    ]);
    const engineModule = await import('../pipeline-engine.js');
    const execSpy = vi.spyOn(engineModule, 'executePipeline');
    execSpy.mockResolvedValue(makeCompletedRun('run-1', 'from-p1'));

    const out = await triggerPipelineForBot('a-1', 'hi', 'run-1');
    expect(out).not.toBeNull();
    expect(out).toEqual({ output: 'from-p1', runId: 'run-1' });
    // Only pipelines[0] invoked; p-2 and p-3 must never be executed.
    expect(execSpy).toHaveBeenCalledTimes(1);
    expect(execSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'p-1' }),
      expect.anything(),
      expect.anything(),
      expect.any(Function),
      expect.any(Boolean),
    );
  });

  it('显式 strategy="first" 与省略参数等价', async () => {
    (db.execute as any).mockResolvedValue([
      makeRow({ id: 'p-x', name: 'X' }),
      makeRow({ id: 'p-y', name: 'Y' }),
    ]);
    const engineModule = await import('../pipeline-engine.js');
    const execSpy = vi.spyOn(engineModule, 'executePipeline');
    execSpy.mockResolvedValue(makeCompletedRun('run-x', 'x-out'));

    const out = await triggerPipelineForBot('a-1', 'hi', 'run-x', undefined, 'first');
    expect(out).toEqual({ output: 'x-out', runId: 'run-x' });
    expect(execSpy).toHaveBeenCalledTimes(1);
  });
});

describe('pipeline-bot-trigger › trigger_strategy="all"', () => {
  it('0 pipeline 匹配 → 返空数组 (便于 caller 统一迭代)', async () => {
    (db.execute as any).mockResolvedValue([]);
    const out = await triggerPipelineForBot('a-1', 'hi', 'run-1', undefined, 'all');
    expect(out).toEqual([]);
  });

  it('3 个 pipeline → Promise.all 全部并行触发,返 3 元素数组', async () => {
    (db.execute as any).mockResolvedValue([
      makeRow({ id: 'p-1', name: 'A' }),
      makeRow({ id: 'p-2', name: 'B' }),
      makeRow({ id: 'p-3', name: 'C' }),
    ]);
    const engineModule = await import('../pipeline-engine.js');
    const execSpy = vi.spyOn(engineModule, 'executePipeline');

    execSpy.mockImplementation(async (pipeline: any) => {
      const runId = `run-${pipeline.id}`;
      const promise = new Promise((resolve) => setTimeout(() => resolve(makeCompletedRun(runId, `out-${pipeline.id}`)), 5));
      return promise;
    });

    const start = Date.now();
    const out = await triggerPipelineForBot('a-1', 'hi', 'run-hint', undefined, 'all');
    const elapsed = Date.now() - start;

    expect(out).toHaveLength(3);
    expect(out).toEqual([
      { output: 'out-p-1', runId: 'run-p-1' },
      { output: 'out-p-2', runId: 'run-p-2' },
      { output: 'out-p-3', runId: 'run-p-3' },
    ]);
    expect(execSpy).toHaveBeenCalledTimes(3);
    const calledIds = execSpy.mock.calls.map((c) => (c[0] as any).id).sort();
    expect(calledIds).toEqual(['p-1', 'p-2', 'p-3']);
    // 并行断言:总耗时 < 串行 3 倍 (~15ms)。留 50ms 余量。
    expect(elapsed).toBeLessThan(50);
  });

  it('混合成功/失败 → 数组保留顺序,失败位置 null', async () => {
    (db.execute as any).mockResolvedValue([
      makeRow({ id: 'p-ok', name: 'OK' }),
      makeRow({ id: 'p-fail', name: 'FAIL' }),
      makeRow({ id: 'p-ok2', name: 'OK2' }),
    ]);
    const engineModule = await import('../pipeline-engine.js');
    const execSpy = vi.spyOn(engineModule, 'executePipeline');
    execSpy.mockImplementation(async (pipeline: any) => {
      if (pipeline.id === 'p-fail') return makeFailedRun('run-fail');
      return makeCompletedRun(`run-${pipeline.id}`, `out-${pipeline.id}`);
    });

    const out = await triggerPipelineForBot('a-1', 'hi', 'run-hint', undefined, 'all');
    expect(out).toEqual([
      { output: 'out-p-ok', runId: 'run-p-ok' },
      null,
      { output: 'out-p-ok2', runId: 'run-p-ok2' },
    ]);
  });

  it('1 个 pipeline 抛异常 → 数组中对应位置 null,不污染其他结果', async () => {
    (db.execute as any).mockResolvedValue([
      makeRow({ id: 'p-a' }),
      makeRow({ id: 'p-b' }),
    ]);
    const engineModule = await import('../pipeline-engine.js');
    const execSpy = vi.spyOn(engineModule, 'executePipeline');
    execSpy.mockImplementation(async (pipeline: any) => {
      if (pipeline.id === 'p-a') throw new Error('engine boom');
      return makeCompletedRun('run-b', 'b-out');
    });

    const out = await triggerPipelineForBot('a-1', 'hi', 'run-hint', undefined, 'all');
    expect(out).toEqual([null, { output: 'b-out', runId: 'run-b' }]);
  });

  it('all 模式下 tenantId 仍透传到 RunTrigger', async () => {
    (db.execute as any).mockResolvedValue([makeRow({ id: 'p-t' })]);
    const engineModule = await import('../pipeline-engine.js');
    const execSpy = vi.spyOn(engineModule, 'executePipeline');
    execSpy.mockResolvedValue(makeCompletedRun('run-t', 't-out'));

    await triggerPipelineForBot('a-1', 'hi', 'run-t', 'tenant-xyz', 'all');
    expect(execSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'p-t' }),
      'run-t',
      expect.objectContaining({
        triggeredBy: 'bot',
        initialInput: { message: 'hi' },
        tenantId: 'tenant-xyz',
      }),
      expect.any(Function),
      false,
    );
  });
});

describe('pipeline-bot-trigger › trigger_strategy="race"', () => {
  it('2 个并行 → 只返最先完成的 runId+output', async () => {
    (db.execute as any).mockResolvedValue([
      makeRow({ id: 'p-fast' }),
      makeRow({ id: 'p-slow' }),
    ]);
    const engineModule = await import('../pipeline-engine.js');
    const execSpy = vi.spyOn(engineModule, 'executePipeline');
    execSpy.mockImplementation(async (pipeline: any) => {
      const delay = pipeline.id === 'p-fast' ? 5 : 50;
      await new Promise((r) => setTimeout(r, delay));
      return makeCompletedRun(`run-${pipeline.id}`, `out-${pipeline.id}`);
    });

    const out = await triggerPipelineForBot('a-1', 'hi', 'run-hint', undefined, 'race');
    expect(out).toEqual({ output: 'out-p-fast', runId: 'run-p-fast' });
    expect(execSpy).toHaveBeenCalledTimes(2);
  });

  it('第一个完成但 status=failed → 拿到 null (race 语义 = 第一个 settled)', async () => {
    (db.execute as any).mockResolvedValue([
      makeRow({ id: 'p-bad' }),
      makeRow({ id: 'p-good' }),
    ]);
    const engineModule = await import('../pipeline-engine.js');
    const execSpy = vi.spyOn(engineModule, 'executePipeline');
    execSpy.mockImplementation(async (pipeline: any) => {
      const delay = pipeline.id === 'p-bad' ? 5 : 20;
      await new Promise((r) => setTimeout(r, delay));
      if (pipeline.id === 'p-bad') return makeFailedRun('run-bad');
      return makeCompletedRun('run-good', 'good-out');
    });

    const out = await triggerPipelineForBot('a-1', 'hi', 'run-hint', undefined, 'race');
    // runOnePipeline 失败时不抛错,而是返回 null -> Promise.any 视为 fulfilled。
    // race 拿到的是 p-bad 的 null (它先 settled)。
    expect(out).toBeNull();
    expect(execSpy).toHaveBeenCalledTimes(2);
  });

  it('所有 pipeline 都失败 → 返 null', async () => {
    (db.execute as any).mockResolvedValue([
      makeRow({ id: 'p-1' }),
      makeRow({ id: 'p-2' }),
    ]);
    const engineModule = await import('../pipeline-engine.js');
    const execSpy = vi.spyOn(engineModule, 'executePipeline');
    execSpy.mockImplementation(async (pipeline: any) => makeFailedRun(`run-${pipeline.id}`));

    const out = await triggerPipelineForBot('a-1', 'hi', 'run-hint', undefined, 'race');
    expect(out).toBeNull();
    expect(execSpy).toHaveBeenCalledTimes(2);
  });

  it('0 pipeline 匹配 → 返 null (与 first 行为一致)', async () => {
    (db.execute as any).mockResolvedValue([]);
    const out = await triggerPipelineForBot('a-1', 'hi', 'run-hint', undefined, 'race');
    expect(out).toBeNull();
  });
});

describe('pipeline-bot-trigger › strategy 默认值 + 兼容性 (Level 5 #C 收尾)', () => {
  it('不传 strategy → 默认 "first" 行为 (与 Phase 3 一致)', async () => {
    (db.execute as any).mockResolvedValue([
      makeRow({ id: 'p-default-1' }),
      makeRow({ id: 'p-default-2' }),
    ]);
    const engineModule = await import('../pipeline-engine.js');
    const execSpy = vi.spyOn(engineModule, 'executePipeline');
    execSpy.mockResolvedValue(makeCompletedRun('run-default', 'default-out'));

    const out = await triggerPipelineForBot('a-1', 'hi', 'run-default');
    expect(out).toEqual({ output: 'default-out', runId: 'run-default' });
    expect(execSpy).toHaveBeenCalledTimes(1);
  });

  it('缓存命中 (findPipelinesForAgent 已返多 pipeline) → strategy 仍生效', async () => {
    (db.execute as any).mockResolvedValue([
      makeRow({ id: 'p-cache-1', name: 'A' }),
      makeRow({ id: 'p-cache-2', name: 'B' }),
    ]);
    // 预热缓存
    const cached = await findPipelinesForAgent('a-cache');
    expect(cached).toHaveLength(2);

    const engineModule = await import('../pipeline-engine.js');
    const execSpy = vi.spyOn(engineModule, 'executePipeline');
    execSpy.mockImplementation(async (pipeline: any) =>
      makeCompletedRun(`run-${pipeline.id}`, `out-${pipeline.id}`),
    );

    const out = await triggerPipelineForBot('a-cache', 'hi', 'run-hint', undefined, 'all');
    expect(out).toHaveLength(2);
    expect(execSpy).toHaveBeenCalledTimes(2);
  });
});
