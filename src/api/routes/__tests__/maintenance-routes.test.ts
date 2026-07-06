import { describe, it, expect } from 'vitest';
import { handleMaintenanceRoutes } from '../maintenance-routes.ts';
import type http from 'node:http';

function mockReqRes(method: string, url: string): { req: http.IncomingMessage; res: http.ServerResponse } {
  const req = { method, url, headers: {} } as http.IncomingMessage;
  const res = { statusCode: 200, setHeader: () => {}, writeHead: () => {}, end: () => {} } as unknown as http.ServerResponse;
  return { req, res };
}

describe('handleMaintenanceRoutes', () => {
  it('exports function', () => { expect(typeof handleMaintenanceRoutes).toBe('function'); });
  it('returns false for non-maintenance URL', async () => {
    const { req, res } = mockReqRes('POST', '/api/other');
    expect(await handleMaintenanceRoutes(req, res, 'POST', '/api/other')).toBe(false);
  });
  it('handles POST /refresh-mv', async () => {
    const { req, res } = mockReqRes('POST', '/api/v2/admin/maintenance/refresh-mv');
    expect(await handleMaintenanceRoutes(req, res, 'POST', '/api/v2/admin/maintenance/refresh-mv')).toBe(true);
  });
  it('does NOT match GET on refresh-mv', async () => {
    const { req, res } = mockReqRes('GET', '/api/v2/admin/maintenance/refresh-mv');
    expect(await handleMaintenanceRoutes(req, res, 'GET', '/api/v2/admin/maintenance/refresh-mv')).toBe(false);
  });
  it('returns false for unknown subpath', async () => {
    const { req, res } = mockReqRes('POST', '/api/v2/admin/maintenance/unknown');
    expect(await handleMaintenanceRoutes(req, res, 'POST', '/api/v2/admin/maintenance/unknown')).toBe(false);
  });
});
