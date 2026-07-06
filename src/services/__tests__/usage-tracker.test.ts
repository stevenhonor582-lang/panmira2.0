import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../db/index.js', () => ({
  pool: {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 1 }),
  },
  db: {},
}));

import { recordUsage, recordTokenUsage, recordSkillUsage, recordMcpUsage, recordChannelUsage, recordKnowledgeUsage, DIMENSIONS } from '../usage-tracker.ts';
import { pool } from '../../db/index.js';

describe('usage-tracker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (pool.query as any).mockResolvedValue({ rows: [], rowCount: 1 });
  });

  it('recordUsage 写一条', async () => {
    await recordUsage({
      tenantId: 't1',
      dimension: 'token',
      dimensionKey: 'client-1',
    });
    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = (pool.query as any).mock.calls[0];
    expect(sql).toContain('INSERT INTO usage_reports');
    expect(sql).toContain('ON CONFLICT');
    expect(params[0]).toBe('t1');
    expect(params[1]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(params[2]).toBe('token');
    expect(params[3]).toBe('client-1');
    expect(params[4]).toBe(1);
  });

  it('recordUsage 自定义 count + date', async () => {
    await recordUsage({
      tenantId: 't1',
      dimension: 'skill',
      dimensionKey: 'skill-x',
      count: 5,
      date: '2026-07-01',
    });
    const [, params] = (pool.query as any).mock.calls[0];
    expect(params[4]).toBe(5);
    expect(params[1]).toBe('2026-07-01');
  });

  it('recordUsage 缺 tenantId 不写', async () => {
    await recordUsage({
      tenantId: '',
      dimension: 'token',
      dimensionKey: 'k',
    });
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('recordUsage 缺 dimensionKey 不写', async () => {
    await recordUsage({
      tenantId: 't1',
      dimension: 'token',
      dimensionKey: '',
    });
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('recordUsage 无效 dimension 不写', async () => {
    await recordUsage({
      tenantId: 't1',
      dimension: 'invalid' as any,
      dimensionKey: 'k',
    });
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('recordUsage 异常被吞掉', async () => {
    (pool.query as any).mockRejectedValue(new Error('db down'));
    await expect(recordUsage({ tenantId: 't1', dimension: 'token', dimensionKey: 'k' })).resolves.toBeUndefined();
  });

  it('5 个 helper 各自调用 recordUsage', () => {
    recordTokenUsage('t1', 'k1');
    recordSkillUsage('t1', 'k2');
    recordMcpUsage('t1', 'k3');
    recordChannelUsage('t1', 'k4');
    recordKnowledgeUsage('t1', 'k5');
    // fire-and-forget,等 50ms 让 async 完成
    return new Promise((resolve) => setTimeout(resolve, 50)).then(() => {
      expect(pool.query).toHaveBeenCalledTimes(5);
    });
  });

  it('DIMENSIONS 含 5 类', () => {
    expect(DIMENSIONS.length).toBe(5);
    expect(DIMENSIONS).toContain('token');
    expect(DIMENSIONS).toContain('skill');
    expect(DIMENSIONS).toContain('mcp');
    expect(DIMENSIONS).toContain('channel');
    expect(DIMENSIONS).toContain('knowledge');
  });
});
