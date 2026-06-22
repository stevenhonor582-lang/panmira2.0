import { describe, expect, it } from 'vitest';
import { feishuBotFromJson } from '../src/config.js';

describe('feishuBotFromJson Claude config — fail-fast on missing model/baseUrl/apiKey', () => {
  const baseEntry = {
    name: 'chen-xingzhi',
    feishuAppId: 'cli_a9736ae37ff85ccc',
    feishuAppSecret: 'fake-secret',
    defaultWorkingDirectory: '/tmp/test-workspace',
    engine: 'claude' as const,
  };

  it('throws when no providerId and no model/baseUrl/apiKey (current silent fallback path)', async () => {
    await expect(feishuBotFromJson({ ...baseEntry })).rejects.toThrow(
      /required claude config.*apiKey/i,
    );
  });

  it('throws when providerId resolves to a record with empty model', async () => {
    const fakeStore = {
      findById: async () => ({ model: '', baseUrl: 'https://x', apiKeyEncrypted: 'k' }),
      getDecryptedApiKey: async () => 'k',
    };
    await expect(
      feishuBotFromJson(
        { ...baseEntry, providerId: 'fake-uuid' },
        fakeStore as any,
      ),
    ).rejects.toThrow(/required claude config.*model/i);
  });

  it('throws when baseUrl is empty string', async () => {
    await expect(
      feishuBotFromJson({
        ...baseEntry,
        model: 'MiniMax-M3',
        apiKey: 'sk-test',
        baseUrl: '',
      } as any),
    ).rejects.toThrow(/required claude config.*baseUrl/i);
  });

  it('throws when apiKey is empty string', async () => {
    await expect(
      feishuBotFromJson({
        ...baseEntry,
        model: 'MiniMax-M3',
        apiKey: '',
        baseUrl: 'https://api.minimaxi.com/anthropic',
      } as any),
    ).rejects.toThrow(/required claude config.*apiKey/i);
  });

  it('succeeds when all three fields are set explicitly', async () => {
    const cfg = await feishuBotFromJson({
      ...baseEntry,
      model: 'MiniMax-M3',
      apiKey: 'sk-test',
      baseUrl: 'https://api.minimaxi.com/anthropic',
    } as any);
    expect(cfg.claude.model).toBe('MiniMax-M3');
    expect(cfg.claude.baseUrl).toBe('https://api.minimaxi.com/anthropic');
    expect(cfg.claude.apiKey).toBe('sk-test');
  });
});
