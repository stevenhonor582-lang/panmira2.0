import { describe, it, expect, beforeEach } from 'vitest';
import {
  checkRateLimit,
  checkDailyTokenCap,
  recordTokenUsage,
  resetRateLimitState,
  _inspect,
  setOverride,
  clearOverride,
  getOverride,
} from '../pipeline-rate-limit.js';

beforeEach(() => {
  resetRateLimitState();
});

describe('pipeline-rate-limit › checkRateLimit', () => {
  it('first call ok', () => {
    expect(checkRateLimit('u1').ok).toBe(true);
  });

  it('5 次以内 ok (L4 收紧后默认 5/min)', () => {
    for (let i = 0; i < 5; i++) expect(checkRateLimit('u1').ok).toBe(true);
  });

  it('第 6 次 → rate_limited, 带 retryAfter (L4 收紧后)', () => {
    for (let i = 0; i < 5; i++) checkRateLimit('u1');
    const r = checkRateLimit('u1');
    expect(r.ok).toBe(false);
    expect(r.retryAfter).toBeGreaterThan(0);
    expect(r.retryAfter).toBeLessThanOrEqual(60);
  });

  it('不同 user 独立计数', () => {
    for (let i = 0; i < 5; i++) checkRateLimit('u1');
    expect(checkRateLimit('u2').ok).toBe(true);
  });

  it('reset 后再调 ok', () => {
    for (let i = 0; i < 5; i++) checkRateLimit('u1');
    const state = _inspect('u1');
    expect(state.rate).toBeDefined();
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

  it('累计超 cap → ok=false (L4 收紧后默认 50k)', () => {
    expect(checkDailyTokenCap('u1', 40_000).ok).toBe(true);
    const r = checkDailyTokenCap('u1', 20_000);
    expect(r.ok).toBe(false);
    expect(r.currentUsage).toBe(40_000);
    expect(r.limit).toBe(50_000);
  });

  it('记录后 cap 持续累计 (50k 默认)', () => {
    recordTokenUsage('u1', 25_000);
    recordTokenUsage('u1', 15_000);
    const r = checkDailyTokenCap('u1', 5_000);
    expect(r.currentUsage).toBe(40_000);
    expect(r.ok).toBe(true);
    const r2 = checkDailyTokenCap('u1', 15_000);
    expect(r2.ok).toBe(false);
  });

  it('不同 user 独立 cap (互不影响, 50k 默认)', () => {
    recordTokenUsage('u1', 45_000);
    checkDailyTokenCap('u2', 0);
    expect(checkDailyTokenCap('u1', 4_000).ok).toBe(true);
    expect(checkDailyTokenCap('u1', 5_001).ok).toBe(false);
    expect(checkDailyTokenCap('u2', 49_000).currentUsage).toBe(0);
    expect(checkDailyTokenCap('u2', 49_000).ok).toBe(true);
  });
});

describe('pipeline-rate-limit › L4 默认值 (新加)', () => {
  it('默认 5/min (L4 收紧)', () => {
    const r = checkRateLimit('u-default-5');
    expect(r.ok).toBe(true);
    expect(r.limit).toBe(5);
    for (let i = 0; i < 4; i++) checkRateLimit('u-default-5');
    expect(checkRateLimit('u-default-5').ok).toBe(false);
  });

  it('默认 50k tokens/day (L4 收紧)', () => {
    const r = checkDailyTokenCap('u-default-tok', 0);
    expect(r.limit).toBe(50_000);
    expect(checkDailyTokenCap('u-default-tok', 50_001).ok).toBe(false);
  });
});

describe('pipeline-rate-limit › per-user override (L4 新加)', () => {
  it('setOverride 后 checkRateLimit 走 override 值', () => {
    setOverride('u-ovr', 100, 200_000);
    for (let i = 0; i < 100; i++) {
      const r = checkRateLimit('u-ovr');
      expect(r.ok).toBe(true);
    }
    expect(checkRateLimit('u-ovr').ok).toBe(false);
    const r = checkRateLimit('u-ovr');
    expect(r.limit).toBe(100);
  });

  it('setOverride 后 checkDailyTokenCap 走 override 值', () => {
    setOverride('u-ovr-tok', 5, 200_000);
    expect(checkDailyTokenCap('u-ovr-tok', 150_000).ok).toBe(true);
    expect(checkDailyTokenCap('u-ovr-tok', 60_000).ok).toBe(false);
    const r = checkDailyTokenCap('u-ovr-tok', 0);
    expect(r.limit).toBe(200_000);
  });

  it('clearOverride 后回 default (5/min, 50k)', () => {
    setOverride('u-clear', 100, 200_000);
    expect(getOverride('u-clear')).toBeDefined();
    const cleared = clearOverride('u-clear');
    expect(cleared).toBe(true);
    expect(getOverride('u-clear')).toBeUndefined();
    for (let i = 0; i < 5; i++) checkRateLimit('u-clear');
    expect(checkRateLimit('u-clear').ok).toBe(false);
    const r = checkDailyTokenCap('u-clear', 50_001);
    expect(r.ok).toBe(false);
  });

  it('override 互不影响其他 user', () => {
    setOverride('u-a', 100, 200_000);
    for (let i = 0; i < 5; i++) checkRateLimit('u-b');
    expect(checkRateLimit('u-b').ok).toBe(false);
    expect(checkRateLimit('u-a').ok).toBe(true);
  });

  it('setOverride 接受 null / 0 等无效值时跳过该字段', () => {
    setOverride('u-partial', 0 as unknown as number, 200_000);
    const r = checkRateLimit('u-partial');
    expect(r.limit).toBe(5);
    const t = checkDailyTokenCap('u-partial', 0);
    expect(t.limit).toBe(200_000);
  });
});
