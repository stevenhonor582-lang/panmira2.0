/**
 * R49-B Step 5 — v3 列表响应试点
 *
 * 目的: 演示 R49-B 统一列表响应格式(R49-B 内新路由模板)
 *
 *   { success: true, data: [...], pagination: { total, page, limit },
 *     meta: { traceId, version, timestamp } }
 *
 * 与 v2 旧格式对比:
 *   v2 helpers.paginated: { success, data: { items: [...], total, page, limit } }
 *   v3 R49-B:              { success, data: [...], pagination: {...}, meta: {...} }
 *
 * 试点路由:
 *   GET /api/v3/employees          (列出 agent instances)
 *   GET /api/v3/agents             (admin agents list)
 *
 * 兼容性:
 *   - 不破坏 v2 路由
 *   - 旧前端继续走 v2,新前端逐步切 v3
 */
import type * as http from 'node:http';
import { withErrorBoundary, sendPaginated, ApiException } from '../middleware/unified-error.js';
import { requireBearer, requireScope } from '../middleware/auth.js';
import { ErrorCode, parseQuery, PaginationQuerySchema } from '../contract/index.js';
import { db } from '../../db/index.js';
import { agentInstances, agentTemplates } from '../../db/schema.js';
import { eq, sql, desc } from 'drizzle-orm';

// ── GET /api/v3/employees — agent instances 列表(R49-B 新格式) ──────────
export async function handleV3ListRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  method: string,
  url: string,
): Promise<boolean> {
  const u = new URL(url, 'http://localhost');
  if (!u.pathname.startsWith('/api/v3/')) return false;
  if (method !== 'GET') return false;

  return withErrorBoundary(req, res, 'v3', async () => {
    const ctx = await requireBearer(req, res);
    if (!ctx) throw new ApiException(ErrorCode.UNAUTHENTICATED, '需要 Bearer token');

    const tenantId = ctx.tenantId || '00000000-0000-0000-0000-000000000000';
    const q = parseQuery(url, PaginationQuerySchema);
    const offset = (q.page - 1) * q.limit;

    // ── GET /api/v3/employees — instances list ──
    if (u.pathname === '/api/v3/employees') {
      requireScope(ctx, 'agent:read');

      const rows = await db
        .select()
        .from(agentInstances)
        .where(eq(agentInstances.tenantId, tenantId))
        .orderBy(desc(agentInstances.createdAt))
        .limit(q.limit)
        .offset(offset);

      const totalRow = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(agentInstances)
        .where(eq(agentInstances.tenantId, tenantId));

      const total = Number(totalRow[0]?.count ?? 0);
      sendPaginated(res, rows, total, q.page, q.limit, 'v3');
      return;
    }

    // ── GET /api/v3/agents — admin agents list ──
    if (u.pathname === '/api/v3/agents') {
      requireScope(ctx, 'agent:admin');

      const rows = await db
        .select()
        .from(agentTemplates)
        .orderBy(desc(agentTemplates.createdAt))
        .limit(q.limit)
        .offset(offset);

      const totalRow = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(agentTemplates);

      const total = Number(totalRow[0]?.count ?? 0);
      sendPaginated(res, rows, total, q.page, q.limit, 'v3');
      return;
    }

    // 未匹配的 v3 路径不处理
    throw new ApiException(ErrorCode.NOT_FOUND, `v3 route not found: ${u.pathname}`);
  });
}
