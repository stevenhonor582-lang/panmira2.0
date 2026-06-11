import { describe, it, expect, vi } from 'vitest';
import { StreamRouter } from '../stream-router';

describe('StreamRouter', () => {
  it('parses agent step event', () => {
    const router = new StreamRouter();
    const onStep = vi.fn();
    router.on('step', onStep);
    router.handleMessage(
      JSON.stringify({ type: 'agent_step', agent: 'generation', status: 'running' })
    );
    expect(onStep).toHaveBeenCalledWith({ agent: 'generation', status: 'running' });
  });

  it('parses content delta', () => {
    const router = new StreamRouter();
    const onContent = vi.fn();
    router.on('content', onContent);
    router.handleMessage(JSON.stringify({ type: 'content_delta', delta: '井口' }));
    expect(onContent).toHaveBeenCalledWith('井口');
  });
});
