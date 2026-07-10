/**
 * R49-B API 层统一契约 — 核心类型
 *
 * 设计原则(对齐 R49-UPGRADE-PLAN.md §2 块 B):
 * - envelope 格式: { success, data?, error?, meta: { traceId, version, timestamp } }
 * - 兼容现有 src/api/routes/helpers.ts 的 ApiResponse(避免破坏 250+ 现有路由)
 * - 新增 traceId + version + timestamp 强制元数据(诊断 + 版本兼容)
 * - StatusCode 用 enum 而非魔法数字
 */

import type * as http from 'node:http';
import { randomUUID } from 'node:crypto';

// ── 标准 HTTP 状态码 enum ───────────────────────────────────────────────
/** R49-B 标准状态码 enum(覆盖 RFC 7231 + 业务 422/429) */
export enum StatusCode {
  OK = 200,
  CREATED = 201,
  ACCEPTED = 202,
  NO_CONTENT = 204,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  METHOD_NOT_ALLOWED = 405,
  GONE = 410,
  CONFLICT = 409,
  PAYLOAD_TOO_LARGE = 413,
  UNPROCESSABLE_ENTITY = 422,
  TOO_MANY_REQUESTS = 429,
  BAD_GATEWAY = 502,
  INTERNAL_SERVER_ERROR = 500,
  NOT_IMPLEMENTED = 501,
  SERVICE_UNAVAILABLE = 503,
}

// ── API 版本(对齐 v1 coexist / v2 → v3 灰度策略) ───────────────────────
/** R49-B 启用的 API 版本集合 */
export const API_VERSIONS = ['v1', 'v2', 'v3'] as const;
export type ApiVersion = typeof API_VERSIONS[number];

/** 当前推荐版本(R49-B 默认走 v3,但前端可灰度切回 v2) */
export const CURRENT_API_VERSION: ApiVersion = 'v3';

// ── 响应 envelope(扩展现有 helpers.ts ApiResponse) ──────────────────────
/** 统一 metadata(每次响应必含) */
export interface ResponseMeta {
  /** 请求/响应链路唯一 ID(用于日志关联 + 前端反馈) */
  traceId: string;
  /** API 版本(v1/v2/v3) */
  version: ApiVersion;
  /** ISO-8601 UTC 时间戳 */
  timestamp: string;
}

/** 统一错误结构(对齐现有 helpers.ts ApiResponse.error) */
export interface ApiError {
  /** 错误码(见 errors.ts ErrorCode enum) */
  code: string;
  /** 人类可读错误消息 */
  message: string;
  /** 详细错误上下文(Zod issue / DB constraint / stack 摘要) */
  details?: unknown;
  /** 错误源头(service / route / db / external) */
  source?: string;
}

/** 统一响应 envelope */
export interface UnifiedEnvelope<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta: ResponseMeta;
}

// ── traceId 生成(每次响应唯一) ──────────────────────────────────────────
/** 生成 traceId — 16 字节 hex,32 字符 */
export function generateTraceId(): string {
  return randomUUID().replace(/-/g, '');
}

/** 生成 ISO-8601 UTC 时间戳 */
export function nowIso(): string {
  return new Date().toISOString();
}

/** 从 IncomingMessage 提取或生成 traceId(优先用 header) */
export function resolveTraceId(req: http.IncomingMessage): string {
  const h = req.headers['x-trace-id'] || req.headers['x-request-id'];
  if (typeof h === 'string' && h.length > 0 && h.length <= 64) {
    return h;
  }
  return generateTraceId();
}

// ── 分页 meta(对齐 helpers.ts paginated + 新增 cursor 字段位) ──────────
/** 分页 metadata(R49-B 列表响应统一) */
export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
}

/** 分页数据包装 */
export interface PaginatedData<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

// ── helpers.ts 兼容层 ──────────────────────────────────────────────────
// 现有 src/api/routes/helpers.ts 的 ApiResponse 在 R49-B 内可作为 UnifiedEnvelope 别名使用,
// 这样 250+ 现有路由继续工作;新增路由应优先用 UnifiedEnvelope 显式声明 meta。
export type { ApiResponse } from '../routes/helpers.js';
