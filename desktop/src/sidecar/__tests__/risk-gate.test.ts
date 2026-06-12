import { describe, it, expect, vi } from 'vitest';
import { RiskGate } from '../risk-gate';

describe('RiskGate', () => {
  it('blocks login when quality FAILS', async () => {
    const quality = { review: vi.fn(async () => ({ verdict: 'FAIL' as const, issues: ['bad domain'] })) };
    const confirm = vi.fn(async () => true);
    const gate = new RiskGate(quality, confirm);

    await expect(
      gate.guard({ action: 'browser_login', target: 'evil.com' }, async () => 'ok')
    ).rejects.toThrow(/Quality check failed/);
  });

  it('requires user confirm even when quality PASSes', async () => {
    const quality = { review: vi.fn(async () => ({ verdict: 'PASS' as const, issues: [] })) };
    const confirm = vi.fn(async () => false);
    const gate = new RiskGate(quality, confirm);

    await expect(
      gate.guard({ action: 'browser_publish', target: 'alibaba' }, async () => 'ok')
    ).rejects.toThrow(/User denied/);
  });

  it('executes action when quality PASSes and user confirms', async () => {
    const quality = { review: vi.fn(async () => ({ verdict: 'PASS' as const, issues: [] })) };
    const confirm = vi.fn(async () => true);
    const gate = new RiskGate(quality, confirm);
    const action = vi.fn(async () => 'published');

    const result = await gate.guard({ action: 'browser_publish', target: 'alibaba' }, action);
    expect(result).toBe('published');
    expect(quality.review).toHaveBeenCalled();
    expect(confirm).toHaveBeenCalled();
  });
});
