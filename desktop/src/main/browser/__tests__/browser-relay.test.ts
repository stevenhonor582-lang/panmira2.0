import { describe, it, expect, vi } from 'vitest';
import { createBrowserHandlers } from '../browser-relay.js';

describe('browser IPC handlers', () => {
  it('open delegates to engine.launch', async () => {
    const engine = { launch: vi.fn().mockResolvedValue({ sessionId: 's1' }) };
    const handlers = createBrowserHandlers({ engine: engine as any, actions: {} as any });
    const result = await handlers['browser:open']('t1', 'https://x.com');
    expect(result).toEqual({ viewportId: 's1' });
    expect(engine.launch).toHaveBeenCalledWith('t1');
  });

  it('screenshot delegates to actions.screenshot', async () => {
    const actions = { screenshot: vi.fn().mockResolvedValue('base64data') };
    const handlers = createBrowserHandlers({ engine: {} as any, actions: actions as any });
    const result = await handlers['browser:screenshot']('s1');
    expect(result).toBe('base64data');
  });
});
