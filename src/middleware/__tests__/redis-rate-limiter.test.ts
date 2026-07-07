import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  checkRedisRateLimit,
  checkRedisDailyTokenCap,
  recordRedisTokenUsage,
  utcDay,
  resetRedisRateLimitForTests,
} from '../redis-rate-limiter.js';
import { getRedisClient, _resetRedisClientForTests, redisAvailable } from '../redis-client.js';

/**
 * Live-Redis tests. Run against a real Redis (mah has redis://localhost:6379).
 * Skipped automatically when DISABLE_REDIS_RATE_LIMIT=1.
 */

const USER_PREFIX = `redis-rl-test-${Date.now()}-`;
const u = (n: number) => `${USER_PREFIX}${n}`;

beforeAll(async () => {
  // Force a clean client (in case previous test runs left one dangling).
  _resetRedisClientForTests();
  const c = await getRedisClient();
  if (!c) {
    throw new Error(
      'Redis unreachable for tests. Start redis-server or set DISABLE_REDIS_RATE_LIMIT=1.',
    );
  }
  // Smoke check
  const pong = await c.ping();
  expect(pong).toBe('PONG');
});

afterAll(async () => {
  // Clean up all keys we wrote
  const c = await getRedisClient();
  if (c) {
    const keys: string[] = [];
    for (let i = 0; i < 20; i++) {
      keys.push(`rl:rate:${u(i)}`);
      const day = utcDay();
      keys.push(`rl:tokens:${u(i)}:${day}`);
    }
    try { await c.del(keys); } catch { /* ignore */ }
  }
  _resetRedisClientForTests();
});

beforeEach(() => {
  // Each test gets a fresh user namespace to avoid bucket collisions.
  if (!redisAvailable()) {
    throw new Error('Redis went unavailable mid-suite');
  }
});

describe('redis-rate-limiter › checkRedisRateLimit', () => {
  it('first call: count=1, ok=true', async () => {
    const userId = u(1);
    await resetRedisRateLimitForTests(userId);
    const r = await checkRedisRateLimit(userId, 5, 60_000);
    expect(r.ok).toBe(true);
    expect(r.count).toBe(1);
    expect(r.limit).toBe(5);
    expect(r.retryAfter).toBeGreaterThan(0);
    expect(r.retryAfter).toBeLessThanOrEqual(60);
  });

  it('limit-1 calls ok, N+1 → ok=false with retryAfter', async () => {
    const userId = u(2);
    await resetRedisRateLimitForTests(userId);
    for (let i = 0; i < 3; i++) {
      const r = await checkRedisRateLimit(userId, 3, 60_000);
      expect(r.ok).toBe(true);
    }
    const r = await checkRedisRateLimit(userId, 3, 60_000);
    expect(r.ok).toBe(false);
    expect(r.count).toBe(4);
    expect(r.retryAfter).toBeGreaterThan(0);
  });

  it('key has TTL set (no key leak)', async () => {
    const userId = u(3);
    await resetRedisRateLimitForTests(userId);
    await checkRedisRateLimit(userId, 5, 60_000);
    const c = await getRedisClient();
    expect(c).not.toBeNull();
    const ttl = await c!.ttl(`rl:rate:${userId}`);
    // -1 (no TTL) would be a bug. -2 (no key) is also wrong.
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60);
  });

  it('window expires → counter resets (verified via TTL bounds)', async () => {
    const userId = u(4);
    await resetRedisRateLimitForTests(userId);
    // 100ms window
    await checkRedisRateLimit(userId, 5, 100);
    const c = await getRedisClient();
    const ttl = await c!.ttl(`rl:rate:${userId}`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(1); // 100ms rounds up to 1s
    // Wait for window to expire, then verify key is gone (server-side TTL).
    await new Promise((r) => setTimeout(r, 1500));
    const v = await c!.get(`rl:rate:${userId}`);
    expect(v).toBeNull();
  });
});

