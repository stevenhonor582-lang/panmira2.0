import { describe, it, expect } from 'vitest';
import { handleReportsExportRoutes } from '../reports-export-routes.ts';
import type http from 'node:http';

function mockReqRes(method: string, url: string): { req: http.IncomingMessage; res: http.ServerResponse } {
  const req = { method, url, headers: {} } as http.IncomingMessage;
  const res = { statusCode: 200, setHeader: () => {}, writeHead: () => {}, end: () => {} } as unknown as http.ServerResponse;
  return { req, res };
}

describe('handleReportsExportRoutes dispatch', () => {
  it('exports function', () => { expect(typeof handleReportsExportRoutes).toBe('function'); });
  it('returns false for non-export URL', async () => {
    const { req, res } = mockReqRes('GET', '/api/v2/admin/reports/token');
    expect(await handleReportsExportRoutes(req, res, 'GET', '/api/v2/admin/reports/token')).toBe(false);
  });
  it('returns false for non-GET', async () => {
    const { req, res } = mockReqRes('POST', '/api/v2/admin/reports/token/export');
    expect(await handleReportsExportRoutes(req, res, 'POST', '/api/v2/admin/reports/token/export')).toBe(false);
  });
  it('returns false for invalid dimension', async () => {
    const { req, res } = mockReqRes('GET', '/api/v2/admin/reports/invalid/export');
    expect(await handleReportsExportRoutes(req, res, 'GET', '/api/v2/admin/reports/invalid/export')).toBe(false);
  });
  for (const dim of ['token', 'skill', 'mcp', 'channel', 'knowledge']) {
    it(`handles GET /reports/${dim}/export`, async () => {
      const { req, res } = mockReqRes('GET', `/api/v2/admin/reports/${dim}/export`);
      expect(await handleReportsExportRoutes(req, res, 'GET', `/api/v2/admin/reports/${dim}/export`)).toBe(true);
    });
  }
});
