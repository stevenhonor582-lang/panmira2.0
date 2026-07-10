/**
 * R49-B 统一错误响应中间件
 *
 * 设计目标:
 * - 包裹路由 handler try/catch,自动捕获所有抛出
 * - 抛 ApiError → 用其 code + message + details
 * - 抛带 statusCode 的 Error(如 PayloadTooLargeError) → 映射到对应错误码
 * - 抛任意 Error → 兜底 INTERNAL_ERROR,不暴露 stack 给客户端
 * - 每次响应注入 meta: { traceId, version, timestamp }
 * - 向后兼容: 不破坏现有 jsonResponse 调用(R49-B 内新增路由优先用 withErrorBoundary)
 *
 * 使用:
 *   import { withErrorBoundary, sendError, sendOk } from '../middleware/unified-error.js';
 *
 *   export async function handleFoo(req, res) {
 *     return withErrorBoundary(req, res, 'v3', async () => {
 *       const data = await db.query(...);
 *       sendOk(res, data, 'v3');
 *     });
 *   }
 */
import type * as http from 'node:http';
import {
  type UnifiedEnvelope,
  type ApiError,
  type ApiVersion,
  type ErrorCodeValue,
  StatusCode,
  ErrorCode,
  ERROR_STATUS_MAP,
  makeError,
  generateTraceId,
  nowIso,
  resolveTraceId,
  inferSource,
} from '../contract/index.js';
import { jsonResponse } from '../routes/helpers.js';

// ── 业务异常类(让路由主动抛) ──────────────────────────────────────────
/**
 * 路由层可主动抛出的 ApiError 异常
 * - 被 withErrorBoundary 捕获
 * - 自动用 ERROR_STATUS_MAP 选 HTTP 状态码
 */
export class ApiException extends Error {
  public readonly apiError: ApiError;
  public readonly statusCode: number;

  constructor(code: ErrorCodeValue, message: string, options?: { details?: unknown; source?: string; statusCode?: number }) {
    super(message);
    this.name = 'ApiException';
    this.apiError = makeError(code, message, options);
    // 优先用调用方指定的 statusCode;否则查 ERROR_STATUS_MAP;最后兜底 500
    this.statusCode = options?.statusCode ?? ERROR_STATUS_MAP[code] ?? StatusCode.INTERNAL_SERVER_ERROR;
  }
}

/**
 * 兼容旧路由: 带 statusCode 字段的 Error 也视为业务异常
 * 例: PayloadTooLargeError.statusCode = 413
 */
function isHttpError(e: unknown): e is Error & { statusCode: number } {
  return e instanceof Error && typeof (e as any).statusCode === 'number';
}

// ── 响应构造器 ────────────────────────────────────────────────────────
/**
 * 成功响应 — 注入 traceId + version + timestamp
 */
export function sendOk<T>(
  res: http.ServerResponse,
  data: T,
  version: ApiVersion,
  traceId?: string,
): void {
  const envelope: UnifiedEnvelope<T> = {
    success: true,
    data,
    meta: {
      traceId: traceId ?? generateTraceId(),
      version,
      timestamp: nowIso(),
    },
  };
  jsonResponse(res, StatusCode.OK, envelope);
}

/**
 * 201 Created
 */
export function sendCreated<T>(
  res: http.ServerResponse,
  data: T,
  version: ApiVersion,
  traceId?: string,
): void {
  const envelope: UnifiedEnvelope<T> = {
    success: true,
    data,
    meta: {
      traceId: traceId ?? generateTraceId(),
      version,
      timestamp: nowIso(),
    },
  };
  jsonResponse(res, StatusCode.CREATED, envelope);
}

/**
 * 202 Accepted(异步任务)
 */
export function sendAccepted<T>(
  res: http.ServerResponse,
  data: T,
  version: ApiVersion,
  traceId?: string,
): void {
  const envelope: UnifiedEnvelope<T> = {
    success: true,
    data,
    meta: {
      traceId: traceId ?? generateTraceId(),
      version,
      timestamp: nowIso(),
    },
  };
  jsonResponse(res, StatusCode.ACCEPTED, envelope);
}

/**
 * 204 No Content
 */
export function sendNoContent(res: http.ServerResponse): void {
  res.statusCode = StatusCode.NO_CONTENT;
  res.end();
}

/**
 * 错误响应 — 直接发(供中间件 / 鉴权层用)
 */
