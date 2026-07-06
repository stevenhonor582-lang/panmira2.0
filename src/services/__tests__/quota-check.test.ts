import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../db/index.js', () => {
  const selectChain = {
    from: () => selectChain,
    where: async () => [],
    limit: async () => [],
  };
  return {
    db: { select: () => selectChain },
    pool: { query: vi.fn() },
  };
});

import { checkQuota, QuotaExceeded } from '../quota-check.ts';
import { pool } from '../../db/index.js';

describe('checkQuota', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (pool.query as any).mockResolvedValue({ rows: [{ used: 0 }] });
  });

  it('无 quota → allowed', async () => {
    const r = await checkQuota('t1', 'token', 1);
    expect(r.allowed).toBe(true);
    expect(r.limit).toBe(Infinity);
  });

  it('quota under limit → allowed', async () => {
    // Mock DB select 返回一个有 quota
    const { db } = await import('../../db/index.js');
    (db.select as any) = () => ({
      from: () => ({
        where: async () => [{ id: 'q1', tenantId: 't1', dimension: 'token', period: 'daily', limitValue: 100, enabled: true }],
      }),
    });
    (pool.query as any).mockResolvedValue({ rows: [{ used: 30 }] });
    const r = await checkQuota('t1', 'token', 5);
    expect(r.allowed).toBe(true);
    expect(r.used).toBe(30);
    expect(r.remaining).toBe(70);
  });

  it('quota over limit → throws QuotaExceeded', async () => {
    const { db } = await import('../../db/index.js');
    (db.select as any) = () => ({
      from: () => ({
        where: async () => [{ id: 'q1', tenantId: 't1', dimension: 'token', period: 'daily', limitValue: 100, enabled: true }],
      }),
    });
    (pool.query as any).mockResolvedValue({ rows: [{ used: 99 }] });
    await expect(checkQuota('t1', 'token', 5)).rejects.toThrow(QuotaExceeded);
  });

  it('quota at exact limit → not allowed for additional', async () => {
    const { db } = await import('../../db/index.js');
    (db.select as any) = () => ({
      from: () => ({
        where: async () => [{ id: 'q1', tenantId: 't1', dimension: 'token', period: 'daily', limitValue: 10, enabled: true }],
      }),
    });
    (pool.query as any).mockResolvedValue({ rows: [{ used: 10 }] });
    await expect(checkQuota('t1', 'token', 1)).rejects.toThrow(QuotaExceeded);
  });

  it('QuotaExceeded 含正确字段', async () => {
    const e = new QuotaExceeded('token', 100, 150, 'daily', '2026-07-07T00:00:00Z');
    expect(e.dimension).toBe('token');
    expect(e.limit).toBe(100);
    expect(e.used).toBe(150);
    expect(e.period).toBe('daily');
  });

  it('5 dimension 都能查 (不抛其他错)', async () => {
    for (const d of ['token', 'skill', 'mcp', 'channel', 'knowledge'] as const) {
      const r = await checkQuota('t1', d, 1);
      expect(r.dimension).toBe(d);
    }
  });
});
