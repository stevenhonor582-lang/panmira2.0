import { describe, it, expect, beforeEach } from 'vitest';
import { handleAdminRateLimitRoutes } from '../admin-ratelimit-routes.ts';
import {
  setOverride,
  clearOverride,
  getOverride,
  _inspect,
  resetRateLimitState,
  checkRateLimit,
  checkDailyTokenCap,
} from '../../../middleware/pipeline-rate-limit.js';
import type http from 'node:http';

function mockReqRes(method: string, url: string): { req: http.IncomingMessage; res: http.ServerResponse } {
  const req = { method, url, headers: {} } as http.IncomingMessage;
  const res = { statusCode: 200, setHeader: () => {}, writeHead: () => {}, end: () => {} } as unknown as http.ServerResponse;
  return { req, res };
}

beforeEach(() => {
  resetRateLimitState();
});

describe('handleAdminRateLimitRoutes dispatch', () => {
  it('exports function', () => {
    expect(typeof handleAdminRateLimitRoutes).toBe('function');
  });

  it('returns false for non-rate-limit URL', async () => {
    const { req, res } = mockReqRes('GET', '/api/v2/admin/other');
    expect(await handleAdminRateLimitRoutes(req, res, 'GET', '/api/v2/admin/other')).toBe(false);
  });

  it('returns false for GET on /override (only POST allowed)', async () => {
    const { req, res } = mockReqRes('GET', '/api/v2/admin/rate-limit/override');
    expect(await handleAdminRateLimitRoutes(req, res, 'GET', '/api/v2/admin/rate-limit/override')).toBe(false);
  });

  it('returns false for POST on /inspect (only GET allowed)', async () => {
    const { req, res } = mockReqRes('POST', '/api/v2/admin/rate-limit/inspect/u1');
    expect(await handleAdminRateLimitRoutes(req, res, 'POST', '/api/v2/admin/rate-limit/inspect/u1')).toBe(false);
  });

  it('returns false for GET on /override/{userId} (only DELETE allowed)', async () => {
    const { req, res } = mockReqRes('GET', '/api/v2/admin/rate-limit/override/u1');
    expect(await handleAdminRateLimitRoutes(req, res, 'GET', '/api/v2/admin/rate-limit/override/u1')).toBe(false);
  });

  it('returns false for DELETE on /inspect (only GET allowed)', async () => {
    const { req, res } = mockReqRes('DELETE', '/api/v2/admin/rate-limit/inspect/u1');
    expect(await handleAdminRateLimitRoutes(req, res, 'DELETE', '/api/v2/admin/rate-limit/inspect/u1')).toBe(false);
  });

  it('dispatches POST /override (returns true and falls through to auth)', async () => {
    const { req, res } = mockReqRes('POST', '/api/v2/admin/rate-limit/override');
    const result = await handleAdminRateLimitRoutes(req, res, 'POST', '/api/v2/admin/rate-limit/override');
    expect(result).toBe(true);
  });

  it('dispatches DELETE /override/{userId}', async () => {
    const { req, res } = mockReqRes('DELETE', '/api/v2/admin/rate-limit/override/u1');
    const result = await handleAdminRateLimitRoutes(req, res, 'DELETE', '/api/v2/admin/rate-limit/override/u1');
    expect(result).toBe(true);
  });

  it('dispatches GET /inspect/{userId}', async () => {
    const { req, res } = mockReqRes('GET', '/api/v2/admin/rate-limit/inspect/u1');
    const result = await handleAdminRateLimitRoutes(req, res, 'GET', '/api/v2/admin/rate-limit/inspect/u1');
    expect(result).toBe(true);
  });

  it('URL-decode userId in path', async () => {
    const { req, res } = mockReqRes('GET', '/api/v2/admin/rate-limit/inspect/user%40example.com');
    const result = await handleAdminRateLimitRoutes(req, res, 'GET', '/api/v2/admin/rate-limit/inspect/user%40example.com');
    expect(result).toBe(true);
  });
});

describe('admin rate-limit business logic (used by routes)', () => {
  it('override set → inspect returns override + effective', () => {
    setOverride('u-business-1', 100, 200_000);
    const state = _inspect('u-business-1');
    expect(state.override).toEqual({ ratePerMin: 100, dailyTokens: 200_000 });
    expect(state.limits.perMin).toBe(100);
    expect(state.limits.daily).toBe(200_000);
    expect(state.limits.defaultPerMin).toBe(5);
    expect(state.limits.defaultDaily).toBe(50_000);
  });

  it('override clear → inspect returns no override, falls back to defaults', () => {
    setOverride('u-business-2', 100, 200_000);
    expect(getOverride('u-business-2')).toBeDefined();
    const cleared = clearOverride('u-business-2');
    expect(cleared).toBe(true);
    const state = _inspect('u-business-2');
    expect(state.override).toBeUndefined();
    expect(state.limits.perMin).toBe(5);
    expect(state.limits.daily).toBe(50_000);
  });

  it('override set → checkRateLimit and checkDailyTokenCap use override values', () => {
    setOverride('u-business-3', 100, 200_000);
    let passed = 0;
    for (let i = 0; i < 100; i++) {
      if (checkRateLimit('u-business-3').ok) passed++;
    }
    expect(passed).toBe(100);
    expect(checkRateLimit('u-business-3').ok).toBe(false);
    expect(checkDailyTokenCap('u-business-3', 200_000).ok).toBe(true);
    expect(checkDailyTokenCap('u-business-3', 200_001).ok).toBe(false);
  });

  it('override clear → behavior reverts to defaults', () => {
    setOverride('u-business-4', 100, 200_000);
    clearOverride('u-business-4');
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit('u-business-4').ok).toBe(true);
    }
    expect(checkRateLimit('u-business-4').ok).toBe(false);
    expect(checkDailyTokenCap('u-business-4', 50_000).ok).toBe(true);
    expect(checkDailyTokenCap('u-business-4', 50_001).ok).toBe(false);
  });
});
