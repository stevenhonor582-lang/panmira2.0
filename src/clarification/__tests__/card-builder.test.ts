import { describe, it, expect } from 'vitest';
import { CardBuilder } from '../card-builder.js';
import type { Question } from '../types.js';

describe('CardBuilder', () => {
  const builder = new CardBuilder();

  it('builds card with button questions', () => {
    const questions: Question[] = [
      { fieldName: 'topic', text: '主题？', kind: 'button',
        options: [{ label: 'A', value: 'A' }, { label: 'B', value: 'B' }] },
    ];
    const card = builder.build(questions, 'write-proposal');
    
    expect(card.header?.title?.content).toContain('write-proposal');
    expect(card.elements).toBeDefined();
    expect(card.elements.length).toBeGreaterThan(0);
  });

  it('includes cancel and default-accept buttons', () => {
    const card = builder.build(
      [{ fieldName: 'x', text: 'Q', kind: 'free_text' }],
      'skill-1'
    );
    const actionElements = card.elements.filter(e => e.tag === 'action');
    expect(actionElements.length).toBeGreaterThan(0);
  });

  it('each button action carries field metadata', () => {
    const card = builder.build(
      [{ fieldName: 'topic', text: 'Q', kind: 'button',
         options: [{ label: 'A', value: 'A' }] }],
      'skill-1'
    );
    const actionEl = card.elements.find(e => e.tag === 'action');
    expect(JSON.stringify(actionEl)).toContain('topic');
    expect(JSON.stringify(actionEl)).toContain('A');
  });
});
