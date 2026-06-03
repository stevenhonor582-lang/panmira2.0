import { describe, it, expect } from 'vitest';
import { ConfigLoader, DEFAULT_CONFIG } from '../config-loader.js';

describe('ConfigLoader', () => {
  it('returns bot-specific config when present', () => {
    const loader = new ConfigLoader({
      'doc-bot': {
        enabled: true,
        maxQuestionsPerRound: 5,
        sessionTtlHours: 48,
        applicableSkills: ['write-proposal'],
        fallbackToLLM: true,
      },
    });
    const cfg = loader.load('doc-bot');
    expect(cfg.maxQuestionsPerRound).toBe(5);
    expect(cfg.sessionTtlHours).toBe(48);
  });

  it('returns default when bot not configured', () => {
    const loader = new ConfigLoader({});
    const cfg = loader.load('unknown-bot');
    expect(cfg).toEqual(DEFAULT_CONFIG);
  });

  it('merges partial config with defaults', () => {
    const loader = new ConfigLoader({
      'doc-bot': {
        enabled: true,
        maxQuestionsPerRound: 2,
        sessionTtlHours: 24,
        applicableSkills: ['write-proposal'],
        fallbackToLLM: false,
      } as any,
    });
    const cfg = loader.load('doc-bot');
    expect(cfg.enabled).toBe(true);
    expect(cfg.maxQuestionsPerRound).toBe(2);
  });
});
