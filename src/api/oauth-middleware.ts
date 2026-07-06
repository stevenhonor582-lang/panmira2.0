/**
 * OAuth + RBAC 中间件
 * 跟 src/api/middleware.ts(内部 JWT)平行,这是 OAuth token 路径
 */
import type http from 'node:http';
import { validateAccessToken } from '../lib/tokens.js';
import { verifyAccessToken as verifyUserJwt } from './middleware.js';
import { jsonResponse } from './routes/helpers.js';

export interface OAuthContext {
  tenantId: string;
  userId: string | null;
  clientId: string;
  scopes: string[];
  tokenId: string;
}

/** Bearer token 验证 + 注入 ctx */
export async function requireBearer(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<OAuthContext | null> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    jsonResponse(res, 401, { success: false, error: { code: 'unauthenticated', message: '需要 Bearer token' } });
    return null;
  }
  const token = auth.slice(7);

  // 1. 先试 OAuth opaque token(client_credentials grant)
  const v = await validateAccessToken(token);
  if (v.valid) {
    return {
      tenantId: v.tenantId!,
      userId: v.userId || null,
      clientId: v.clientId!,
      scopes: v.scopes!,
      tokenId: v.tokenId!,
    };
  }

  // 2. 回退试 user JWT (admin/email-password login)
  const u = await verifyUserJwt(token);
  if (u) {
    // admin 角色自动给所有 admin scope,member 角色只能读自己的
    const scopes = u.role === 'admin'
      ? ['*']  // * = 通配(下面 requireAnyScope 用 .includes('*') 检查)
      : ['agent:read', 'knowledge:read', 'reports:read'];
    return {
      tenantId: u.tenantId,
      userId: u.sub,
      clientId: 'admin-jwt',
      scopes,
      tokenId: 'user-jwt',
    };
  }

  jsonResponse(res, 401, { success: false, error: { code: 'invalid_token', message: 'token 无效或过期' } });
  return null;
}

/** scope 检查(全要) */
export function requireScopes(ctx: OAuthContext, required: string[]): { ok: true } | { ok: false; missing: string[] } {
  // 通配符 scope 通过所有检查
  if (ctx.scopes.includes('*')) return { ok: true };
  const missing = required.filter(s => !ctx.scopes.includes(s));
  return missing.length === 0 ? { ok: true } : { ok: false, missing };
}

/** 任意 scope 满足 */
export function requireAnyScope(ctx: OAuthContext, candidates: string[]): boolean {
  // 通配符 scope 直接通过
  if (ctx.scopes.includes('*')) return true;
  return candidates.some(s => ctx.scopes.includes(s));
}
