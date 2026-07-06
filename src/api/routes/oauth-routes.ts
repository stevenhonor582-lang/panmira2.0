/**
 * OAuth 2.0 端点 — 外部系统接入 Panmira
 *
 * 端点:
 *   GET  /oauth/authorize       - authorization_code 入口(admin 在浏览器同意)
 *   POST /oauth/authorize/confirm - admin 提交同意/拒绝
 *   POST /oauth/token           - 4 grant_type 路由(auth_code / client_credentials / refresh_token / device_code)
 *   POST /oauth/device          - RFC 8628 device_authorization_request
 *   GET  /oauth/device/verify   - 浏览器让 admin 输入 user_code
 *   POST /oauth/device/verify   - admin 确认/拒绝
 *   POST /oauth/revoke          - 撤销 token
 *   GET  /oauth/jwks            - JWKS(空集,本期 ID Token 用 HS256)
 *   GET  /.well-known/oauth-authorization-server - discovery
 */
import type http from 'node:http';
import { createHash } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import {
  oauthClients,
  oauthAuthorizationCodes,
  oauthDeviceCodes,
} from '../../db/schema.ts';
import {
  issueTokens,
  validateAccessToken,
  rotateRefreshToken,
  revokeAccessToken,
  hashToken,
} from '../../lib/tokens.ts';
import { deviceUserCode } from '../../lib/ids.ts';
import { jsonResponse, parseJsonBody } from './helpers.js';
import { verifyAccessToken as verifyAdminJwt } from '../middleware.js';

// ─── helpers ────────────────────────────────────────────────────────────────

const PUBLIC_URL = process.env.PANMIRA_PUBLIC_URL || 'http://localhost:3000';
const ACCESS_TTL_SEC = 60 * 60;

function badRequest(res: http.ServerResponse, code: string, description?: string) {
  jsonResponse(res, 400, { error: code, error_description: description });
}

async function authenticateClient(
  req: http.IncomingMessage,
  body: Record<string, unknown>,
): Promise<{ client: typeof oauthClients.$inferSelect; secretOk: boolean } | null> {
  let clientId: string | undefined;
  let clientSecret: string | undefined;
  // 1. HTTP Basic
  const auth = req.headers.authorization;
  if (auth?.startsWith('Basic ')) {
    try {
      const decoded = Buffer.from(auth.slice(6), 'base64').toString();
      const idx = decoded.indexOf(':');
      if (idx > 0) {
        clientId = decoded.slice(0, idx);
        clientSecret = decoded.slice(idx + 1);
      }
    } catch { /* fall through */ }
  }
  // 2. body 备选
  if (!clientId) {
    clientId = body.client_id as string | undefined;
    clientSecret = body.client_secret as string | undefined;
  }
  if (!clientId) return null;
  const [client] = await db.select().from(oauthClients).where(eq(oauthClients.clientId, clientId)).limit(1);
  if (!client || client.status !== 'active') return null;
  if (!client.clientSecretHash) return { client, secretOk: true }; // public client
  if (!clientSecret) return null;
  const secretOk = createHash('sha256').update(clientSecret).digest('hex') === client.clientSecretHash;
  return { client, secretOk };
}

/** 解析 Bearer token 中的 admin JWT(admin 操作需要) */
async function requireAdminFromJwt(req: http.IncomingMessage, res: http.ServerResponse): Promise<{ sub: string; tenantId: string } | null> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    jsonResponse(res, 401, { error: 'unauthenticated', error_description: '需要 Bearer token' });
    return null;
  }
  const payload = await verifyAdminJwt(auth.slice(7));
  if (!payload) {
    jsonResponse(res, 401, { error: 'unauthenticated', error_description: 'JWT 无效或过期' });
    return null;
  }
  return payload as { sub: string; tenantId: string };
}

// ─── /oauth/authorize ───────────────────────────────────────────────────────

