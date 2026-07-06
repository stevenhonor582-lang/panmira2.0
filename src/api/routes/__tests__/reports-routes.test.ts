import { describe, it, expect } from 'vitest';
import { handleReportsRoutes } from '../reports-routes.ts';
import type http from 'node:http';

function mockReqRes(method: string, url: string): { req: http.IncomingMessage; res: http.ServerResponse } {
  const req = { method, url, headers: {} } as http.IncomingMessage;
  const res = {
    statusCode: 200,
    setHeader: () => {},
    writeHead: () => {},
    end: () => {},
  } as unknown as http.ServerResponse;
  return { req, res };
}

describe('handleReportsRoutes dispatch', () => {
  it('exports function', () => {
    expect(typeof handleReportsRoutes).toBe('function');
  });

  it('returns false for non-reports URL', async () => {
    const { req, res } = mockReqRes('GET', '/api/other');
    expect(await handleReportsRoutes(req, res, 'GET', '/api/other')).toBe(false);
  });

  it('returns false for non-GET method', async () => {
    const { req, res } = mockReqRes('POST', '/api/v2/admin/reports/tokens');
    expect(await handleReportsRoutes(req, res, 'POST', '/api/v2/admin/reports/tokens')).toBe(false);
  });

  it('returns false for invalid dimension', async () => {
    const { req, res } = mockReqRes('GET', '/api/v2/admin/reports/invalid_dim');
    expect(await handleReportsRoutes(req, res, 'GET', '/api/v2/admin/reports/invalid_dim')).toBe(false);
  });

  // 5 dimension
  for (const dim of ['token', 'skill', 'mcp', 'channel', 'knowledge']) {
    it(`handles GET /api/v2/admin/reports/${dim}`, async () => {
      const { req, res } = mockReqRes('GET', `/api/v2/admin/reports/${dim}`);
      expect(await handleReportsRoutes(req, res, 'GET', `/api/v2/admin/reports/${dim}`)).toBe(true);
    });
  }

  it('returns false for /reports/ (no dimension)', async () => {
    const { req, res } = mockReqRes('GET', '/api/v2/admin/reports/');
    expect(await handleReportsRoutes(req, res, 'GET', '/api/v2/admin/reports/')).toBe(false);
  });
});
