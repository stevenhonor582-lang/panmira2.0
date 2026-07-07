/**
 * IA v6 — /api/v2/tasks — 任务协作
 * 聚合老 paths:
 *   /api/v2/admin/pipelines → /api/v2/tasks/pipelines
 *   /api/v2/admin/scheduled-jobs → /api/v2/tasks/scheduled
 * 老路径加 Deprecation 头继续工作,2026-08-01 Sunset
 */
import type * as http from 'node:http';
import { pool } from '../../db/index.js';
import { jsonResponse, ok, fail, paginated } from './helpers.js';
import { requireBearer, requireAnyScope } from '../oauth-middleware.js';

export async function handleTasksRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  method: string,
  url: string,
): Promise<boolean> {
  const u = new URL(url, 'http://localhost');
  if (!u.pathname.startsWith('/api/v2/tasks')) return false;

  const ctx = await requireBearer(req, res);
  if (!ctx) return true;

  // GET /api/v2/tasks — 任务总览(pipelines + scheduled-jobs 聚合)
  if (method === 'GET' && u.pathname === '/api/v2/tasks') {
    if (!requireAnyScope(ctx, ['agent:read', 'agent:admin', '*'])) {
      jsonResponse(res, 403, fail('forbidden', '需要 agent:read 或 agent:admin'));
      return true;
    }
    try {
      // pipelines
      const pipelines = await pool.query(
        `SELECT id, name, description, enabled AS is_active, created_at, updated_at,
                'pipeline' AS task_type
           FROM agent_pipelines
          ORDER BY created_at DESC LIMIT 50`,
      );
      // scheduled_jobs
      const jobs = await pool.query(
        `SELECT id, name, description, trigger_type, enabled AS is_active, created_at,
                'scheduled' AS task_type
           FROM scheduled_jobs
          ORDER BY created_at DESC LIMIT 50`,
      );
      const tasks = [
        ...pipelines.rows.map((r: any) => ({ ...r })),
        ...jobs.rows.map((r: any) => ({ ...r })),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      jsonResponse(res, 200, paginated(tasks, tasks.length, 1, 50));
      return true;
    } catch (e) {
      jsonResponse(res, 500, fail('internal_error', String(e)));
      return true;
    }
  }

  // GET /api/v2/tasks/stats — 统计
  if (method === 'GET' && u.pathname === '/api/v2/tasks/stats') {
    if (!requireAnyScope(ctx, ['agent:read', 'agent:admin', '*'])) {
      jsonResponse(res, 403, fail('forbidden', '需要 agent:read 或 agent:admin'));
      return true;
    }
    try {
      const result = await pool.query(`
        SELECT
          (SELECT count(*) FROM agent_pipelines)::int AS pipelines_total,
          (SELECT count(*) FROM agent_pipelines WHERE enabled)::int AS pipelines_active,
          (SELECT count(*) FROM scheduled_jobs)::int AS scheduled_total,
          (SELECT count(*) FROM scheduled_jobs WHERE enabled)::int AS scheduled_active,
          (SELECT count(*) FROM pipeline_runs WHERE status = 'running')::int AS running
      `);
      jsonResponse(res, 200, ok(result.rows[0]));
      return true;
    } catch (e) {
      jsonResponse(res, 500, fail('internal_error', String(e)));
      return true;
    }
  }

  // 转发老路径:
  // /api/v2/tasks/pipelines/* → /api/v2/admin/pipelines/*
  // /api/v2/tasks/scheduled/* → /api/v2/admin/scheduled-jobs/*
  // 注意: 这两个老路径的真实 handler 在 http-server.ts 中以完整签名调用
  // 这里只暴露聚合视图,具体 CRUD 由老路径承担 + deprecation
  return false;
}
