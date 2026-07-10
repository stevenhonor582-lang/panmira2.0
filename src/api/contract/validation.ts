/**
 * R49-B API 层统一契约 — Zod 校验入口
 *
 * 设计原则:
 * - 路由层用 parseBody<T>(req, schema) 一行搞定 JSON 解析 + 校验
 * - ZodError 自动转 ApiError(VALIDATION_ERROR + details=zodIssues)
 * - 提供 parsePagination(url) 解析 ?page=&limit=&offset=
 * - 不强制路由用 Zod(可选用),但用过的路由错误格式自动一致
 */

import type * as http from 'node:http';
import { z, type ZodSchema, type ZodTypeAny } from 'zod';
import { ErrorCode, makeError } from './errors.js';
import type { ApiError } from './types.js';

// ── 通用分页 schema ──────────────────────────────────────────────────
export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).optional(),
  sort: z.string().max(64).optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

/** 通用 ID 参数 schema(UUID) */
export const IdParamSchema = z.object({
  id: z.string().uuid('id must be UUID'),
});

/** 通用 tenant_id schema */
export const TenantIdSchema = z.string().uuid().or(z.literal('00000000-0000-0000-0000-000000000000'));

// ── 路由层 API ────────────────────────────────────────────────────────
/**
 * 解析 + 校验 JSON body,失败抛 ApiError(VIA Zod)
 * @example
 *   const body = await parseBody(req, CreateAgentSchema);
 */
export async function parseBody<T extends ZodTypeAny>(
  req: http.IncomingMessage,
  schema: T,
): Promise<z.infer<T>> {
  const raw = await readBodyRaw(req);
  if (!raw) {
    throw makeError(ErrorCode.MISSING_FIELD, 'Request body is empty');
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    throw makeError(ErrorCode.INVALID_FORMAT, 'Invalid JSON in request body', {
      details: { source: inferParseError(e) },
      source: 'json_parse',
    });
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    throw makeError(
      ErrorCode.VALIDATION_ERROR,
      'Request body validation failed',
      { details: result.error.issues, source: 'validation' },
    );
  }
  return result.data;
}

/**
 * 解析 query string + schema(空 query 也合法,会用 default)
 */
export function parseQuery<T extends ZodTypeAny>(
  url: string,
  schema: T,
): z.infer<T> {
  const u = new URL(url, 'http://localhost');
  const obj: Record<string, string> = {};
  u.searchParams.forEach((v, k) => { obj[k] = v; });
  const result = schema.safeParse(obj);
  if (!result.success) {
    throw makeError(
      ErrorCode.VALIDATION_ERROR,
      'Query parameters validation failed',
      { details: result.error.issues, source: 'validation' },
    );
  }
  return result.data;
}

/**
 * 解析 path 参数(目前用简单正则匹配 :id 等)
 */
export function parsePathParams<T extends ZodTypeAny>(
  params: Record<string, string>,
  schema: T,
): z.infer<T> {
  const result = schema.safeParse(params);
  if (!result.success) {
    throw makeError(
      ErrorCode.VALIDATION_ERROR,
      'Path parameters validation failed',
      { details: result.error.issues, source: 'validation' },
    );
  }
  return result.data;
}

// ── 内部 helper ───────────────────────────────────────────────────────
const MAX_BODY = 1 * 1024 * 1024; // 1 MB

function readBodyRaw(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (c: Buffer) => {
      total += c.length;
      if (total > MAX_BODY) {
        req.destroy();
        const err = makeError(ErrorCode.PAYLOAD_TOO_LARGE, `Request body too large (max ${MAX_BODY} bytes)`);
        reject(err);
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

function inferParseError(e: unknown): string {
  if (e instanceof Error) return e.message.slice(0, 200);
  return String(e).slice(0, 200);
}

// ── 重新导出 Zod(路由层用) ────────────────────────────────────────────
export { z, type ZodSchema, type ZodTypeAny };
export type { ApiError };
