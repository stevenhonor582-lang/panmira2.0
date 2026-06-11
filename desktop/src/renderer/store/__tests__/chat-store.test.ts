import { describe, it, expect, beforeEach } from 'vitest';
import { useChatStore } from '../chat-store';

describe('useChatStore', () => {
  beforeEach(() => {
    useChatStore.setState({ messages: [], currentTrace: null, isStreaming: false });
  });

  it('appends user message', () => {
    useChatStore.getState().appendMessage({ role: 'user', content: '你好' });
    expect(useChatStore.getState().messages).toHaveLength(1);
  });

  it('updates trace step', () => {
    useChatStore.getState().startTrace();
    useChatStore.getState().updateTraceStep('generation', 'running', '生成草稿...');
    const trace = useChatStore.getState().currentTrace;
    expect(trace?.steps[0].status).toBe('running');
  });
});
