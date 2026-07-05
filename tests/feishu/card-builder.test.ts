import { describe, it, expect } from 'vitest';
import { buildCard } from '../../src/feishu/card-builder.js';
import type { CardState } from '../../src/types.js';

function makeState(status: CardState['status'], responseText = '测试输出'): CardState {
  return {
    status,
    userPrompt: 'test prompt',
    responseText,
    toolCalls: [],
    totalTokens: 1000,
    contextWindow: 200000,
    durationMs: 5000,
  };
}

describe('buildCard (feishu card-builder)', () => {
  it('task complete: adds 5 action buttons (4 disabled + 1 new_chat enabled)', () => {
    const card = JSON.parse(buildCard(makeState('complete')));
    const actions = card.elements.filter((e: any) => e.tag === 'action');
    expect(actions).toHaveLength(1);
    const btnList = actions[0].actions;
    expect(btnList).toHaveLength(5);
    // 前 4 个 disabled
    for (let i = 0; i < 4; i++) {
      expect(btnList[i].disabled).toBe(true);
    }
    // 第 5 个 enabled
    expect(btnList[4].disabled).toBe(false);
    expect(btnList[4].value.action).toBe('new_chat');
  });

  it('task error: also adds 5 action buttons (recovery path)', () => {
    const card = JSON.parse(buildCard(makeState('error', '出错了')));
    const actions = card.elements.filter((e: any) => e.tag === 'action');
    expect(actions).toHaveLength(1);
    expect(actions[0].actions).toHaveLength(5);
  });

  it('task running: NO task management buttons (avoids stale during active task)', () => {
    const card = JSON.parse(buildCard(makeState('running')));
    const actions = card.elements.filter((e: any) => e.tag === 'action');
    expect(actions).toHaveLength(0);
  });

  it('task thinking: NO task management buttons', () => {
    const card = JSON.parse(buildCard(makeState('thinking')));
    const actions = card.elements.filter((e: any) => e.tag === 'action');
    expect(actions).toHaveLength(0);
  });
});
