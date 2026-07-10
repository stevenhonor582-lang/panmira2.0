/**
 * R49-B API 层统一契约 — 标准错误码
 *
 * 设计原则:
 * - 所有错误码用 SCREAMING_SNAKE_CASE 字符串(便于日志搜索)
 * - 4 位数字前缀分组: 1xxx=认证, 2xxx=授权, 3xxx=校验, 4xxx=业务,
 *   5xxx=内部, 9xxx=外部依赖
 * - 与 HTTP 状态码解耦(同一状态码可有多个错误码,如 403 forbidden/insufficient_scope)
 * - 覆盖 R49-UPGRADE-PLAN.md §2 列出的 10+ 业务错误场景
 */

import type { ApiError } from './types.js';

// ── 错误码 enum(字符串值,与日志/前端 type guard 配套) ─────────────────
export const ErrorCode = {
  // ── 认证(1xxx)───
  UNAUTHENTICATED: 'UNAUTHENTICATED',                  // 401 缺 Bearer token
  INVALID_TOKEN: 'INVALID_TOKEN',                      // 401 token 验证失败
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',                      // 401 token 过期

  // ── 授权(2xxx)───
  FORBIDDEN: 'FORBIDDEN',                              // 403 通用拒绝
  INSUFFICIENT_SCOPE: 'INSUFFICIENT_SCOPE',            // 403 scope 不足
  TENANT_MISMATCH: 'TENANT_MISMATCH',                  // 403 跨租户访问

  // ── 参数校验(3xxx)───
  VALIDATION_ERROR: 'VALIDATION_ERROR',                // 422 Zod schema 失败
  MISSING_FIELD: 'MISSING_FIELD',                      // 400 必填字段缺失
  INVALID_FORMAT: 'INVALID_FORMAT',                    // 400 格式错误(JSON / UUID / email)
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',              // 413 body 超限
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',            // 405

  // ── 资源(4xxx)───
  NOT_FOUND: 'NOT_FOUND',                              // 404 资源不存在
  ALREADY_EXISTS: 'ALREADY_EXISTS',                    // 409 唯一约束冲突
  CONFLICT: 'CONFLICT',                                // 409 状态冲突(如 pause → active)
  DEPRECATED: 'DEPRECATED',                            // 410 v1 Sunset header 配套

  // ── 业务规则(4xxx 业务子组)───
  RATE_LIMITED: 'RATE_LIMITED',                        // 429
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',                    // 429 租户配额
  BUSINESS_RULE_VIOLATION: 'BUSINESS_RULE_VIOLATION',  // 422 业务规则违反

  // ── 内部(5xxx)───
  INTERNAL_ERROR: 'INTERNAL_ERROR',                    // 500 未捕获异常
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',                  // 501
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',          // 503 健康检查 fail

  // ── 外部依赖(9xxx)───
  DATABASE_ERROR: 'DATABASE_ERROR',                    // 500 DB 查询失败
  REDIS_ERROR: 'REDIS_ERROR',                          // 500 Redis 失败
  LLM_PROVIDER_ERROR: 'LLM_PROVIDER_ERROR',            // 502 LLM 调用失败
  MCP_SERVER_ERROR: 'MCP_SERVER_ERROR',                // 502 MCP 失败
  CC_SDK_ERROR: 'CC_SDK_ERROR',                        // 502 Claude Code SDK 失败
  EXTERNAL_API_ERROR: 'EXTERNAL_API_ERROR',            // 502 第三方 API
} as const;

export type ErrorCodeValue = typeof ErrorCode[keyof typeof ErrorCode];

// ── HTTP 状态码映射 ────────────────────────────────────────────────────
import { StatusCode } from './types.js';

/** 标准错误码 → 推荐 HTTP 状态码(路由层 try/catch 用) */
export const ERROR_STATUS_MAP: Record<ErrorCodeValue, StatusCode> = {
  [ErrorCode.UNAUTHENTICATED]: StatusCode.UNAUTHORIZED,
  [ErrorCode.INVALID_TOKEN]: StatusCode.UNAUTHORIZED,
  [ErrorCode.TOKEN_EXPIRED]: StatusCode.UNAUTHORIZED,

  [ErrorCode.FORBIDDEN]: StatusCode.FORBIDDEN,
  [ErrorCode.INSUFFICIENT_SCOPE]: StatusCode.FORBIDDEN,
  [ErrorCode.TENANT_MISMATCH]: StatusCode.FORBIDDEN,

  [ErrorCode.VALIDATION_ERROR]: StatusCode.UNPROCESSABLE_ENTITY,
  [ErrorCode.MISSING_FIELD]: StatusCode.BAD_REQUEST,
  [ErrorCode.INVALID_FORMAT]: StatusCode.BAD_REQUEST,
  [ErrorCode.PAYLOAD_TOO_LARGE]: StatusCode.PAYLOAD_TOO_LARGE,
  [ErrorCode.METHOD_NOT_ALLOWED]: StatusCode.METHOD_NOT_ALLOWED,

  [ErrorCode.NOT_FOUND]: StatusCode.NOT_FOUND,
  [ErrorCode.ALREADY_EXISTS]: StatusCode.CONFLICT,
  [ErrorCode.CONFLICT]: StatusCode.CONFLICT,
  [ErrorCode.DEPRECATED]: StatusCode.GONE,

  [ErrorCode.RATE_LIMITED]: StatusCode.TOO_MANY_REQUESTS,
  [ErrorCode.QUOTA_EXCEEDED]: StatusCode.TOO_MANY_REQUESTS,
  [ErrorCode.BUSINESS_RULE_VIOLATION]: StatusCode.UNPROCESSABLE_ENTITY,

  [ErrorCode.INTERNAL_ERROR]: StatusCode.INTERNAL_SERVER_ERROR,
  [ErrorCode.NOT_IMPLEMENTED]: StatusCode.NOT_IMPLEMENTED,
  [ErrorCode.SERVICE_UNAVAILABLE]: StatusCode.SERVICE_UNAVAILABLE,

  [ErrorCode.DATABASE_ERROR]: StatusCode.INTERNAL_SERVER_ERROR,
  [ErrorCode.REDIS_ERROR]: StatusCode.INTERNAL_SERVER_ERROR,
  [ErrorCode.LLM_PROVIDER_ERROR]: StatusCode.BAD_GATEWAY,
  [ErrorCode.MCP_SERVER_ERROR]: StatusCode.BAD_GATEWAY,
  [ErrorCode.CC_SDK_ERROR]: StatusCode.BAD_GATEWAY,
  [ErrorCode.EXTERNAL_API_ERROR]: StatusCode.BAD_GATEWAY,
};

// ── ApiError 构造工厂 ──────────────────────────────────────────────────
/** 创建统一 ApiError(避免到处拼对象) */
export function makeError(
  code: ErrorCodeValue,
  message: string,
  options?: { details?: unknown; source?: string },
): ApiError {
  const err: ApiError = { code, message };
  if (options?.details !== undefined) err.details = options.details;
  if (options?.source) err.source = options.source;
  return err;
}

/** 推断错误 source(给 5xxx/9xxx 标源) */
export function inferSource(err: unknown): string {
  if (!err || typeof err !== 'object') return 'unknown';
  const e = err as { code?: string; name?: string };
  if (e.code?.startsWith('23')) return 'db';        // PG constraint codes (23xxx)
  if (e.code === 'ECONNREFUSED' || e.code === 'ETIMEDOUT') return 'network';
  if (e.name === 'ZodError') return 'validation';
  if (e.name === 'SyntaxError') return 'json_parse';
  return 'unknown';
}