export function sendError(
  res: http.ServerResponse,
  err: ApiError,
  version: ApiVersion,
  traceId?: string,
  statusCode?: number,
): void {
  const status = statusCode ?? ERROR_STATUS_MAP[err.code as ErrorCodeValue] ?? StatusCode.INTERNAL_SERVER_ERROR;
  const envelope: UnifiedEnvelope = {
    success: false,
    error: err,
    meta: {
      traceId: traceId ?? generateTraceId(),
      version,
      timestamp: nowIso(),
    },
  };
  // 5xx 不暴露内部 stack,只暴露 message
  if (status >= 500 && !err.message) {
    envelope.error = { ...err, message: 'Internal Server Error' };
  }
  jsonResponse(res, status, envelope);
}

// ── Error Boundary 包裹器 ──────────────────────────────────────────────
/**
 * 包裹路由 handler,捕获所有异常并转统一 envelope
 *
 * @param req IncomingMessage
 * @param res ServerResponse
 * @param version API 版本(v1/v2/v3)
 * @param handler 实际业务逻辑
 * @returns 是否已响应(给上层路由器用作短路信号)
 */
export async function withErrorBoundary(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  version: ApiVersion,
  handler: () => Promise<void> | void,
): Promise<boolean> {
  const traceId = resolveTraceId(req);
  // 把 traceId 挂到 res,handler 内 sendOk / sendError 透传用
  (res as any).traceId = traceId;

  try {
    await handler();
    return true;
  } catch (e) {
    handleCaughtError(e, res, version, traceId);
    return true;
  }
}

/**
 * 处理已捕获的错误(供 withErrorBoundary 和路由自己调用)
 */
export function handleCaughtError(
  e: unknown,
  res: http.ServerResponse,
  version: ApiVersion,
  traceId: string,
): void {
  // 1. ApiException 直接用
  if (e instanceof ApiException) {
    sendError(res, e.apiError, version, traceId, e.statusCode);
    return;
  }

  // 2. 带 statusCode 的 Error(PayloadTooLargeError 等)
  if (isHttpError(e)) {
    const code = mapStatusCodeToErrorCode(e.statusCode);
    sendError(
      res,
      makeError(code, e.message || 'Request failed', { details: undefined, source: inferSource(e) }),
      version,
      traceId,
      e.statusCode,
    );
    return;
  }

  // 3. 普通 Error → 兜底 INTERNAL_ERROR(不暴露 stack)
  if (e instanceof Error) {
    // 仅服务端日志记录完整 stack
    console.error('[R49-B error-boundary]', { traceId, message: e.message, stack: e.stack });
    sendError(
      res,
      makeError(ErrorCode.INTERNAL_ERROR, e.message || 'Internal Server Error', {
        source: inferSource(e),
      }),
      version,
      traceId,
      StatusCode.INTERNAL_SERVER_ERROR,
    );
    return;
  }

  // 4. 非 Error(如 throw 'string')→ 完全兜底
  console.error('[R49-B error-boundary non-Error]', { traceId, value: e });
  sendError(
    res,
    makeError(ErrorCode.INTERNAL_ERROR, 'Internal Server Error'),
    version,
    traceId,
    StatusCode.INTERNAL_SERVER_ERROR,
  );
}

/** 把 HTTP 状态码反向映射到标准错误码 */
function mapStatusCodeToErrorCode(status: number): ErrorCodeValue {
  switch (status) {
    case 400: return ErrorCode.INVALID_FORMAT;
    case 401: return ErrorCode.UNAUTHENTICATED;
    case 403: return ErrorCode.FORBIDDEN;
    case 404: return ErrorCode.NOT_FOUND;
    case 405: return ErrorCode.METHOD_NOT_ALLOWED;
    case 409: return ErrorCode.CONFLICT;
    case 413: return ErrorCode.PAYLOAD_TOO_LARGE;
    case 422: return ErrorCode.VALIDATION_ERROR;
    case 429: return ErrorCode.RATE_LIMITED;
    case 500: return ErrorCode.INTERNAL_ERROR;
    case 501: return ErrorCode.NOT_IMPLEMENTED;
    case 503: return ErrorCode.SERVICE_UNAVAILABLE;
    default: return status >= 500 ? ErrorCode.INTERNAL_ERROR : ErrorCode.INVALID_FORMAT;
  }
}
