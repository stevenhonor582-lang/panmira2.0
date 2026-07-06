import { describe, it, expect } from 'vitest';
import { handleOAuthRoutes } from '../oauth-routes.js';
import type http from 'node:http';

function mockReqRes(method: string, url: string): { req: http.IncomingMessage; res: http.ServerResponse; resData: { status?: number; body?: unknown } } {
  const req = { method, url, headers: {} } as http.IncomingMessage;
  const resData: { status?: number; body?: unknown } = {};
  const res = {
    statusCode: 200,
    setHeader: () => {}, writeHead: () => {},
    end: (data?: string) => { if (data) try { resData.body = JSON.parse(data); } catch { resData.body = data; } },
  } as unknown as http.ServerResponse;
  return { req, res, resData };
}

describe('OAuth routes module (no-DB 单元测试)', () => {
  it('exports handleOAuthRoutes function', () => {
    expect(typeof handleOAuthRoutes).toBe('function');
  });

  it('returns false for non-OAuth URL', async () => {
    const { req, res } = mockReqRes('GET', '/some/random/path');
    const handled = await handleOAuthRoutes(req, res, 'GET', '/some/random/path');
    expect(handled).toBe(false);
  });

  it('handles /oauth/jwks GET → returns empty key set', async () => {
    const { req, res, resData } = mockReqRes('GET', '/oauth/jwks');
    const handled = await handleOAuthRoutes(req, res, 'GET', '/oauth/jwks');
    expect(handled).toBe(true);
    expect(resData.body).toEqual({ keys: [] });
  });

  it('handles discovery GET → returns OAuth metadata', async () => {
    const { req, res, resData } = mockReqRes('GET', '/.well-known/oauth-authorization-server');
    const handled = await handleOAuthRoutes(req, res, 'GET', '/.well-known/oauth-authorization-server');
    expect(handled).toBe(true);
    const body = resData.body as any;
    expect(body.issuer).toBeDefined();
    expect(body.token_endpoint).toContain('/oauth/token');
    expect(body.grant_types_supported).toContain('client_credentials');
    expect(body.grant_types_supported).toContain('urn:ietf:params:oauth:grant-type:device_code');
    expect(body.code_challenge_methods_supported).toContain('S256');
    expect(body.scopes_supported).toContain('agent:read');
    expect(body.scopes_supported).toContain('knowledge:read');
  });
});