describe('redis-rate-limiter › checkRedisDailyTokenCap', () => {
  it('first check with prospective=0: currentUsage=0, ok=true', async () => {
    const userId = u(10);
    await resetRedisRateLimitForTests(userId);
    const r = await checkRedisDailyTokenCap(userId, 0, 50_000);
    expect(r.ok).toBe(true);
    expect(r.currentUsage).toBe(0);
    expect(r.limit).toBe(50_000);
  });

  it('does NOT record usage (read-only)', async () => {
    const userId = u(11);
    await resetRedisRateLimitForTests(userId);
    await checkRedisDailyTokenCap(userId, 30_000, 50_000);
    await checkRedisDailyTokenCap(userId, 30_000, 50_000);
    const r = await checkRedisDailyTokenCap(userId, 0, 50_000);
    // If check were recording, second call would have seen 30k. Read-only: stays 0.
    expect(r.currentUsage).toBe(0);
  });

  it('cap exceeded: ok=false', async () => {
    const userId = u(12);
    await resetRedisRateLimitForTests(userId);
    await recordRedisTokenUsage(userId, 45_000);
    const r = await checkRedisDailyTokenCap(userId, 10_000, 50_000);
    expect(r.ok).toBe(false);
    expect(r.currentUsage).toBe(45_000);
    expect(r.limit).toBe(50_000);
  });

  it('cap ok when within limit', async () => {
    const userId = u(13);
    await resetRedisRateLimitForTests(userId);
    await recordRedisTokenUsage(userId, 40_000);
    const r = await checkRedisDailyTokenCap(userId, 5_000, 50_000);
    expect(r.ok).toBe(true);
    expect(r.currentUsage).toBe(40_000);
  });
});

describe('redis-rate-limiter › recordRedisTokenUsage', () => {
  it('increments atomically', async () => {
    const userId = u(20);
    await resetRedisRateLimitForTests(userId);
    await recordRedisTokenUsage(userId, 10_000);
    await recordRedisTokenUsage(userId, 15_000);
    const r = await checkRedisDailyTokenCap(userId, 0, 50_000);
    expect(r.currentUsage).toBe(25_000);
  });

  it('zero/negative tokens are no-ops', async () => {
    const userId = u(21);
    await resetRedisRateLimitForTests(userId);
    await recordRedisTokenUsage(userId, 0);
    await recordRedisTokenUsage(userId, -100);
    const r = await checkRedisDailyTokenCap(userId, 0, 50_000);
    expect(r.currentUsage).toBe(0);
  });

  it('key has TTL aligned to end of UTC day + 1h', async () => {
    const userId = u(22);
    await resetRedisRateLimitForTests(userId);
    await recordRedisTokenUsage(userId, 1_000);
    const c = await getRedisClient();
    const day = utcDay();
    const ttl = await c!.ttl(`rl:tokens:${userId}:${day}`);
    // Should be between 1h and 25h (UTC day boundary + 1h buffer).
    expect(ttl).toBeGreaterThan(3600);
    expect(ttl).toBeLessThanOrEqual(90_000); // 25h
  });
});

describe('redis-rate-limiter › utcDay', () => {
  it('returns YYYYMMDD string', () => {
    const d = utcDay(Date.UTC(2026, 6, 7, 12, 0, 0)); // July = month 6
    expect(d).toBe('20260707');
  });
  it('pads single-digit month/day', () => {
    const d = utcDay(Date.UTC(2026, 0, 5, 0, 0, 0)); // Jan 5
    expect(d).toBe('20260105');
  });
});

describe('redis-rate-limiter › DISABLE_REDIS_RATE_LIMIT=1', () => {
  it('getRedisClient returns null when disabled', async () => {
    const prev = process.env.DISABLE_REDIS_RATE_LIMIT;
    process.env.DISABLE_REDIS_RATE_LIMIT = '1';
    try {
      _resetRedisClientForTests();
      const c = await getRedisClient();
      expect(c).toBeNull();
      expect(redisAvailable()).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.DISABLE_REDIS_RATE_LIMIT;
      else process.env.DISABLE_REDIS_RATE_LIMIT = prev;
      _resetRedisClientForTests();
      // Re-establish connection for any later tests in this file
      await getRedisClient();
    }
  });
});
