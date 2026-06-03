import { describe, it, expect, vi } from 'vitest';
import { GateChecker } from '../../src/bridge/orchestrator/gate-checker.js';
import type { Logger } from '../../src/utils/logger.js';

const mockLogger: Logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(() => mockLogger),
} as any;

describe('GateChecker', () => {
  const checker = new GateChecker(mockLogger);

  const emptyStepResult = {
    step: '',
    success: true,
    output: '',
    summary: '',
    gateResults: [],
    durationMs: 0,
    costUsd: 0,
    model: '',
    inputTokens: 0,
    outputTokens: 0,
  };

  it('returns empty array for empty rules', async () => {
    const results = await checker.checkAll([], emptyStepResult, '/tmp');
    expect(results).toHaveLength(0);
  });

  it('reports unknown gate type as failure', async () => {
    const results = await checker.checkAll(
      [{ type: 'unknown_gate' as any }],
      emptyStepResult,
      '/tmp',
    );
    expect(results).toHaveLength(1);
    expect(results[0].passed).toBe(false);
    expect(results[0].gate).toBe('unknown_gate');
  });

  it('test_pass fails when npm test not available', async () => {
    const results = await checker.checkAll(
      [{ type: 'test_pass' }],
      emptyStepResult,
      '/tmp/nonexistent_dir_12345',
    );
    expect(results).toHaveLength(1);
    expect(results[0].passed).toBe(false);
    expect(results[0].gate).toBe('test_pass');
  });

  it('health_check fails when endpoint unreachable', async () => {
    const results = await checker.checkAll(
      [{ type: 'health_check', endpoint: 'http://localhost:19999', expect: 200 }],
      emptyStepResult,
      '/tmp',
    );
    expect(results).toHaveLength(1);
    expect(results[0].passed).toBe(false);
    expect(results[0].gate).toBe('health_check');
  });

  it('checkAll handles multiple gates independently', async () => {
    const results = await checker.checkAll(
      [
        { type: 'test_pass' },
        { type: 'rollback_available' },
      ],
      emptyStepResult,
      '/tmp',
    );
    expect(results).toHaveLength(2);
    // Each gate should be checked even if others fail
    expect(results.every((r) => r.gate !== undefined)).toBe(true);
  });

  it('uses rule cwd when specified', async () => {
    const results = await checker.checkAll(
      [{ type: 'test_pass', cwd: '/nonexistent/custom/path' }],
      emptyStepResult,
      '/tmp',
    );
    expect(results).toHaveLength(1);
    expect(results[0].passed).toBe(false);
  });
});
