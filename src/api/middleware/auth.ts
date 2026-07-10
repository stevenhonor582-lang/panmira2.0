/**
 * R49-B 统一认证中间件
 *
 * 设计:
 * - 复用现有 src/api/oauth-middleware.ts 的 token 验证逻辑(OAuth + JWT fallback)
 * - 用 unified-error envelope 替换旧 jsonResponse(res, 401, ...) 格式
 * - 新增 requireScope(scope: string) 细粒度单 scope 检查
 * - 失败抛 ApiException,由 withErrorBoundary 兜底
 * - 向后兼容: oauth-middleware.ts 保留旧函数(R49-B 内新路由优先用这里)
 *
 * 使用:
 *   import { requireBearer, requireScope, requireAnyScope } from '../middleware/auth.js';
 *
 *   const ctx = await requireBearer(req);  // 返回 OAuthContext | null
 *   if (!ctx) return;                       // 已响应 401
 *   requireScope(ctx, 'agent:admin');       // 失败抛 ApiException → 403
 */
import type * as http from 'node:http';
import {
  requireBearer as _legacyRequireBearer,
  requireScopes as _legacyRequireScopes,
  requireAnyScope as _legacyRequireAnyScope,
  type OAuthContext,
} from '../oauth-middleware.js';
import { ApiException, sendError } from './unified-error.js';
import { ErrorCode, type ApiVersion } from '../contract/index.js';

// ── 公开 re-export(OAuthContext 类型仍来自 oauth-middleware) ──────────
export type { OAuthContext };

// ── R49-B 版本:用 unified-error envelope 替代旧 jsonResponse ──────────
/**
 * Bearer token 验证 — 失败时发统一 envelope 401 响应,返回 null
 * 成功返回 OAuthContext(含 tenantId/userId/scopes)
 *
 * @param version API 版本(从 URL 解析,或显式传入)
 */
export async function requireBearer(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  version: ApiVersion = 'v3',
): Promise<OAuthContext | null> {
  // 临时挂上 traceId 给 sendError 用
  if (!(res as any).traceId) {
    const { resolveTraceId } = await import('../contract/index.js');
    (res as any).traceId = resolveTraceId(req);
  }
  return _legacyRequireBearer(req, res);
}

/**
 * 单 scope 必选检查 — 失败抛 ApiException(403 INSUFFICIENT_SCOPE)
 * 与 requireScopes(ctx, [scope]) 等价但 API 更简洁
 */
export function requireScope(ctx: OAuthContext, scope: string): void {
  if (ctx.scopes.includes('*')) return; // 通配
  if (ctx.scopes.includes(scope)) return;
  throw new ApiException(
    ErrorCode.INSUFFICIENT_SCOPE,
    `需要 scope: ${scope}`,
    { details: { required: scope, actual: ctx.scopes }, source: 'auth' },
  );
}

/**
 * 任意 scope 满足检查 — 失败抛 ApiException(403 INSUFFICIENT_SCOPE)
 * @deprecated 推荐直接 requireAnyScope() 旧函数(返回 bool);本函数抛异常版用于 R49-B 新路由
 */
export function requireAnyScopeOrThrow(ctx: OAuthContext, candidates: string[]): void {
  if (requireAnyScope(ctx, candidates)) return;
  throw new ApiException(
    ErrorCode.INSUFFICIENT_SCOPE,
    `需要任一 scope: ${candidates.join(' | ')}`,
    { details: { required_any: candidates, actual: ctx.scopes }, source: 'auth' },
  );
}

/**
 * 全 scope 必选检查 — 失败抛 ApiException(403 INSUFFICIENT_SCOPE)
 * 包装旧 requireScopes 返回值风格
 */
export function requireScopesOrThrow(ctx: OAuthContext, required: string[]): void {
  const r = _legacyRequireScopes(ctx, required);
  if (r.ok) return;
  throw new ApiException(
    ErrorCode.INSUFFICIENT_SCOPE,
    `缺少 scope: ${r.missing.join(', ')}`,
    { details: { required, missing: r.missing, actual: ctx.scopes }, source: 'auth' },
  );
}

// ── 向后兼容 wrapper(返回 boolean 旧风格) ──────────────────────────────
/** @deprecated R49-B 新路由用 requireAnyScopeOrThrow */
export function requireAnyScope(ctx: OAuthContext, candidates: string[]): boolean {
  return _legacyRequireAnyScope(ctx, candidates);
}

/** @deprecated R49-B 新路由用 requireScopesOrThrow */
export function requireScopes(
  ctx: OAuthContext,
  required: string[],
): { ok: true } | { ok: false; missing: string[] } {
  return _legacyRequireScopes(ctx, required);
}
