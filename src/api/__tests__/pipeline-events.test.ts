import { describe, it, expect, vi, beforeEach } from 'vitest';

import { broadcastPipelineProgress, setPipelineWsHandle } from '../pipeline-events.js';

describe('pipeline-events (L7 WS progress)', () => {
  let broadcastAll: ReturnType<typeof vi.fn>;
  let clientCount: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    broadcastAll = vi.fn();
    clientCount = vi.fn().mockReturnValue(1);
    setPipelineWsHandle({
      broadcastBotList: vi.fn(),
      subscriptions: {} as never,
      broadcastAll: broadcastAll as never,
      clientCount: clientCount as never,
    });
  });

  it('broadcasts pipeline_progress to all clients', () => {
    broadcastPipelineProgress({
      type: 'pipeline_progress',
      runId: 'r1',
      pipelineId: 'p1',
      status: 'running',
      currentNodeId: 'n2',
      completedNodes: 1,
      totalNodes: 3,
      progress: 33,
      ts: '2026-07-07T18:00:00Z',
    });

    expect(broadcastAll).toHaveBeenCalledOnce();
    const payload = broadcastAll.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.type).toBe('pipeline_progress');
    expect(payload.runId).toBe('r1');
    expect(payload.progress).toBe(33);
    expect(payload.currentNodeId).toBe('n2');
  });

  it('skips broadcast when no clients connected', () => {
    clientCount.mockReturnValue(0);
    broadcastPipelineProgress({
      type: 'pipeline_progress',
      runId: 'r1', pipelineId: 'p1',
      status: 'running', currentNodeId: null,
      completedNodes: 0, totalNodes: 1, progress: 0, ts: '2026-07-07T18:00:00Z',
    });
    expect(broadcastAll).not.toHaveBeenCalled();
  });

  it('does not throw when wsHandle is undefined', () => {
    setPipelineWsHandle(undefined);
    expect(() => broadcastPipelineProgress({
      type: 'pipeline_progress',
      runId: 'r1', pipelineId: 'p1',
      status: 'running', currentNodeId: null,
      completedNodes: 0, totalNodes: 1, progress: 0, ts: '2026-07-07T18:00:00Z',
    })).not.toThrow();
  });

  it('does not throw when broadcastAll itself throws', () => {
    broadcastAll.mockImplementation(() => { throw new Error('ws broken'); });
    // Should not throw — broadcast is best-effort
    expect(() => broadcastPipelineProgress({
      type: 'pipeline_progress',
      runId: 'r1', pipelineId: 'p1',
      status: 'running', currentNodeId: null,
      completedNodes: 0, totalNodes: 1, progress: 0, ts: '2026-07-07T18:00:00Z',
    })).not.toThrow();
  });
});

describe('pipeline-events (L10 bot schema)', () => {
  let broadcastAll: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    broadcastAll = vi.fn();
    setPipelineWsHandle({
      broadcastBotList: vi.fn(),
      subscriptions: {} as never,
      broadcastAll: broadcastAll as never,
      clientCount: vi.fn().mockReturnValue(1) as never,
    });
  });

  it('broadcasts botId / chatId / triggeredBy fields when provided', () => {
    broadcastPipelineProgress({
      type: 'pipeline_progress',
      runId: 'r1',
      pipelineId: 'p1',
      status: 'running',
      currentNodeId: 'n2',
      completedNodes: 1,
      totalNodes: 3,
      progress: 33,
      botId: 'feishu-main',
      chatId: 'oc_chat_xyz',
      triggeredBy: 'bot',
      ts: '2026-07-07T18:00:00Z',
    });

    expect(broadcastAll).toHaveBeenCalledOnce();
    const payload = broadcastAll.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.botId).toBe('feishu-main');
    expect(payload.chatId).toBe('oc_chat_xyz');
    expect(payload.triggeredBy).toBe('bot');
  });

  it('bot fields are optional (omit safely)', () => {
    broadcastPipelineProgress({
      type: 'pipeline_progress',
      runId: 'r1',
      pipelineId: 'p1',
      status: 'completed',
      currentNodeId: null,
      completedNodes: 3,
      totalNodes: 3,
      progress: 100,
      ts: '2026-07-07T18:00:00Z',
    });

    expect(broadcastAll).toHaveBeenCalledOnce();
    const payload = broadcastAll.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.botId).toBeUndefined();
    expect(payload.chatId).toBeUndefined();
    expect(payload.triggeredBy).toBeUndefined();
  });

  it('triggeredBy accepts all union variants', () => {
    const variants = ['user', 'bot', 'cron', 'event', 'api'] as const;
    for (const v of variants) {
      broadcastAll.mockClear();
      broadcastPipelineProgress({
        type: 'pipeline_progress',
        runId: 'r1',
        pipelineId: 'p1',
        status: 'running',
        currentNodeId: null,
        completedNodes: 0,
        totalNodes: 1,
        progress: 0,
        triggeredBy: v,
        ts: '2026-07-07T18:00:00Z',
      });
      const payload = broadcastAll.mock.calls[0][0] as Record<string, unknown>;
      expect(payload.triggeredBy).toBe(v);
    }
  });
});