async function handleAuthorizeGet(req: http.IncomingMessage, res: http.ServerResponse, url: string) {
  const params = new URL(url, PUBLIC_URL).searchParams;
  const responseType = params.get('response_type');
  const clientId = params.get('client_id');
  const redirectUri = params.get('redirect_uri');
  const scope = params.get('scope') || '';
  const state = params.get('state') || '';
  const codeChallenge = params.get('code_challenge') || '';
  const codeChallengeMethod = params.get('code_challenge_method') || '';

  if (responseType !== 'code') {
    jsonResponse(res, 400, { error: 'unsupported_response_type' });
    return;
  }
  if (!clientId || !redirectUri) {
    jsonResponse(res, 400, { error: 'invalid_request', error_description: 'client_id + redirect_uri 必填' });
    return;
  }
  const [client] = await db.select().from(oauthClients).where(eq(oauthClients.clientId, clientId)).limit(1);
  if (!client || client.status !== 'active') {
    jsonResponse(res, 400, { error: 'invalid_client' });
    return;
  }
  const allowed = (client.redirectUris as string[]).includes(redirectUri);
  if (!allowed) {
    jsonResponse(res, 400, { error: 'invalid_request', error_description: 'redirect_uri 未注册' });
    return;
  }

  // 返回 consent HTML(简化为 GET,POST 提交)
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(`<!doctype html><html><body style="font-family: sans-serif; max-width: 500px; margin: 50px auto; padding: 20px; border: 1px solid #ccc; border-radius: 8px;">
<h2>授权 ${escapeHtml(client.name)}</h2>
<p>客户端申请以下权限:</p>
<pre style="background: #f5f5f5; padding: 8px; border-radius: 4px;">${escapeHtml(scope || '(无)')}</pre>
<form method="POST" action="/oauth/authorize/confirm">
  <input type="hidden" name="client_id" value="${escapeHtml(clientId)}"/>
  <input type="hidden" name="redirect_uri" value="${escapeHtml(redirectUri)}"/>
  <input type="hidden" name="scope" value="${escapeHtml(scope)}"/>
  <input type="hidden" name="state" value="${escapeHtml(state)}"/>
  <input type="hidden" name="code_challenge" value="${escapeHtml(codeChallenge)}"/>
  <input type="hidden" name="code_challenge_method" value="${escapeHtml(codeChallengeMethod)}"/>
  <button type="submit" name="action" value="approve" style="background: #4f46e5; color: white; padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer;">同意</button>
  <button type="submit" name="action" value="deny" style="margin-left: 8px; padding: 8px 16px;">拒绝</button>
</form>
<p style="color: #888; font-size: 12px; margin-top: 16px;">此页面要求 admin 已登录(/api/auth/login 获取 JWT)。如未登录请先调用 login。</p>
</body></html>`);
}

async function handleAuthorizeConfirm(req: http.IncomingMessage, res: http.ServerResponse) {
  const admin = await requireAdminFromJwt(req, res);
  if (!admin) return;
  const body = await parseJsonBody<Record<string, string>>(req) || {};
  const { client_id, redirect_uri, scope, state, code_challenge, code_challenge_method, action } = body;
  if (action === 'deny') {
    const sep = redirect_uri?.includes('?') ? '&' : '?';
    res.statusCode = 302;
    res.setHeader('location', `${redirect_uri}${sep}error=access_denied&state=${state || ''}`);
    res.end();
    return;
  }
  if (!client_id || !redirect_uri) {
    badRequest(res, 'invalid_request', 'client_id + redirect_uri 必填');
    return;
  }
  const [client] = await db.select().from(oauthClients).where(eq(oauthClients.clientId, client_id)).limit(1);
  if (!client) {
    badRequest(res, 'invalid_client');
    return;
  }
  const code = createHash('sha256').update(`${client_id}:${admin.sub}:${Date.now()}:${Math.random()}`).digest('hex').slice(0, 32);
  const scopes = (scope || '').split(' ').filter(Boolean);
  await db.insert(oauthAuthorizationCodes).values({
    code,
    clientId: client.id,
    userId: admin.sub,
    redirectUri: redirect_uri,
    scopes,
    codeChallenge: code_challenge || null,
    codeChallengeMethod: code_challenge_method || null,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  });
  const sep = redirect_uri.includes('?') ? '&' : '?';
  res.statusCode = 302;
  res.setHeader('location', `${redirect_uri}${sep}code=${code}&state=${state || ''}`);
  res.end();
}

