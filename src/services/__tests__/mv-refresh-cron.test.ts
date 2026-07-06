import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../db/index.js', () => ({
  pool: { query: vi.fn().mockResolvedValue({ rows: [] }) },
}));

import { startMvRefreshCron, stopMvRefreshCron, refreshOnce } from '../mv-refresh-cron.ts';
import { pool } from '../../db/index.js';

describe('mv-refresh-cron', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (pool.query as any).mockResolvedValue({ rows: [] });
  });
  afterEach(() => {
    stopMvRefreshCron();
  });

  it('startMvRefreshCron 返回 timer', () => {
    const t = startMvRefreshCron();
    expect(t).toBeDefined();
    expect(typeof t).toBe('object'); // NodeJS.Timeout
  });

  it('stopMvRefreshCron 清理 timer', () => {
    const t = startMvRefreshCron(60_000);
    stopMvRefreshCron(t);
    expect((t as any)._destroyed).toBe(true);
  });

  it('refreshOnce 调 SQL 函数', async () => {
    await refreshOnce();
    expect(pool.query).toHaveBeenCalledWith('SELECT refresh_daily_usage()');
  });

  it('refreshOnce 错误吞掉', async () => {
    (pool.query as any).mockRejectedValue(new Error('db down'));
    await expect(refreshOnce()).resolves.toBeUndefined();
  });

  it('重复 refreshOnce 并发安全 (前者未完时后者跳过)', async () => {
    let resolveFirst: any;
    (pool.query as any).mockReturnValue(new Promise((r) => { resolveFirst = r; }));
    const p1 = refreshOnce();
    const p2 = refreshOnce(); // 应该直接 return (isRefreshing=true)
    resolveFirst({ rows: [] });
    await Promise.all([p1, p2]);
    // 第二次调用应跳过,query 只调 1 次
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it('自定义 intervalMs', () => {
    const t = startMvRefreshCron(100);
    expect(t).toBeDefined();
    stopMvRefreshCron(t);
  });
});
