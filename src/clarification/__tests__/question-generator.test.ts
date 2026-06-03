import { describe, it, expect } from 'vitest';
import { QuestionGenerator } from '../question-generator.js';
import type { FieldGap } from '../types.js';

describe('QuestionGenerator', () => {
  const gen = new QuestionGenerator();

  it('generates button question for enum field', () => {
    const gap: FieldGap = {
      name: 'topic', type: 'enum', required: true,
      question: '主题？', options: ['A', 'B', 'C'],
    };
    const q = gen.generate([gap])[0];
    expect(q.kind).toBe('button');
    expect(q.fieldName).toBe('topic');
    expect(q.options).toHaveLength(3);
    expect(q.options?.[0]).toEqual({ label: 'A', value: 'A' });
  });

  it('generates free_text question for string field', () => {
    const gap: FieldGap = {
      name: 'detail', type: 'string', required: true,
      question: '详细说明？',
    };
    const q = gen.generate([gap])[0];
    expect(q.kind).toBe('free_text');
  });

  it('respects maxQuestionsPerRound', () => {
    const gaps: FieldGap[] = [
      { name: 'a', type: 'string', required: true, question: 'Q1' },
      { name: 'b', type: 'string', required: true, question: 'Q2' },
      { name: 'c', type: 'string', required: true, question: 'Q3' },
      { name: 'd', type: 'string', required: true, question: 'Q4' },
    ];
    const qs = gen.generate(gaps, 2);
    expect(qs).toHaveLength(2);
  });

  it('returns empty array for no gaps', () => {
    expect(gen.generate([])).toHaveLength(0);
  });
});
