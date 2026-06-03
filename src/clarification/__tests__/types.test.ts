import { describe, it, expect } from 'vitest';
import type {
  EngineInput, EngineOutput, FieldGap,
  Question, ClarificationConfig, SessionRecord
} from '../types.js';

describe('types', () => {
  it('FieldGap has required fields', () => {
    const gap: FieldGap = {
      name: 'topic',
      type: 'enum',
      question: '方案主题？',
      options: ['A', 'B'],
      required: true,
    };
    expect(gap.name).toBe('topic');
  });

  it('Question supports button and free-text', () => {
    const q: Question = {
      fieldName: 'topic',
      text: '方案主题？',
      kind: 'button',
      options: [{ label: 'A', value: 'A' }, { label: 'B', value: 'B' }],
    };
    expect(q.kind).toBe('button');
  });
});
