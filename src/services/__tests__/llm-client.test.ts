import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../db/index.js', () => ({
  pool: { query: vi.fn() },
}));
vi.mock('../../db/crypto.js', () => ({
  decrypt: vi.fn(() => 'test-api-key-123'),
}));

import { callLlm, loadDefaultLlmProvider, LlmCallError } from '../llm-client.ts';
import { pool } from '../../db/index.js';

// Mock global fetch
const originalFetch = globalThis.fetch;

describe('llm-client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loadDefaultLlmProvider', () => {
    it('无 provider → null', async () => {
      (pool.query as any).mockResolvedValue({ rows: [] });
      expect(await loadDefaultLlmProvider()).toBeNull();
    });

    it('有 provider → 返 config (含 decrypted key)', async () => {
      (pool.query as any).mockResolvedValue({
        rows: [{ name: 'MiniMax', base_url: 'https://api.minimaxi.com/anthropic', api_key_encrypted: 'encrypted-key', model: 'MiniMax-M3' }],
      });
      const p = await loadDefaultLlmProvider();
      expect(p?.name).toBe('MiniMax');
      expect(p?.apiKey).toBe('test-api-key-123');
      expect(p?.model).toBe('MiniMax-M3');
    });

    it('apiKey 缺失 → 返空 apiKey (允许后续报错)', async () => {
      (pool.query as any).mockResolvedValue({
        rows: [{ name: 'X', base_url: 'https://x', api_key_encrypted: null, model: 'y' }],
      });
      const p = await loadDefaultLlmProvider();
      expect(p?.apiKey).toBe('');
    });
  });

  describe('callLlm', () => {
    it('成功调用, 解析 text + usage', async () => {
      (pool.query as any).mockResolvedValue({
        rows: [{ name: 'MiniMax', base_url: 'https://api.minimaxi.com/anthropic', api_key_encrypted: 'key', model: 'MiniMax-M3' }],
      });
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          content: [{ type: 'text', text: 'Hello back' }],
          usage: { input_tokens: 10, output_tokens: 5 },
          model: 'MiniMax-M3',
        }),
      } as any);

      const r = await callLlm({ messages: [{ role: 'user', content: 'Hi' }] });
      expect(r.text).toBe('Hello back');
      expect(r.usage.inputTokens).toBe(10);
      expect(r.usage.outputTokens).toBe(5);
      expect(r.usage.totalTokens).toBe(15);
      expect(r.provider).toBe('MiniMax');
    });

    it('401 抛 LlmCallError', async () => {
      (pool.query as any).mockResolvedValue({
        rows: [{ name: 'P', base_url: 'https://p', api_key_encrypted: 'key', model: 'm' }],
      });
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false, status: 401, text: async () => 'unauthorized',
      } as any);

      await expect(callLlm({ messages: [{ role: 'user', content: 'q' }] })).rejects.toThrow(LlmCallError);
    });

    it('无 provider → 503', async () => {
      (pool.query as any).mockResolvedValue({ rows: [] });
      await expect(callLlm({ messages: [{ role: 'user', content: 'q' }] })).rejects.toMatchObject({ statusCode: 503 });
    });

    it('system prompt 包含在 body', async () => {
      (pool.query as any).mockResolvedValue({
        rows: [{ name: 'P', base_url: 'https://p', api_key_encrypted: 'key', model: 'm' }],
      });
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true, status: 200, json: async () => ({ content: [], usage: {} }),
      } as any);
      globalThis.fetch = fetchMock;
      await callLlm({ system: 'You are helpful', messages: [{ role: 'user', content: 'q' }] });
      const callArgs = fetchMock.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.system).toBe('You are helpful');
    });
  });
});
