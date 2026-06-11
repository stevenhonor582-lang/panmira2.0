import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WsClient } from '../ws-client';

vi.mock('ws', () => {
  const mockWs = {
    handlers: {} as Record<string, Function>,
    on: vi.fn(function (event: string, handler: Function) {
      mockWs.handlers[event] = handler;
      // Simulate immediate 'open' so isConnected() becomes true
      if (event === 'open') {
        setImmediate(() => handler());
      }
    }),
    send: vi.fn(),
    close: vi.fn(),
    ping: vi.fn()
  };
  return {
    default: vi.fn(() => mockWs)
  };
});

describe('WsClient', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('connects to mah WSS with token query', async () => {
    const client = new WsClient({ url: 'ws://43.135.149.34:9100/ws', token: 'tok' });
    await client.connect();
    // Wait for setImmediate's open handler to fire
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(client.isConnected()).toBe(true);
  });

  it('emits reconnect event on disconnect with backoff', async () => {
    vi.useFakeTimers();
    const client = new WsClient({ url: 'ws://test', token: 't' });
    const onReconnect = vi.fn();
    client.on('reconnect', onReconnect);
    await client.connect();
    client.simulateDisconnect();
    await vi.advanceTimersByTimeAsync(1100);
    expect(onReconnect).toHaveBeenCalled();
  });

  it('routes incoming messages to typed events', async () => {
    const client = new WsClient({ url: 'ws://test', token: 't' });
    const onStep = vi.fn();
    client.on('agent_step', onStep);
    await client.connect();
    client.simulateMessage(JSON.stringify({ type: 'agent_step', agent: 'generation', status: 'running' }));
    expect(onStep).toHaveBeenCalledWith({
      type: 'agent_step',
      agent: 'generation',
      status: 'running'
    });
  });
});
