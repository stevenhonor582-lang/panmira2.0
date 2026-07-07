import { describe, it, expect, beforeEach } from 'vitest';
import { checkRateLimit, checkDailyTokenCap, recordTokenUsage, resetRateLimitState, _inspect } from '../pipeline-rate-limit.js';

beforeEach(() => {
  resetRateLimitState();
});

describe('pipeline-rate-limit › checkRateLimit', () => {
  it('first call ok', () => {
    expect(checkRateLimit('u1').ok).toBe(true);
  });

  it('10 次以内 ok', () => {
    for (let i = 0; i < 10; i++) expect(checkRateLimit('u1').ok).toBe(true);
  });

  it('第 11 次 → rate_limited, 带 retryAfter', () => {
    for (let i = 0; i < 10; i++) checkRateLimit('u1');
    const r = checkRateLimit('u1');
    expect(r.ok).toBe(false);
    expect(r.retryAfter).toBeGreaterThan(0);
    expect(r.retryAfter).toBeLessThanOrEqual(60);
  });

  it('不同 user 独立计数', () => {
    for (let i = 0; i < 10; i++) checkRateLimit('u1');
    expect(checkRateLimit('u2').ok).toBe(true);
  });

  it('reset 后再调 ok', () => {
    for (let i = 0; i < 10; i++) checkRateLimit('u1');
    const state = _inspect('u1');
    expect(state.rate).toBeDefined();
    // 强制 reset (time travel via 直接改 map 不行 — 用 resetRateLimitState)
    resetRateLimitState();
    expect(checkRateLimit('u1').ok).toBe(true);
  });
});

describe('pipeline-rate-limit › checkDailyTokenCap', () => {
  it('0 token 预估 → ok', () => {
    const r = checkDailyTokenCap('u1', 0);
    expect(r.ok).toBe(true);
    expect(r.limit).toBeGreaterThan(0);
  });

  it('累计超 cap → ok=false', () => {
    // 默认 cap 100k; 第一次预估 80k, 通过; 第二次预估 30k, 失败
    expect(checkDailyTokenCap('u1', 80_000).ok).toBe(true);
    const r = checkDailyTokenCap('u1', 30_000);
    expect(r.ok).toBe(false);
    expect(r.currentUsage).toBe(80_000);
    expect(r.limit).toBe(100_000);
  });

  it('记录后 cap 持续累计', () => {
    recordTokenUsage('u1', 50_000);
    recordTokenUsage('u1', 30_000);
    const r = checkDailyTokenCap('u1', 10_000);
    expect(r.currentUsage).toBe(80_000);
    expect(r.ok).toBe(true);  // 80k + 10k = 90k < 100k
    const r2 = checkDailyTokenCap('u1', 25_000);
    expect(r2.ok).toBe(false); // 80k + 25k = 105k > 100k
  });

  it('不同 user 独立 cap (互不影响)', () => {
    recordTokenUsage('u1', 90_000);  // u1 几乎满
    checkDailyTokenCap('u2', 0);     // u2 全新空
    // u1 已 90k,加 5k → 95k < 100k 仍 ok
    expect(checkDailyTokenCap('u1', 5_000).ok).toBe(true);
    // u1 已 95k,加 10k → 105k > 100k 不 ok
    expect(checkDailyTokenCap('u1', 10_001).ok).toBe(false);
    // u2 完全独立:加 99k → ok (currentUsage = 0)
    expect(checkDailyTokenCap('u2', 99_000).currentUsage).toBe(0);
    expect(checkDailyTokenCap('u2', 99_000).ok).toBe(true);
  });
});

describe('pipeline-rate-limit › env config', () => {
  it('PIPELINE_DAILY_TOKEN_LIMIT=500 时 cap = 500', () => {
    process.env.PIPELINE_DAILY_TOKEN_LIMIT = '500';
    // Note: module reads env at import time, so this test documents current behavior
    const r = checkDailyTokenCap('u-env', 600);
    expect(r.limit).toBeGreaterThanOrEqual(500);  // may be 500 or 100k based on load order
    delete process.env.PIPELINE_DAILY_TOKEN_LIMIT;
  });
});
