import { describe, it, expect } from 'vitest';
import { handleOAuthClientRoutes } from '../oauth-client-routes.ts';
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

describe('handleOAuthClientRoutes dispatch', () => {
  it('exports function', () => {
    expect(typeof handleOAuthClientRoutes).toBe('function');
  });

  it('returns false for non-oauth-clients URL', async () => {
    const { req, res } = mockReqRes('GET', '/api/other');
    expect(await handleOAuthClientRoutes(req, res, 'GET', '/api/other')).toBe(false);
  });

  it('handles GET /api/v2/admin/oauth-clients', async () => {
    const { req, res } = mockReqRes('GET', '/api/v2/admin/oauth-clients');
    expect(await handleOAuthClientRoutes(req, res, 'GET', '/api/v2/admin/oauth-clients')).toBe(true);
  });

  it('handles POST /api/v2/admin/oauth-clients', async () => {
    const { req, res } = mockReqRes('POST', '/api/v2/admin/oauth-clients');
    expect(await handleOAuthClientRoutes(req, res, 'POST', '/api/v2/admin/oauth-clients')).toBe(true);
  });

  it('handles GET /:id', async () => {
    const { req, res } = mockReqRes('GET', '/api/v2/admin/oauth-clients/abc-123');
    expect(await handleOAuthClientRoutes(req, res, 'GET', '/api/v2/admin/oauth-clients/abc-123')).toBe(true);
  });

  it('handles PATCH /:id', async () => {
    const { req, res } = mockReqRes('PATCH', '/api/v2/admin/oauth-clients/abc-123');
    expect(await handleOAuthClientRoutes(req, res, 'PATCH', '/api/v2/admin/oauth-clients/abc-123')).toBe(true);
  });

  it('handles DELETE /:id', async () => {
    const { req, res } = mockReqRes('DELETE', '/api/v2/admin/oauth-clients/abc-123');
    expect(await handleOAuthClientRoutes(req, res, 'DELETE', '/api/v2/admin/oauth-clients/abc-123')).toBe(true);
  });

  it('handles POST /:id/secret/rotate', async () => {
    const { req, res } = mockReqRes('POST', '/api/v2/admin/oauth-clients/abc-123/secret/rotate');
    expect(await handleOAuthClientRoutes(req, res, 'POST', '/api/v2/admin/oauth-clients/abc-123/secret/rotate')).toBe(true);
  });

  it('does NOT match GET /:id/secret/rotate (only POST)', async () => {
    const { req, res } = mockReqRes('GET', '/api/v2/admin/oauth-clients/abc-123/secret/rotate');
    expect(await handleOAuthClientRoutes(req, res, 'GET', '/api/v2/admin/oauth-clients/abc-123/secret/rotate')).toBe(false);
  });

  it('returns false for /:id/wrong-subpath', async () => {
    const { req, res } = mockReqRes('GET', '/api/v2/admin/oauth-clients/abc-123/wrong');
    expect(await handleOAuthClientRoutes(req, res, 'GET', '/api/v2/admin/oauth-clients/abc-123/wrong')).toBe(false);
  });
});
