import { describe, it, expect } from 'vitest';
import { handleResourceRoutes } from '../resource-routes.ts';
import type http from 'node:http';

function mockReqRes(method: string, url: string): { req: http.IncomingMessage; res: http.ServerResponse; resData: { status?: number; body?: unknown } } {
  const req = { method, url, headers: {} } as http.IncomingMessage;
  const resData: { status?: number; body?: unknown } = {};
  const res = { statusCode: 200, setHeader: () => {}, writeHead: () => {}, end: (d?: string) => { if (d) try { resData.body = JSON.parse(d); } catch { resData.body = d; } } } as unknown as http.ServerResponse;
  return { req, res, resData };
}

describe('handleResourceRoutes', () => {
  it('exports function', () => { expect(typeof handleResourceRoutes).toBe('function'); });
  it('returns false for non-matching URL', async () => {
    const { req, res } = mockReqRes('GET', '/api/other');
    expect(await handleResourceRoutes(req, res, 'GET', '/api/other')).toBe(false);
  });
  it('returns false for /api/v2/admin/bots (out of scope)', async () => {
    const { req, res } = mockReqRes('GET', '/api/v2/admin/bots');
    expect(await handleResourceRoutes(req, res, 'GET', '/api/v2/admin/bots')).toBe(false);
  });
});
