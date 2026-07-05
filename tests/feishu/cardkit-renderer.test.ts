import { describe, it, expect } from 'vitest';
import { buildCompletionCard, buildActionButton } from '../../src/feishu/cardkit-renderer.js';

describe('CardKit Completion Card (buildCompletionCard)', () => {
  it('default: 5 buttons visible (4 旧 + 1 new_chat shortcut)', () => {
    const card = JSON.parse(buildCompletionCard({ body: 'test' }));
    const action = card.elements.find((e: any) => e.tag === 'action');
    expect(action).toBeDefined();
    expect(action.actions).toHaveLength(5);
  });

  it('when taskState=completed: 4 buttons disabled, new_chat enabled', () => {
    const card = JSON.parse(buildCompletionCard({ body: 'test', taskState: 'completed' }));
    const action = card.elements.find((e: any) => e.tag === 'action');
    expect(action.actions[0].disabled).toBe(true);
    expect(action.actions[1].disabled).toBe(true);
    expect(action.actions[2].disabled).toBe(true);
    expect(action.actions[3].disabled).toBe(true);
    expect(action.actions[4].disabled).toBeFalsy();
    expect(action.actions[4].value.action).toBe('new_chat');
  });

  it('when taskState=running: 4 buttons enabled', () => {
    const card = JSON.parse(buildCompletionCard({ body: 'test', taskState: 'running' }));
    const action = card.elements.find((e: any) => e.tag === 'action');
    expect(action.actions[0].disabled).toBeFalsy();
  });

  it('new_chat button always visible and enabled (any taskState)', () => {
    for (const st of ['completed', 'running', 'failed']) {
      const card = JSON.parse(buildCompletionCard({ body: 'test', taskState: st }));
      const action = card.elements.find((e: any) => e.tag === 'action');
      const newChat = action.actions.find((b: any) => b.value.action === 'new_chat');
      expect(newChat).toBeDefined();
      expect(newChat.disabled).toBeFalsy();
    }
  });
});

describe('buildActionButton', () => {
  it('default disabled=undefined', () => {
    const btn = buildActionButton('Test', 'test_action', 'default');
    expect(btn.disabled).toBeUndefined();
  });

  it('disabled=true passed through', () => {
    const btn = buildActionButton('Test', 'test_action', 'default', true);
    expect(btn.disabled).toBe(true);
  });
});
