import { describe, it, expect, vi } from 'vitest';
import { MultiBotOrchestrator } from '../../src/orchestrator/multi-bot-orchestrator.js';
import { ReviewPanel } from '../../src/orchestrator/review-panel.js';

describe('MultiBotOrchestrator', () => {
  it('3 bots collaborate: each pipeline runs in parallel, all return results', async () => {
    const bridge = {
      executeApiTask: vi.fn().mockImplementation(async (opts: any) => {
        return { success: true, responseText: `bot-response-${opts.chatId}`, sessionId: `sess-${opts.chatId}` };
      }),
    } as any;
    const reviewPanel = new ReviewPanel(
      { reviewExpert: { name: '审', engine: 'claude-opus-4-7', prompt: '审' } },
      { bridge },
    );
    const orch = { identifyScene: () => 'data' } as any;
    const scenePackLoader = {
      load: async () => ({
        sceneType: 'data' as const,
        name: '数据',
        experts: {
          collect: { name: '采集', engine: 'minimax-m3', prompt: '采集' },
          analyze: { name: '分析', engine: 'claude-opus-4-7', prompt: '分析' },
          produce: { name: '产出', engine: 'claude-opus-4-7', prompt: '产出' },
          review: { name: '审', engine: 'claude-opus-4-7', prompt: '审' },
        },
      }),
    };
    const memoryBridge = { writeStageOutput: vi.fn(), readMemories: vi.fn().mockResolvedValue([]) };

    const mbo = new MultiBotOrchestrator({
      bridge,
      reviewPanel,
      orchestrator: orch,
      scenePackLoader,
      memoryBridge,
      bots: ['得一', '不盈', '守静'],
    });

    const r = await mbo.execute('用户分析报告(综合视角)');
    expect(r.participatingBots).toEqual(['得一', '不盈', '守静']);
    expect(r.outputs).toHaveLength(3);
    expect(r.outputs[0].bot).toBe('得一');
    expect(r.outputs[1].bot).toBe('不盈');
    expect(r.outputs[2].bot).toBe('守静');
  });
});