// ─── /oauth/token ───────────────────────────────────────────────────────────

async function handleToken(req: http.IncomingMessage, res: http.ServerResponse) {
  const body = await parseJsonBody<Record<string, string>>(req) || {};
  const grantType = body.grant_type;
  const auth = await authenticateClient(req, body);
  if (!auth || !auth.secretOk) {
    jsonResponse(res, 401, { error: 'invalid_client' });
    return;
  }
  const { client } = auth;

  try {
    if (grantType === 'authorization_code') {
      const { code, redirect_uri, code_verifier } = body;
      if (!code || !redirect_uri) return badRequest(res, 'invalid_request', 'code + redirect_uri 必填');
      const [authCode] = await db.select().from(oauthAuthorizationCodes)
        .where(and(
          eq(oauthAuthorizationCodes.code, code),
          eq(oauthAuthorizationCodes.clientId, client.id),
          isNull(oauthAuthorizationCodes.usedAt),
          gt(oauthAuthorizationCodes.expiresAt, new Date()),
        )).limit(1);
      if (!authCode) return badRequest(res, 'invalid_grant', 'code 无效/过期/已用');
      if (authCode.redirectUri !== redirect_uri) return badRequest(res, 'invalid_grant', 'redirect_uri 不匹配');
      if (authCode.codeChallenge) {
        if (!code_verifier) return badRequest(res, 'invalid_grant', 'code_verifier 必填');
        const hashed = createHash('sha256').update(code_verifier).digest('base64url');
        if (hashed !== authCode.codeChallenge) return badRequest(res, 'invalid_grant', 'code_verifier 不匹配');
      }
      await db.update(oauthAuthorizationCodes).set({ usedAt: new Date() }).where(eq(oauthAuthorizationCodes.code, code));
      const result = await issueTokens({
        clientId: client.id,
        userId: authCode.userId,
        tenantId: client.tenantId,
        scopes: authCode.scopes as string[],
      });
      return jsonResponse(res, 200, {
        access_token: result.accessToken,
        token_type: 'Bearer',
        expires_in: result.expiresIn,
        refresh_token: result.refreshToken,
        scope: result.scopes.join(' '),
      });
    }

    if (grantType === 'client_credentials') {
      const requested = (body.scope || '').split(' ').filter(Boolean);
      const allowed = client.scopes as string[];
      const finalScopes = requested.length > 0 ? requested.filter(s => allowed.includes(s)) : allowed;
      const result = await issueTokens({
        clientId: client.id,
        userId: null,
        tenantId: client.tenantId,
        scopes: finalScopes,
      });
      return jsonResponse(res, 200, {
        access_token: result.accessToken,
        token_type: 'Bearer',
        expires_in: result.expiresIn,
        scope: result.scopes.join(' '),
      });
    }

    if (grantType === 'refresh_token') {
      try {
        const result = await rotateRefreshToken(body.refresh_token, client.id);
        return jsonResponse(res, 200, {
          access_token: result.accessToken,
          token_type: 'Bearer',
          expires_in: result.expiresIn,
          refresh_token: result.refreshToken,
          scope: result.scopes.join(' '),
        });
      } catch (e) {
        return jsonResponse(res, 400, { error: 'invalid_grant', error_description: (e as Error).message });
      }
    }

    if (grantType === 'urn:ietf:params:oauth:grant-type:device_code') {
      const { device_code } = body;
      if (!device_code) return badRequest(res, 'invalid_request', 'device_code 必填');
      const [dc] = await db.select().from(oauthDeviceCodes)
        .where(and(
          eq(oauthDeviceCodes.deviceCode, device_code),
          eq(oauthDeviceCodes.clientId, client.id),
          gt(oauthDeviceCodes.expiresAt, new Date()),
        )).limit(1);
      if (!dc) return jsonResponse(res, 400, { error: 'expired_token' });
      if (!dc.authorizedUserId) return jsonResponse(res, 400, { error: 'authorization_pending' });
      const result = await issueTokens({
        clientId: client.id,
        userId: dc.authorizedUserId,
        tenantId: client.tenantId,
        scopes: dc.scopes as string[],
      });
      await db.update(oauthDeviceCodes).set({ expiresAt: new Date() }).where(eq(oauthDeviceCodes.deviceCode, device_code));
      return jsonResponse(res, 200, {
        access_token: result.accessToken,
        token_type: 'Bearer',
        expires_in: result.expiresIn,
        refresh_token: result.refreshToken,
        scope: result.scopes.join(' '),
      });
    }

    return badRequest(res, 'unsupported_grant_type', `grant_type=${grantType} 不支持`);
  } catch (e) {
    return jsonResponse(res, 500, { error: 'server_error', error_description: (e as Error).message });
  }
}

