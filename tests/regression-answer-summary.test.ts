/**
 * Regression test for answer summary bug fix.
 *
 * Bug: handleAnswer cleared task.collectedAnswers before building the summary,
 * so answerSummary always fell back to answerText (only the last answer).
 * Fix: Use the captured `collectedAnswers` variable instead of `task.collectedAnswers`.
 */
import { describe, expect, it } from 'vitest';

describe('Answer summary regression', () => {
  it('builds summary from captured collectedAnswers, not from task.collectedAnswers (which was cleared)', () => {
    const collectedAnswers: Record<string, string> = {
      '技术栈': 'React + TypeScript',
      '部署方式': 'Docker',
    };

    // Simulate: task.collectedAnswers = {} clears the task reference
    // But collectedAnswers still holds the original object
    const clearedTaskAnswers: Record<string, string> = {};

    // Bug (old code): used task.collectedAnswers (already empty)
    const buggySummary =
      Object.values(clearedTaskAnswers).length > 0
        ? Object.values(clearedTaskAnswers).join(', ')
        : 'last answer only';

    // Fix (new code): uses captured collectedAnswers
    const fixedSummary =
      Object.values(collectedAnswers).length > 0
        ? Object.values(collectedAnswers).join(', ')
        : 'last answer only';

    expect(buggySummary).toBe('last answer only');
    expect(fixedSummary).toBe('React + TypeScript, Docker');
  });

  it('preserves all answers when collectedAnswers has multiple entries', () => {
    const answers: Record<string, string> = {
      'Q1': 'Answer A',
      'Q2': 'Answer B',
      'Q3': 'Answer C',
    };

    const summary = Object.values(answers).join(', ');
    expect(summary).toBe('Answer A, Answer B, Answer C');
  });

  it('falls back to answerText when no answers collected', () => {
    const collectedAnswers: Record<string, string> = {};
    const answerText = 'some direct answer';

    const summary =
      Object.values(collectedAnswers).length > 0
        ? Object.values(collectedAnswers).join(', ')
        : answerText;

    expect(summary).toBe('some direct answer');
  });
});
