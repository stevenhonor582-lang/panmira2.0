import { describe, it, expect, vi } from 'vitest';
import { EngineConfig } from '../../src/engine/engine-config.js';

describe('EngineConfig', () => {
  it('fromName returns engine apiKey + baseUrl from provider_configs', async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({
        rows: [{ name: 'minimax-m3', endpoint: 'https://api.example.com', api_key: 'sk-test', type: 'anthropic' }],
      }),
    };
    const ec = await EngineConfig.fromName('minimax-m3', { pool });
    expect(ec.apiKey).toBe('sk-test');
    expect(ec.baseUrl).toBe('https://api.example.com');
    expect(ec.name).toBe('minimax-m3');
  });

  it('fromBot returns engine for bot (joined via bot_agent_history)', async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({
        rows: [{ name: 'claude-opus-4-7', endpoint: 'https://api.anthropic.com', api_key: 'sk-anthropic', type: 'anthropic' }],
      }),
    };
    const ec = await EngineConfig.fromBot('得一', { pool });
    expect(ec.name).toBe('claude-opus-4-7');
    expect(ec.apiKey).toBe('sk-anthropic');
    expect(pool.query.mock.calls[0][1]).toEqual(['得一']);
  });

  it('fromName throws on unknown engine', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    await expect(EngineConfig.fromName('nonexistent', { pool })).rejects.toThrow('Engine not found');
  });
});
