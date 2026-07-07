import { describe, it, expect } from 'vitest';
import { parseRetryPolicy, RetryPolicySchema } from '../pipeline-routes.js';

describe('RetryPolicySchema (L8 retry policy UI)', () => {
  describe('parseRetryPolicy happy path', () => {
    it('undefined → 默认值 { maxAttempts: 1, backoffMs: 1000 }', () => {
      const r = parseRetryPolicy(undefined);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toEqual({ maxAttempts: 1, backoffMs: 1000 });
    });

    it('null → 默认值', () => {
      const r = parseRetryPolicy(null);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toEqual({ maxAttempts: 1, backoffMs: 1000 });
    });

    it('合法值 { maxAttempts: 3, backoffMs: 500 } → 原样通过', () => {
      const r = parseRetryPolicy({ maxAttempts: 3, backoffMs: 500 });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toEqual({ maxAttempts: 3, backoffMs: 500 });
    });

    it('部分字段缺失 → 用 default 补全', () => {
      const r = parseRetryPolicy({ maxAttempts: 5 });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toEqual({ maxAttempts: 5, backoffMs: 1000 });
    });

    it('边界值 maxAttempts=1, backoffMs=0 合法', () => {
      const r = parseRetryPolicy({ maxAttempts: 1, backoffMs: 0 });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toEqual({ maxAttempts: 1, backoffMs: 0 });
    });

    it('边界值 maxAttempts=10, backoffMs=60000 合法', () => {
      const r = parseRetryPolicy({ maxAttempts: 10, backoffMs: 60000 });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toEqual({ maxAttempts: 10, backoffMs: 60000 });
    });
  });

  describe('parseRetryPolicy failure path', () => {
    it('maxAttempts=0 → 拒绝 (min 1)', () => {
      const r = parseRetryPolicy({ maxAttempts: 0, backoffMs: 100 });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors[0]).toMatch(/maxAttempts/);
    });

    it('maxAttempts=11 → 拒绝 (max 10)', () => {
      const r = parseRetryPolicy({ maxAttempts: 11, backoffMs: 100 });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors[0]).toMatch(/maxAttempts/);
    });

    it('maxAttempts=2.5 → 拒绝 (必须整数)', () => {
      const r = parseRetryPolicy({ maxAttempts: 2.5, backoffMs: 100 });
      expect(r.ok).toBe(false);
    });

    it('backoffMs=-1 → 拒绝 (min 0)', () => {
      const r = parseRetryPolicy({ maxAttempts: 3, backoffMs: -1 });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors[0]).toMatch(/backoffMs/);
    });

    it('backoffMs=60001 → 拒绝 (max 60000)', () => {
      const r = parseRetryPolicy({ maxAttempts: 3, backoffMs: 60001 });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors[0]).toMatch(/backoffMs/);
    });

    it('未知字段 unknown → 拒绝 (.strict)', () => {
      const r = parseRetryPolicy({ maxAttempts: 3, backoffMs: 100, foo: 'bar' });
      expect(r.ok).toBe(false);
    });

    it('maxAttempts="3" (string) → 拒绝 (必须是 number)', () => {
      const r = parseRetryPolicy({ maxAttempts: '3', backoffMs: 100 });
      expect(r.ok).toBe(false);
    });
  });

  describe('RetryPolicySchema raw zod', () => {
    it('schema defaults 是 1 / 1000', () => {
      const r = RetryPolicySchema.parse({});
      expect(r).toEqual({ maxAttempts: 1, backoffMs: 1000 });
    });

    it('schema 拒绝 unknown field', () => {
      expect(() => RetryPolicySchema.parse({ maxAttempts: 1, backoffMs: 1, evil: true })).toThrow();
    });
  });
});
