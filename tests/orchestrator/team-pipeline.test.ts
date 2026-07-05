import { describe, it, expect, vi } from 'vitest';
import { TeamPipeline } from '../../src/orchestrator/team-pipeline.js';
import { ReviewPanel } from '../../src/orchestrator/review-panel.js';

const makeFakeBridge = (expertResponses, reviewResponse) => {
  let i = 0;
  return {
    executeApiTask: vi.fn().mockImplementation(async (opts) => {
      if (opts.chatId.includes('review') || opts.chatId.includes('panel')) {
        return { success: true, responseText: reviewResponse };
      }
      const resp = expertResponses[i++] ?? ['default', 'default'];
      return { success: true, responseText: resp[1], sessionId: `sess-${i}` };
    }),
  };
};

const makeFakePool = () => ({
  query: vi.fn().mockResolvedValue({ rows: [{ id: 'm', content: 'mem', metadata_json: {} }] }),
});

const makeScenePack = () => ({
  sceneType: 'data',
  name: '数据场景',
  experts: {
    collect: { name: '采集', engine: 'minimax-m3', prompt: '你是采集' },
    analyze: { name: '分析', engine: 'anthropic-opus-4-7', prompt: '你是分析' },
    produce: { name: '产出', engine: 'anthropic-opus-4-7', prompt: '你是产出' },
    review: { name: '审查', engine: 'anthropic-opus-4-7', prompt: '你是审查' },
  },
});

describe('TeamPipeline (integration with mocks)', () => {
  it('runs collect → analyze → produce → review in sequence', async () => {
    const responses = [['采集', '采集摘要:v1'], ['分析', '分析:v1'], ['产出', '产出:v1']];
    const bridge = makeFakeBridge(responses, 'PASS');
    const reviewPanel = new ReviewPanel(
      { reviewExpert: { name: '审查', engine: 'anthropic-opus-4-7', prompt: '审查官' } },
      { bridge },
    );
    const pipeline = new TeamPipeline({
      orchestrator: { identifyScene: () => 'data' },
      scenePackLoader: { load: async () => makeScenePack() },
      memoryBridge: { writeStageOutput: vi.fn(), readMemories: vi.fn().mockResolvedValue([]) },
      reviewPanel,
      bridge,
      botName: '得一',
    });
    const r = await pipeline.execute('请生成 GA4 周报', { chatId: 'e2e-1', botName: '得一' });
    expect(r.status).toBe('complete');
    expect(r.sceneType).toBe('data');
    expect(r.stages).toHaveLength(4);
    expect(r.stages[0].stage).toBe('collect');
    expect(r.stages[3].stage).toBe('review');
    expect(r.stages[0].output).toBe('采集摘要:v1');
    expect(r.stages[3].reviewPassed).toBe(true);
  });

  it('returns error when scene cannot be identified', async () => {
    const bridge = makeFakeBridge([], 'PASS');
    const reviewPanel = new ReviewPanel(
      { reviewExpert: { name: '审查', engine: 'anthropic-opus-4-7', prompt: '审查官' } },
      { bridge },
    );
    const pipeline = new TeamPipeline({
      orchestrator: { identifyScene: () => 'unknown' },
      scenePackLoader: { load: async () => makeScenePack() },
      memoryBridge: { writeStageOutput: vi.fn(), readMemories: vi.fn().mockResolvedValue([]) },
      reviewPanel,
      bridge,
      botName: '得一',
    });
    const r = await pipeline.execute('随便聊聊', { chatId: 'e2e-2', botName: '得一' });
    expect(r.status).toBe('error');
    expect(r.sceneType).toBe('unknown');
    expect(r.stages).toHaveLength(0);
    expect(r.finalOutput).toContain('无法识别场景');
  });

  it('review fails → status=error', async () => {
    const responses = [['采集', '采集摘要'], ['分析', '分析'], ['产出', '产出']];
    const bridge = makeFakeBridge(responses, 'FAIL: 数据不准确');
    const reviewPanel = new ReviewPanel(
      { reviewExpert: { name: '审查', engine: 'anthropic-opus-4-7', prompt: '审查官' } },
      { bridge },
    );
    const pipeline = new TeamPipeline({
      orchestrator: { identifyScene: () => 'data' },
      scenePackLoader: { load: async () => makeScenePack() },
      memoryBridge: { writeStageOutput: vi.fn(), readMemories: vi.fn().mockResolvedValue([]) },
      reviewPanel,
      bridge,
      botName: '得一',
    });
    const r = await pipeline.execute('请生成周报', { chatId: 'e2e-3', botName: '得一' });
    expect(r.status).toBe('error');
    expect(r.stages[3].reviewPassed).toBe(false);
    expect(r.stages[3].reviewFeedback).toContain('数据不准确');
  });
});
