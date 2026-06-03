import { describe, it, expect } from 'vitest';
import { ClarificationError, isClarificationError } from '../errors.js';

describe('ClarificationError', () => {
  it('carries error code and recoverability', () => {
    const err = new ClarificationError(
      'CARD_SEND_FAILED',
      'lark api 500',
      true
    );
    expect(err.code).toBe('CARD_SEND_FAILED');
    expect(err.recoverable).toBe(true);
    expect(err.message).toBe('lark api 500');
  });

  it('isClarificationError narrows correctly', () => {
    const err = new ClarificationError('SCHEMA_NOT_FOUND', 'x', true);
    const plain = new Error('plain');
    expect(isClarificationError(err)).toBe(true);
    expect(isClarificationError(plain)).toBe(false);
  });
});
