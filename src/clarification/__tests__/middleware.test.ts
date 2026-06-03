// @ts-nocheck
import { describe, it, expect, vi } from 'vitest';
import { ClarificationMiddleware } from '../middleware.js';
import { ClarificationEngine } from '../engine.js';
import { SchemaValidator } from '../schema-validator.js';
import { QuestionGenerator } from '../question-generator.js';
import { SessionStore } from '../session-store.js';
import { ConfigLoader } from '../config-loader.js';
import { CardBuilder } from '../card-builder.js';
import type { Pool } from 'pg';

const schemas = {
  'write-proposal': [
    { name: 'topic', type: 'enum' as const, question: '主题？', options: ['A', 'B'], required: true },
  ],
};

const mockPool = {} as Pool;
const mockSessionStore = {
  create: vi.fn().mockResolvedValue({ id: 1 }),
  updatePayload: vi.fn(),
  get: vi.fn().mockResolvedValue({ payload: {} }),
  markAbandoned: vi.fn(),
  markCompleted: vi.fn(),
} as unknown as SessionStore;

const mockCardSender = vi.fn().mockResolvedValue(true);

describe('ClarificationMiddleware', () => {
  const engine = new ClarificationEngine(
    new SchemaValidator(schemas),
    new QuestionGenerator(),
    { enabled: true, maxQuestionsPerRound: 3, sessionTtlHours: 24, applicableSkills: ['write-proposal'], fallbackToLLM: false }
  );

  const configLoader = new ConfigLoader({
    'doc-bot': { enabled: true, maxQuestionsPerRound: 3, sessionTtlHours: 24, applicableSkills: ['write-proposal'], fallbackToLLM: false },
  });

  const mw = new ClarificationMiddleware(
    engine, mockSessionStore, configLoader, new CardBuilder(), mockCardSender
  );

  it('skips when engine says no clarification needed', async () => {
    const next = vi.fn();
    const ctx = { userId: 'u1', botId: 'doc-bot', targetSkill: 'unknown-skill', rawMessage: 'hi' };
    await mw.handle(ctx, next);
    expect(next).toHaveBeenCalledOnce();
    expect(mockCardSender).not.toHaveBeenCalled();
  });

  it('sends card and blocks next() when clarification needed', async () => {
    const next = vi.fn();
    const ctx = { userId: 'u1', botId: 'doc-bot', targetSkill: 'write-proposal', rawMessage: '写方案' };
    await mw.handle(ctx, next);
    expect(mockCardSender).toHaveBeenCalledOnce();
    expect(next).not.toHaveBeenCalled();
    expect(mockSessionStore.create).toHaveBeenCalledOnce();
  });

  it('falls back to text on card send failure', async () => {
    const failingSender = vi.fn().mockRejectedValue(new Error('lark 500'));
    const mw2 = new ClarificationMiddleware(
      engine, mockSessionStore, configLoader, new CardBuilder(), failingSender
    );
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    
    const ctx = { userId: 'u1', botId: 'doc-bot', targetSkill: 'write-proposal', rawMessage: '写方案' };
    const next = vi.fn();
    
    await expect(mw2.handle(ctx, next)).resolves.toBeUndefined();
    expect(next).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
