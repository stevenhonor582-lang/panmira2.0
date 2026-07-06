/**
 * Plan F Embedding Jobs 端点:
 *   GET /api/v2/admin/embedding-jobs/:id   (knowledge:read|admin)
 *
 * 返回异步嵌入任务状态 (pending / processing / completed / failed)
 */
import type http from 'node:http';
import { eq, and } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { embeddingJobs } from '../../db/schema.js';
import { jsonResponse } from './helpers.js';
import { requireBearer, requireAnyScope } from '../oauth-middleware.js';

async function getJob(req: http.IncomingMessage, res: http.ServerResponse, id: string) {
  const ctx = await requireBearer(req, res);
  if (!ctx) return;
  if (!requireAnyScope(ctx, ['knowledge:read', 'knowledge:admin'])) {
    jsonResponse(res, 403, { error: 'insufficient_scope', required: 'knowledge:read OR knowledge:admin' }); return;
  }
  const [row] = await db.select().from(embeddingJobs).where(eq(embeddingJobs.id, id)).limit(1);
  if (!row) { jsonResponse(res, 404, { error: 'job not found' }); return; }
  if (row.tenantId !== ctx.tenantId) { jsonResponse(res, 403, { error: 'forbidden' }); return; }
  jsonResponse(res, 200, { success: true, data: row });
}

export async function handleEmbeddingJobsRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  method: string,
  url: string,
): Promise<boolean> {
  if (method !== 'GET') return false;
  const m = url.match(/^\/api\/v2\/admin\/embedding-jobs\/([^/]+)$/);
  if (m) {
    await getJob(req, res, m[1]!);
    return true;
  }
  return false;
}
