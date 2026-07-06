/**
 * OAuth + RBAC 中间件
 * 跟 src/api/middleware.ts(内部 JWT)平行,这是 OAuth token 路径
 */
import type http from 'node:http';
import { validateAccessToken } from '../lib/tokens.ts';
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
  const v = await validateAccessToken(auth.slice(7));
  if (!v.valid) {
    jsonResponse(res, 401, { success: false, error: { code: 'invalid_token', message: 'token 无效或过期' } });
    return null;
  }
  return {
    tenantId: v.tenantId!,
    userId: v.userId || null,
    clientId: v.clientId!,
    scopes: v.scopes!,
    tokenId: v.tokenId!,
  };
}

/** scope 检查(全要) */
export function requireScopes(ctx: OAuthContext, required: string[]): { ok: true } | { ok: false; missing: string[] } {
  const missing = required.filter(s => !ctx.scopes.includes(s));
  return missing.length === 0 ? { ok: true } : { ok: false, missing };
}

/** 任意 scope 满足 */
export function requireAnyScope(ctx: OAuthContext, candidates: string[]): boolean {
  return candidates.some(s => ctx.scopes.includes(s));
}
