import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the DB pool so the persistence layer can be exercised without a real DB.
vi.mock('../../db/index.js', () => ({
  pool: {
    query: vi.fn(),
  },
}));

import { pool } from '../../db/index.js';
import {
  checkRateLimit,
  checkDailyTokenCap,
  recordTokenUsage,
  resetRateLimitState,
  _inspect,
  loadFromDb,
  flushToDb,
  startPersistence,
  stopPersistence,
  _setDb,
  _dirtySize,
} from '../pipeline-rate-limit.js';

beforeEach(() => {
  resetRateLimitState();
});

describe('pipeline-rate-limit > checkRateLimit', () => {
  it('first call ok', () => {
    expect(checkRateLimit('u1').ok).toBe(true);
  });

  it('10 ci yinei ok', () => {
    for (let i = 0; i < 10; i++) expect(checkRateLimit('u1').ok).toBe(true);
  });

  it('11th call -> rate_limited, with retryAfter', () => {
    for (let i = 0; i < 10; i++) checkRateLimit('u1');
    const r = checkRateLimit('u1');
    expect(r.ok).toBe(false);
    expect(r.retryAfter).toBeGreaterThan(0);
    expect(r.retryAfter).toBeLessThanOrEqual(60);
  });

  it('different users counted independently', () => {
    for (let i = 0; i < 10; i++) checkRateLimit('u1');
    expect(checkRateLimit('u2').ok).toBe(true);
  });

  it('ok after reset', () => {
    for (let i = 0; i < 10; i++) checkRateLimit('u1');
    const state = _inspect('u1');
    expect(state.rate).toBeDefined();
    resetRateLimitState();
    expect(checkRateLimit('u1').ok).toBe(true);
  });
});

describe('pipeline-rate-limit > checkDailyTokenCap', () => {
  it('0 token estimate -> ok', () => {
    const r = checkDailyTokenCap('u1', 0);
    expect(r.ok).toBe(true);
    expect(r.limit).toBeGreaterThan(0);
  });

  it('cumulative over cap -> ok=false', () => {
    expect(checkDailyTokenCap('u1', 80_000).ok).toBe(true);
    const r = checkDailyTokenCap('u1', 30_000);
    expect(r.ok).toBe(false);
    expect(r.currentUsage).toBe(80_000);
    expect(r.limit).toBe(100_000);
  });

  it('cap accumulates after record', () => {
    recordTokenUsage('u1', 50_000);
    recordTokenUsage('u1', 30_000);
    const r = checkDailyTokenCap('u1', 10_000);
    expect(r.currentUsage).toBe(80_000);
    expect(r.ok).toBe(true);
    const r2 = checkDailyTokenCap('u1', 25_000);
    expect(r2.ok).toBe(false);
  });

  it('different users cap independently', () => {
    recordTokenUsage('u1', 90_000);
    checkDailyTokenCap('u2', 0);
    expect(checkDailyTokenCap('u1', 5_000).ok).toBe(true);
    expect(checkDailyTokenCap('u1', 10_001).ok).toBe(false);
    expect(checkDailyTokenCap('u2', 99_000).currentUsage).toBe(0);
    expect(checkDailyTokenCap('u2', 99_000).ok).toBe(true);
  });
});

describe('pipeline-rate-limit > env config', () => {
  it('PIPELINE_DAILY_TOKEN_LIMIT=500 cap is 500', () => {
    process.env.PIPELINE_DAILY_TOKEN_LIMIT = '500';
    const r = checkDailyTokenCap('u-env', 600);
    expect(r.limit).toBeGreaterThanOrEqual(500);
    delete process.env.PIPELINE_DAILY_TOKEN_LIMIT;
  });
});

// --- L4 #3: DB persistence tests ---