// ─── /oauth/device ──────────────────────────────────────────────────────────

async function handleDeviceRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  const body = await parseJsonBody<Record<string, string>>(req) || {};
  const auth = await authenticateClient(req, body);
  if (!auth || !auth.secretOk) {
    return jsonResponse(res, 401, { error: 'invalid_client' });
  }
  const { client } = auth;
  const scopes = (body.scope || '').split(' ').filter(Boolean);
  const deviceCode = createHash('sha256').update(`device:${client.id}:${Date.now()}:${Math.random()}`).digest('hex').slice(0, 40);
  const userCode = deviceUserCode(8);
  await db.insert(oauthDeviceCodes).values({
    deviceCode,
    userCode,
    clientId: client.id,
    scopes,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    intervalSec: 5,
  });
  const verifyUrl = `${PUBLIC_URL}/oauth/device/verify?code=${userCode}`;
  return jsonResponse(res, 200, {
    device_code: deviceCode,
    user_code: userCode,
    verification_uri: verifyUrl,
    verification_uri_complete: verifyUrl,
    expires_in: 900,
    interval: 5,
  });
}

async function handleDeviceVerifyGet(req: http.IncomingMessage, res: http.ServerResponse, url: string) {
  const code = new URL(url, PUBLIC_URL).searchParams.get('code') || '';
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(`<!doctype html><html><body style="font-family: sans-serif; max-width: 400px; margin: 50px auto;">
<h2>CLI 设备授权</h2>
${code ? `<p>设备码: <code style="font-size: 18px; padding: 4px 8px; background: #f5f5f5;">${escapeHtml(code)}</code></p>
<form method="POST" action="/oauth/device/verify">
  <input type="hidden" name="user_code" value="${escapeHtml(code)}"/>
  <button type="submit" name="action" value="approve" style="background: #4f46e5; color: white; padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer;">授权</button>
  <button type="submit" name="action" value="deny" style="margin-left: 8px; padding: 8px 16px;">拒绝</button>
</form>` : `<form method="GET"><label>请输入 CLI 显示的设备码:</label><br/><input name="code" style="width: 200px; padding: 8px; font-size: 16px;" autofocus/><button type="submit" style="padding: 8px 16px;">继续</button></form>`}
</body></html>`);
}

