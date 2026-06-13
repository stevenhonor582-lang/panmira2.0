import { describe, it, expect, vi } from 'vitest';
import { createTemplateHandlers } from '../ipc.js';

describe('templates IPC', () => {
  it('list returns summaries from registry', async () => {
    const registry = { list: vi.fn().mockReturnValue([{ id: 'a', name: 'A', description: 'd', category: 'analysis', estimatedDurationSec: 10 }]) };
    const handlers = createTemplateHandlers({ registry: registry as any, runner: {} as any });
    const result = await handlers['templates:list']();
    expect(result).toHaveLength(1);
  });

  it('run delegates to runner', async () => {
    const runner = { run: vi.fn().mockResolvedValue({ taskId: 't1', outputFormat: 'markdown', output: 'ok' }) };
    const handlers = createTemplateHandlers({ registry: {} as any, runner: runner as any });
    const result = await handlers['templates:run']({ templateId: 'a', params: {} });
    expect(result).toEqual({ taskId: 't1', outputFormat: 'markdown', output: 'ok' });
  });
});
