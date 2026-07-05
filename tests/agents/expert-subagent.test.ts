import { describe, it, expect, vi } from 'vitest';
import { ExpertSubagent } from '../../src/agents/expert-subagent.js';

describe('ExpertSubagent', () => {
  it('execute calls bridge.executeApiTask with combined prompt + returns result', async () => {
    const executeApiTask = vi.fn().mockResolvedValue({
      success: true,
      responseText: '专家回复内容',
      sessionId: 'sess-1',
      inputTokens: 100,
      outputTokens: 50,
    });
    const bridge = { executeApiTask } as any;
    const es = new ExpertSubagent({
      name: '数据采集专家',
      engine: 'minimax-m3',
      prompt: '你是数据采集专家',
    }, { bridge, botName: '得一' });

    const r = await es.execute('采集 GA4 数据', { chatId: 't1', botName: '得一', sceneType: 'data' });

    expect(executeApiTask).toHaveBeenCalledTimes(1);
    const callOpts = executeApiTask.mock.calls[0][0];
    expect(callOpts.sendCards).toBe(false);
    expect(callOpts.prompt).toContain('数据采集专家');
    expect(callOpts.prompt).toContain('采集 GA4 数据');
    expect(callOpts.chatId).toBe('t1');
    expect(r.content).toBe('专家回复内容');
    expect(r.engine).toBe('minimax-m3');
    expect(r.sessionId).toBe('sess-1');
    expect(r.inputTokens).toBe(100);
  });

  it('execute propagates error when bridge.executeApiTask fails', async () => {
    const executeApiTask = vi.fn().mockResolvedValue({
      success: false,
      responseText: '',
      error: 'model unavailable',
    });
    const bridge = { executeApiTask } as any;
    const es = new ExpertSubagent({ name: 'X', engine: 'minimax-m3', prompt: '' }, { bridge, botName: '得一' });

    await expect(es.execute('hi', { chatId: 't', botName: '得一', sceneType: 'data' as const })).rejects.toThrow('model unavailable');
  });
});
