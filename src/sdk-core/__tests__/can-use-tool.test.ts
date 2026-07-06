import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger to keep test output clean and avoid pino-pretty transport init.
vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({
    child: () => ({
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  }),
}));

import { CanUseToolDecider } from '../can-use-tool.js';

describe('CanUseToolDecider', () => {
  let decider: CanUseToolDecider;
  const baseOptions = (overrides: Partial<{
    signal: AbortSignal;
    suggestions: unknown[];
    toolUseID: string;
  }> = {}) => ({
    signal: overrides.signal ?? new AbortController().signal,
    suggestions: overrides.suggestions,
    toolUseID: overrides.toolUseID ?? 'test-tool-use-id',
  });

  beforeEach(() => {
    decider = new CanUseToolDecider();
  });

  it('denies tools in the denied list (AskUserQuestion)', async () => {
    // Arrange - AskUserQuestion is locked-disabled by panmira 2.1 policy
    const result = await decider.decide('AskUserQuestion', {}, baseOptions());

    // Assert
    expect(result.behavior).toBe('deny');
    if (result.behavior === 'deny') {
      expect(result.message).toMatch(/AskUserQuestion|disabled/i);
    }
  });

  it('allows tools in the whitelist (Read)', async () => {
    // Arrange - Read is a safe inspection tool, always allowed
    const result = await decider.decide('Read', { file_path: '/tmp/x' }, baseOptions());

    // Assert
    expect(result.behavior).toBe('allow');
  });

  it('denies sensitive tools with sensitive-message (Bash)', async () => {
    // Arrange - Bash carries command-injection risk, denied-by-default
    const result = await decider.decide('Bash', { command: 'ls' }, baseOptions());

    // Assert
    expect(result.behavior).toBe('deny');
    if (result.behavior === 'deny') {
      expect(result.message).toMatch(/sensitive|confirm/i);
    }
  });

  it('denies unknown tools by safe default', async () => {
    // Arrange - tool not in any list should fall through to deny
    const result = await decider.decide('MysteryTool', {}, baseOptions());

    // Assert
    expect(result.behavior).toBe('deny');
    if (result.behavior === 'deny') {
      expect(result.message).toMatch(/whitelist|not in/i);
    }
  });

  it('denies with aborted signal before any policy check', async () => {
    // Arrange - aborted signal short-circuits to deny
    const ac = new AbortController();
    ac.abort();
    const result = await decider.decide('Read', {}, baseOptions({ signal: ac.signal }));

    // Assert
    expect(result.behavior).toBe('deny');
    if (result.behavior === 'deny') {
      expect(result.message).toMatch(/abort/i);
    }
  });
});