describe('pipeline-rate-limit > DB persistence (L4 #3) > fail-open', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _setDb(pool as any);
  });

  it('DB unavailable: in-memory still works (fail-open)', async () => {
    (pool.query as any).mockRejectedValue(new Error('connection refused'));

    expect(checkRateLimit('u-fo').ok).toBe(true);
    expect(checkRateLimit('u-fo').ok).toBe(true);
    expect(checkDailyTokenCap('u-fo', 100).ok).toBe(true);
    recordTokenUsage('u-fo', 500);

    const loaded = await loadFromDb();
    expect(loaded).toBe(0);

    const written = await flushToDb();
    expect(written).toBe(0);

    const state = _inspect('u-fo');
    expect(state.rate).toBeDefined();
    expect(state.tokens).toBeDefined();
  });

  it('startup loads state from DB (loadFromDb fills in-memory)', async () => {
    const future = Date.now() + 30 * 60 * 1000;
    const futureDay = Date.now() + 12 * 60 * 60 * 1000;
    (pool.query as any).mockResolvedValue({
      rows: [
        {
          user_id: 'u-load-a',
          rate_count: 3,
          rate_reset_at: new Date(future),
          tokens_used: 25_000,
          tokens_reset_at: new Date(futureDay),
        },
        {
          user_id: 'u-load-b',
          rate_count: 1,
          rate_reset_at: new Date(future),
          tokens_used: 0,
          tokens_reset_at: new Date(futureDay),
        },
      ],
      rowCount: 2,
    });

    const loaded = await loadFromDb();
    expect(loaded).toBe(2);

    const a = _inspect('u-load-a');
    expect(a.rate).toBeDefined();
    expect(a.rate!.count).toBe(3);
    expect(checkRateLimit('u-load-a').ok).toBe(true);
    expect(_inspect('u-load-a').rate!.count).toBe(4);

    expect(a.tokens).toBeDefined();
    expect(a.tokens!.tokens).toBe(25_000);

    const b = _inspect('u-load-b');
    expect(b.rate!.count).toBe(1);
  });

  it('loadFromDb skips expired buckets', async () => {
    const past = Date.now() - 1000;
    (pool.query as any).mockResolvedValue({
      rows: [
        {
          user_id: 'u-stale',
          rate_count: 99,
          rate_reset_at: new Date(past),
          tokens_used: 50_000,
          tokens_reset_at: new Date(past),
        },
      ],
      rowCount: 1,
    });

    await loadFromDb();
    const state = _inspect('u-stale');
    expect(state.rate).toBeUndefined();
    expect(state.tokens).toBeUndefined();
  });

  it('periodic flush writes DB via INSERT ... ON CONFLICT', async () => {
    (pool.query as any).mockResolvedValue({ rows: [], rowCount: 1 });

    checkRateLimit('u-flush-a');
    checkRateLimit('u-flush-b');
    recordTokenUsage('u-flush-a', 1000);
    expect(_dirtySize()).toBe(2);

    const written = await flushToDb();
    expect(written).toBe(2);
    expect(_dirtySize()).toBe(0);

    expect(pool.query).toHaveBeenCalledTimes(2);
    const sql = (pool.query as any).mock.calls[0][0] as string;
    expect(sql).toContain('INSERT INTO rate_limit_state');
    expect(sql).toContain('ON CONFLICT (user_id) DO UPDATE');
  });

  it('flush failure keeps dirty set for next retry', async () => {
    (pool.query as any).mockRejectedValue(new Error('db down'));

    checkRateLimit('u-retry');
    expect(_dirtySize()).toBe(1);

    const written = await flushToDb();
    expect(written).toBe(0);
    expect(_dirtySize()).toBe(1);
  });

  it('startPersistence / stopPersistence lifecycle is idempotent', () => {
    startPersistence(1000);
    startPersistence(1000);
    stopPersistence();
    checkRateLimit('u-life');
    expect(_dirtySize()).toBe(1);
  });
});

describe('pipeline-rate-limit > DB persistence (L4 #3) > no-db fallback', () => {
  afterEach(() => {
    _setDb(null);
  });

  it('no DB: loadFromDb / flushToDb silently no-op (return 0)', async () => {
    _setDb(null);
    const prev = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;

    checkRateLimit('u-nodb');
    const loaded = await loadFromDb();
    const written = await flushToDb();
    expect(loaded).toBe(0);
    expect(written).toBe(0);

    if (prev !== undefined) process.env.DATABASE_URL = prev;
  });
});
