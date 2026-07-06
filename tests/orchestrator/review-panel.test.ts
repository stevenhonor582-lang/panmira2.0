import { describe, it, expect, vi } from 'vitest';
import { ReviewPanel } from '../../src/orchestrator/review-panel.js';

const makeBridge = (responses: string[]) => {
  let i = 0;
  return {
    executeApiTask: vi.fn().mockImplementation(async () => ({
      success: true,
      responseText: responses[i++] ?? '',
    })),
  } as any;
};

describe('ReviewPanel', () => {
  it('default single review: PASS → passed=true, reviewType=single', async () => {
    const bridge = makeBridge(['PASS']);
    const panel = new ReviewPanel(
      { reviewExpert: { name: '审', engine: 'anthropic-opus-4-7', prompt: '你是审查官' } },
      { bridge },
    );
    const r = await panel.review('输出内容', { chatId: 't1', botName: '得一', sceneType: 'data' });
    expect(r.passed).toBe(true);
    expect(r.reviewType).toBe('single');
    expect(r.feedback).toBeUndefined();
  });

  it('default single review: FAIL → passed=false with feedback', async () => {
    const bridge = makeBridge(['FAIL: 数据不准确']);
    const panel = new ReviewPanel(
      { reviewExpert: { name: '审', engine: 'anthropic-opus-4-7', prompt: '审查官' } },
      { bridge },
    );
    const r = await panel.review('产出', { chatId: 't1', botName: '得一', sceneType: 'data' });
    expect(r.passed).toBe(false);
    expect(r.reviewType).toBe('single');
    expect(r.feedback).toContain('数据不准确');
  });

  it('critical=true triggers panel review (3 agents, majority wins)', async () => {
    const bridge = makeBridge(['PASS', 'FAIL: 反对', 'PASS']);
    const panel = new ReviewPanel(
      { reviewExpert: { name: '审', engine: 'anthropic-opus-4-7', prompt: '审查官' } },
      { bridge },
    );
    const r = await panel.review('产出', { chatId: 't1', botName: '得一', sceneType: 'data', critical: true });
    expect(r.reviewType).toBe('panel');
    expect(bridge.executeApiTask).toHaveBeenCalledTimes(3);
    expect(r.passed).toBe(true);
  });

  it('panel review: majority FAIL → passed=false', async () => {
    const bridge = makeBridge(['FAIL: a', 'FAIL: b', 'PASS']);
    const panel = new ReviewPanel(
      { reviewExpert: { name: '审', engine: 'anthropic-opus-4-7', prompt: '审查官' } },
      { bridge },
    );
    const r = await panel.review('产出', { chatId: 't1', botName: '得一', sceneType: 'data', critical: true });
    expect(r.passed).toBe(false);
  });
});
