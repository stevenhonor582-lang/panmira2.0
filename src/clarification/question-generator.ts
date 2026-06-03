import type { FieldGap, Question, QuestionOption } from './types.js';

export class QuestionGenerator {
  generate(gaps: FieldGap[], maxPerRound: number = 3): Question[] {
    return gaps.slice(0, maxPerRound).map(gap => this.toQuestion(gap));
  }

  private toQuestion(gap: FieldGap): Question {
    if (gap.type === 'enum' && gap.options && gap.options.length > 0) {
      return {
        fieldName: gap.name,
        text: gap.question,
        kind: 'button',
        options: gap.options.map(this.toOption),
      };
    }
    return {
      fieldName: gap.name,
      text: gap.question,
      kind: 'free_text',
    };
  }

  private toOption(value: string): QuestionOption {
    return { label: value, value };
  }
}