async function handleDeviceVerifyPost(req: http.IncomingMessage, res: http.ServerResponse) {
  const admin = await requireAdminFromJwt(req, res);
  if (!admin) return;
  const body = await parseJsonBody<Record<string, string>>(req) || {};
  if (body.action === 'deny') {
    res.setHeader('content-type', 'text/html');
    return res.end('<h2>已拒绝</h2>');
  }
  const [dc] = await db.select().from(oauthDeviceCodes).where(eq(oauthDeviceCodes.userCode, body.user_code || '')).limit(1);
  if (!dc || dc.expiresAt < new Date()) {
    res.setHeader('content-type', 'text/html');
    return res.end('<h2>设备码无效或已过期</h2>');
  }
  await db.update(oauthDeviceCodes).set({ authorizedUserId: admin.sub }).where(eq(oauthDeviceCodes.deviceCode, dc.deviceCode));
  res.setHeader('content-type', 'text/html');
  res.end('<h2>已授权</h2><p>可回到 CLI 继续。</p>');
}

// ─── /oauth/revoke + /oauth/jwks + discovery ────────────────────────────────

async function handleRevoke(req: http.IncomingMessage, res: http.ServerResponse) {
  const body = await parseJsonBody<Record<string, string>>(req) || {};
  if (!body.token) {
    res.statusCode = 400;
    return res.end();
  }
  await revokeAccessToken(body.token);
  res.statusCode = 200;
  res.end();
}

function handleJwks(req: http.IncomingMessage, res: http.ServerResponse) {
  // ID Token 本期未签 JWS(JWT HS256 用对称 key,无 JWK 公开)
  return jsonResponse(res, 200, { keys: [] });
}

function handleDiscovery(req: http.IncomingMessage, res: http.ServerResponse) {
  return jsonResponse(res, 200, {
    issuer: PUBLIC_URL,
    authorization_endpoint: `${PUBLIC_URL}/oauth/authorize`,
    token_endpoint: `${PUBLIC_URL}/oauth/token`,
    device_authorization_endpoint: `${PUBLIC_URL}/oauth/device`,
    revocation_endpoint: `${PUBLIC_URL}/oauth/revoke`,
    jwks_uri: `${PUBLIC_URL}/oauth/jwks`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'client_credentials', 'refresh_token', 'urn:ietf:params:oauth:grant-type:device_code'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post', 'none'],
    scopes_supported: [
      'agent:read', 'agent:run', 'agent:edit', 'agent:admin',
      'team:read', 'team:admin',
      'channel:read', 'channel:admin',
      'model:read', 'model:test', 'model:admin',
      'skill:read', 'skill:invoke', 'skill:admin',
      'mcp:read', 'mcp:invoke', 'mcp:admin',
      'knowledge:read', 'knowledge:write', 'knowledge:admin',
      'pipeline:read', 'pipeline:trigger',
      'audit:read', 'oauth:admin',
    ],
  });
}

// ─── 入口分发 ────────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

export async function handleOAuthRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  method: string,
  url: string,
): Promise<boolean> {
  // discovery
  if (url === '/.well-known/oauth-authorization-server' && method === 'GET') {
    handleDiscovery(req, res);
    return true;
  }
  // jwks
  if (url === '/oauth/jwks' && method === 'GET') {
    handleJwks(req, res);
    return true;
  }
  // revoke
  if (url === '/oauth/revoke' && method === 'POST') {
    await handleRevoke(req, res);
    return true;
  }
  // authorize
  if (url === '/oauth/authorize' && method === 'GET') {
    await handleAuthorizeGet(req, res, url);
    return true;
  }
  if (url === '/oauth/authorize/confirm' && method === 'POST') {
    await handleAuthorizeConfirm(req, res);
    return true;
  }
  // token
  if (url === '/oauth/token' && method === 'POST') {
    await handleToken(req, res);
    return true;
  }
  // device
  if (url === '/oauth/device' && method === 'POST') {
    await handleDeviceRequest(req, res);
    return true;
  }
  if (url === '/oauth/device/verify' && method === 'GET') {
    await handleDeviceVerifyGet(req, res, url);
    return true;
  }
  if (url === '/oauth/device/verify' && method === 'POST') {
    await handleDeviceVerifyPost(req, res);
    return true;
  }
  return false;
}
