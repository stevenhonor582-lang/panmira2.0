import { describe, it, expect } from 'vitest';
import { ClarificationEngine } from '../engine.js';
import { SchemaValidator } from '../schema-validator.js';
import { QuestionGenerator } from '../question-generator.js';
import type { FieldSchema } from '../types.js';

const schemas: Record<string, FieldSchema[]> = {
  'write-proposal': [
    { name: 'topic', type: 'enum', question: '主题？', options: ['A', 'B'], required: true },
    { name: 'audience', type: 'enum', question: '读者？', options: ['X', 'Y'], required: true },
  ],
};

describe('ClarificationEngine', () => {
  const engine = new ClarificationEngine(
    new SchemaValidator(schemas),
    new QuestionGenerator(),
    { enabled: true, maxQuestionsPerRound: 3, sessionTtlHours: 24, applicableSkills: ['write-proposal'], fallbackToLLM: false }
  );

  it('returns needsClarification=true with gaps when payload empty', async () => {
    const out = await engine.process({
      userId: 'u1', botId: 'b1', targetSkill: 'write-proposal',
      rawMessage: '帮我写个方案',
    });
    expect(out.needsClarification).toBe(true);
    expect(out.missingFields).toHaveLength(2);
    expect(out.suggestedQuestions).toHaveLength(2);
  });

  it('returns needsClarification=false when payload complete', async () => {
    const out = await engine.process({
      userId: 'u2', botId: 'b1', targetSkill: 'write-proposal',
      rawMessage: '...',
      existingPayload: { topic: 'A', audience: 'X' },
    });
    expect(out.needsClarification).toBe(false);
    expect(out.payload).toEqual({ topic: 'A', audience: 'X' });
  });

  it('merges existing payload with no new info', async () => {
    const out = await engine.process({
      userId: 'u3', botId: 'b1', targetSkill: 'write-proposal',
      rawMessage: '...',
      existingPayload: { topic: 'A' },
    });
    expect(out.needsClarification).toBe(true);
    expect(out.payload).toEqual({ topic: 'A' });
    expect(out.missingFields).toHaveLength(1);
    expect(out.missingFields[0].name).toBe('audience');
  });

  it('skips when skill not in applicableSkills', async () => {
    const engine2 = new ClarificationEngine(
      new SchemaValidator(schemas),
      new QuestionGenerator(),
      { enabled: true, maxQuestionsPerRound: 3, sessionTtlHours: 24, applicableSkills: [], fallbackToLLM: false }
    );
    const out = await engine2.process({
      userId: 'u4', botId: 'b1', targetSkill: 'write-proposal',
      rawMessage: '...',
    });
    expect(out.needsClarification).toBe(false);
    expect(out.payload).toEqual({});
  });

  it('skips when enabled=false', async () => {
    const engine2 = new ClarificationEngine(
      new SchemaValidator(schemas),
      new QuestionGenerator(),
      { enabled: false, maxQuestionsPerRound: 3, sessionTtlHours: 24, applicableSkills: ['write-proposal'], fallbackToLLM: false }
    );
    const out = await engine2.process({
      userId: 'u5', botId: 'b1', targetSkill: 'write-proposal',
      rawMessage: '...',
    });
    expect(out.needsClarification).toBe(false);
  });

  it('skips when skill has no schema (SCHEMA_NOT_FOUND recoverable)', async () => {
    const out = await engine.process({
      userId: 'u6', botId: 'b1', targetSkill: 'unknown-skill',
      rawMessage: '...',
    });
    expect(out.needsClarification).toBe(false);
  });
});
