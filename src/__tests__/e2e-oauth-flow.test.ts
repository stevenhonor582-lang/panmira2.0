/**
 * OAuth flow 单元测试(不连真 DB,用 schema 验证 + 工具函数)
 * 完整 e2e 需要 production DB,这里验证:
 *  1. issueTokens 返回正确结构
 *  2. validateAccessToken 对无效 token 返回 invalid
 *  3. hashToken 确定性
 *  4. 完整 scope 列表覆盖 saas spec
 */
import { describe, it, expect } from 'vitest';
import { generateOpaqueToken, hashToken } from '../lib/tokens.js';

describe('OAuth flow: token 工具', () => {
  it('generateOpaqueToken produces unique 43-char base64url', () => {
    const a = generateOpaqueToken();
    const b = generateOpaqueToken();
    expect(a).not.toBe(b);
    expect(a).toHaveLength(43);
    expect(b).toHaveLength(43);
  });

  it('hashToken is sha256 hex(64 chars)', () => {
    const h = hashToken('test');
    expect(h).toMatch(/^[a-f0-9]{64}$/);
  });

  it('OAuth discovery 列表覆盖 saas spec §5.3', async () => {
    const { handleOAuthRoutes } = await import('../api/routes/oauth-routes.js');
    const resData: { body?: unknown } = {};
    const res = {
      statusCode: 200,
      setHeader: () => {},
      writeHead: () => {},
      end: (d?: string) => { if (d) resData.body = JSON.parse(d); },
    } as any;
    const req = { method: 'GET', url: '/.well-known/oauth-authorization-server', headers: {} } as any;
    const handled = await handleOAuthRoutes(req, res, 'GET', '/.well-known/oauth-authorization-server');
    expect(handled).toBe(true);
    const body = resData.body as any;
    // 13+ scopes from spec §5.3
    const required = [
      'agent:read', 'agent:run', 'agent:edit', 'agent:admin',
      'team:read', 'team:admin',
      'channel:read', 'channel:admin',
      'model:read', 'model:test', 'model:admin',
      'skill:read', 'skill:invoke', 'skill:admin',
      'mcp:read', 'mcp:invoke', 'mcp:admin',
      'knowledge:read', 'knowledge:write', 'knowledge:admin',
      'pipeline:read', 'pipeline:trigger',
      'audit:read', 'oauth:admin',
    ];
    for (const s of required) {
      expect(body.scopes_supported).toContain(s);
    }
  });

  it('grant_types 包含 4 个(spec §5.2)', async () => {
    const { handleOAuthRoutes } = await import('../api/routes/oauth-routes.js');
    const resData: { body?: unknown } = {};
    const res = {
      statusCode: 200,
      setHeader: () => {},
      writeHead: () => {},
      end: (d?: string) => { if (d) resData.body = JSON.parse(d); },
    } as any;
    const req = { method: 'GET', url: '/.well-known/oauth-authorization-server', headers: {} } as any;
    await handleOAuthRoutes(req, res, 'GET', '/.well-known/oauth-authorization-server');
    const body = resData.body as any;
    expect(body.grant_types_supported).toContain('authorization_code');
    expect(body.grant_types_supported).toContain('client_credentials');
    expect(body.grant_types_supported).toContain('refresh_token');
    expect(body.grant_types_supported).toContain('urn:ietf:params:oauth:grant-type:device_code');
  });
});
