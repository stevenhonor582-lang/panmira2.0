import { describe, it, expect, vi } from 'vitest';
import { ContextCompressor, type CompressorDeps } from '../../src/memory/context-compressor.js';

function makeDeps(totalTokens: number, contextWindow: number, opts: Partial<CompressorDeps> = {}): CompressorDeps {
  return {
    sessionManager: {
      getSession: vi.fn().mockReturnValue({
        sessionId: 'sess-1',
        model: 'claude-opus-4-7',
        cumulativeCostUsd: 0.5,
      }),
      consumePendingSummary: vi.fn().mockReturnValue(null),
      setSessionId: vi.fn(),
      resetSession: vi.fn(),
    } as any,
    pool: {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    } as any,
    logger: {
      info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn().mockReturnThis(),
    } as any,
    totalTokens,
    contextWindow,
    chatId: 't1',
    botName: '得一',
    threshold: opts.threshold,
    forceThreshold: opts.forceThreshold,
    ...opts,
  };
}

describe('ContextCompressor.shouldCompress', () => {
  it('returns false when usage < 70% threshold', () => {
    const c = new ContextCompressor(makeDeps(139999, 200000));
    expect(c.shouldCompress()).toBe(false);
  });

  it('returns true (warn) when usage 70-85%', () => {
    const c = new ContextCompressor(makeDeps(150000, 200000));
    expect(c.shouldCompress()).toBe(true);
    expect(c.urgency()).toBe('warn');
  });

  it('returns true (force) when usage >= 85%', () => {
    const c = new ContextCompressor(makeDeps(170000, 200000));
    expect(c.shouldCompress()).toBe(true);
    expect(c.urgency()).toBe('force');
  });

  it('returns false when contextWindow undefined', () => {
    const c = new ContextCompressor(makeDeps(1000, 0));
    expect(c.shouldCompress()).toBe(false);
  });
});

describe('ContextCompressor.compress — summarize old messages to memory', () => {
  it('writes summary to memories table + resets session', async () => {
    const deps = makeDeps(150000, 200000);
    const c = new ContextCompressor(deps);
    await c.compress('对话历史太长,前 30 轮总结:用户讨论了...');
    expect(deps.pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO memories'),
      expect.arrayContaining([
        expect.stringContaining('[auto-compress]'),
        'auto-compress',
        expect.stringContaining('auto-compress'),
      ]),
    );
    expect(deps.sessionManager.resetSession).toHaveBeenCalledWith('t1', expect.any(String));
  });

  it('throws when usage below threshold (defensive)', async () => {
    const c = new ContextCompressor(makeDeps(100000, 200000));
    await expect(c.compress('summary')).rejects.toThrow('below threshold');
  });
});

describe('ContextCompressor.urgency', () => {
  it('handles different model context windows correctly', () => {
    // 68% < 70% threshold → none
    expect(new ContextCompressor(makeDeps(350000, 512000)).urgency()).toBe('none');
    // 85% >= force threshold → force
    expect(new ContextCompressor(makeDeps(435200, 512000)).urgency()).toBe('force');
    // 10% < 70% → none
    expect(new ContextCompressor(makeDeps(100000, 1000000)).urgency()).toBe('none');
  });
});
