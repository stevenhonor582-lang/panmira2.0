import { describe, it, expect, vi } from 'vitest';
import { ProviderRouter } from '../../src/engine/provider-router.js';

describe('ProviderRouter', () => {
  it('executes on primary engine successfully', async () => {
    const mockPool = (rows: any[]) => ({ query: vi.fn().mockResolvedValue({ rows }) });
    const router = new ProviderRouter({ pool: mockPool([{ name: 'minimax-m3', endpoint: 'https://a', api_key: 'k1', type: 'anthropic' }]) });
    const r = await router.execute('minimax-m3', 'hello', { providerConfigs: ['minimax-m3', 'glm-5.2'] });
    expect(r.engine).toBe('minimax-m3');
    expect(r.fellBack).toBe(false);
  });

  it('falls back to next engine when primary not found', async () => {
    const mockPool = (rows: any[]) => ({ query: vi.fn().mockResolvedValue({ rows }) });
    // First call (minimax-m3) returns empty, second (glm-5.2) returns config
    let callIdx = 0;
    const pool = {
      query: vi.fn().mockImplementation(async () => {
        callIdx++;
        if (callIdx === 1) return { rows: [] };
        return { rows: [{ name: 'glm-5.2', endpoint: 'https://b', api_key: 'k2', type: 'openai' }] };
      }),
    };
    const router = new ProviderRouter({ pool });
    const r = await router.execute('nonexistent-engine', 'hello', { providerConfigs: ['minimax-m3', 'glm-5.2', 'claude-opus-4-7'] });
    expect(r.fellBack).toBe(true);
    expect(['minimax-m3', 'glm-5.2']).toContain(r.engine);
  });

  it('throws when all providers fail', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    const router = new ProviderRouter({ pool });
    await expect(
      router.execute('nonexistent', 'hello', { providerConfigs: ['also-nonexistent'] }),
    ).rejects.toThrow();
  });
});
