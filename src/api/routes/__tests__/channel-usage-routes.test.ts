import { describe, it, expect } from 'vitest';
import { handleChannelUsageRoutes } from '../channel-usage-routes.ts';
import type http from 'node:http';

function mockReqRes(method: string, url: string): { req: http.IncomingMessage; res: http.ServerResponse } {
  const req = { method, url, headers: {} } as http.IncomingMessage;
  const res = { statusCode: 200, setHeader: () => {}, writeHead: () => {}, end: () => {} } as unknown as http.ServerResponse;
  return { req, res };
}

describe('handleChannelUsageRoutes', () => {
  it('exports function', () => { expect(typeof handleChannelUsageRoutes).toBe('function'); });
  it('returns false for non-channel URL', async () => {
    const { req, res } = mockReqRes('POST', '/api/other');
    expect(await handleChannelUsageRoutes(req, res, 'POST', '/api/other')).toBe(false);
  });
  it('handles POST /api/v2/admin/channels/usage', async () => {
    const { req, res } = mockReqRes('POST', '/api/v2/admin/channels/usage');
    expect(await handleChannelUsageRoutes(req, res, 'POST', '/api/v2/admin/channels/usage')).toBe(true);
  });
  it('does NOT match GET (only POST)', async () => {
    const { req, res } = mockReqRes('GET', '/api/v2/admin/channels/usage');
    expect(await handleChannelUsageRoutes(req, res, 'GET', '/api/v2/admin/channels/usage')).toBe(false);
  });
});
