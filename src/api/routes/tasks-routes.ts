/**
 * IA v6 — /api/v2/tasks — 任务协作
 * 聚合老 paths:
 *   /api/v2/admin/pipelines → /api/v2/tasks/pipelines
 *   /api/v2/admin/scheduled-jobs → /api/v2/tasks/scheduled
 * 老路径加 Deprecation 头继续工作,2026-08-01 Sunset
 */
import type * as http from 'node:http';
import { pool } from '../../db/index.js';
import { jsonResponse, ok, fail, paginated, parseJsonBody } from './helpers.js';
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

  // ═══════════════════════════════════════════════════════════
  // R13-D 新增: 模板 / 协作者 / 绑定
  // ═══════════════════════════════════════════════════════════

  // GET /api/v2/tasks/templates — 模板列表
  if (method === 'GET' && u.pathname === '/api/v2/tasks/templates') {
    if (!requireAnyScope(ctx, ['agent:read', 'agent:admin', '*'])) {
      jsonResponse(res, 403, fail('forbidden', '需要 agent:read 或 agent:admin'));
      return true;
    }
    try {
      const category = u.searchParams.get('category');
      const params: unknown[] = [];
      let where = 'is_template = true';
      if (category === 'system' || category === 'user') {
        params.push(category);
        where += ` AND COALESCE(template_category, 'system') = $${params.length}`;
      }
      const result = await pool.query(
        `SELECT id, name, description, nodes, edges, trigger_type,
                template_category, owner_id, created_at, updated_at
           FROM agent_pipelines
          WHERE ${where}
          ORDER BY created_at DESC LIMIT 200`,
        params,
      );
      jsonResponse(res, 200, ok({ templates: result.rows, total: result.rows.length }));
      return true;
    } catch (e) {
      jsonResponse(res, 500, fail('internal_error', String(e)));
      return true;
    }
  }

  // POST /api/v2/tasks/templates — 把现有 pipeline 另存为模板
  if (method === 'POST' && u.pathname === '/api/v2/tasks/templates') {
    if (!requireAnyScope(ctx, ['agent:admin', '*'])) {
      jsonResponse(res, 403, fail('forbidden', '需要 agent:admin'));
      return true;
    }
    try {
      const body = await parseJsonBody(req);
      const sourceId = body?.sourcePipelineId;
      if (!sourceId) {
        jsonResponse(res, 400, fail('bad_request', 'sourcePipelineId 必填'));
        return true;
      }
      const src = await pool.query(
        `SELECT id, name, description, nodes, edges, trigger_type, trigger_config,
                timeout_ms, retry_policy, owner_id
           FROM agent_pipelines WHERE id = $1`,
        [sourceId],
      );
      if (src.rows.length === 0) {
        jsonResponse(res, 404, fail('not_found', '源任务不存在'));
        return true;
      }
      const r = src.rows[0];
      const inserted = await pool.query(
        `INSERT INTO agent_pipelines
           (tenant_id, name, description, nodes, edges, trigger_type, trigger_config,
            timeout_ms, retry_policy, owner_id, status, is_template,
            template_category, parent_template_id, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'active',true,$11,$12,$13)
         RETURNING id, name, created_at`,
        [
          ctx.tenantId || null,
          body?.name || `${r.name} · 模板`,
          body?.description || r.description,
          JSON.stringify(r.nodes || []),
          JSON.stringify(r.edges || []),
          r.trigger_type || 'manual',
          JSON.stringify(r.trigger_config || {}),
          r.timeout_ms || 600000,
          JSON.stringify(r.retry_policy || null),
          ctx.userId || null,
          body?.category === 'system' ? 'system' : 'user',
          sourceId,
          ctx.userId || null,
        ],
      );
      jsonResponse(res, 201, ok(inserted.rows[0]));
      return true;
    } catch (e) {
      jsonResponse(res, 500, fail('internal_error', String(e)));
      return true;
    }
  }

  // POST /api/v2/tasks/from-template — 从模板创建任务
  if (method === 'POST' && u.pathname === '/api/v2/tasks/from-template') {
    if (!requireAnyScope(ctx, ['agent:admin', '*'])) {
      jsonResponse(res, 403, fail('forbidden', '需要 agent:admin'));
      return true;
    }
    try {
      const body = await parseJsonBody(req);
      const tplId = body?.templateId;
      if (!tplId) {
        jsonResponse(res, 400, fail('bad_request', 'templateId 必填'));
        return true;
      }
      const tpl = await pool.query(
        `SELECT id, name, description, nodes, edges, trigger_type, trigger_config,
                timeout_ms, retry_policy
           FROM agent_pipelines WHERE id = $1 AND is_template = true`,
        [tplId],
      );
      if (tpl.rows.length === 0) {
        jsonResponse(res, 404, fail('not_found', '模板不存在'));
        return true;
      }
      const t = tpl.rows[0];
      const inserted = await pool.query(
        `INSERT INTO agent_pipelines
           (tenant_id, name, description, nodes, edges, trigger_type, trigger_config,
            timeout_ms, retry_policy, owner_id, status, is_template,
            parent_template_id, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'active',false,$11,$12)
         RETURNING id, name, created_at`,
        [
          ctx.tenantId || null,
          body?.name || `${t.name} · 副本`,
          body?.description || t.description,
          JSON.stringify(t.nodes || []),
          JSON.stringify(t.edges || []),
          t.trigger_type || 'manual',
          JSON.stringify(t.trigger_config || {}),
          t.timeout_ms || 600000,
          JSON.stringify(t.retry_policy || null),
          ctx.userId || null,
          tplId,
          ctx.userId || null,
        ],
      );
      jsonResponse(res, 201, ok(inserted.rows[0]));
      return true;
    } catch (e) {
      jsonResponse(res, 500, fail('internal_error', String(e)));
      return true;
    }
  }

  // GET /api/v2/tasks/pipelines/:id/bindings — 任务绑定
  const bindMatch = u.pathname.match(/^\/api\/v2\/tasks\/pipelines\/([^/]+)\/bindings$/);
  if (method === 'GET' && bindMatch) {
    if (!requireAnyScope(ctx, ['agent:read', 'agent:admin', '*'])) {
      jsonResponse(res, 403, fail('forbidden', '需要 agent:read 或 agent:admin'));
      return true;
    }
    try {
      const id = bindMatch[1];
      const rows = await pool.query(
        `SELECT id, name, owner_id, collaborators, nodes
           FROM agent_pipelines WHERE id = $1`,
        [id],
      );
      if (rows.rows.length === 0) {
        jsonResponse(res, 404, fail('not_found', '任务不存在'));
        return true;
      }
      const r = rows.rows[0];
      const collaborators = Array.isArray(r.collaborators) ? r.collaborators : [];
      let owner: any = null;
      const team: any[] = [];
      if (r.owner_id) {
        const u2 = await pool.query(
          `SELECT id, name, email FROM users WHERE id = $1`, [r.owner_id],
        );
        if (u2.rows.length) owner = u2.rows[0];
      }
      if (collaborators.length) {
        const t = await pool.query(
          `SELECT id, name, email FROM users WHERE id = ANY($1::uuid[])`,
          [collaborators],
        );
        team.push(...t.rows);
      }
      const bots: any[] = [];
      try {
        const nodes = Array.isArray(r.nodes) ? r.nodes : [];
        const botIds = new Set<string>();
        for (const n of nodes) {
          const meta = (n as any)?.meta || {};
          if (meta.kind === 'bot' && meta.refId) botIds.add(String(meta.refId));
        }
        if (botIds.size) {
          const ag = await pool.query(
            `SELECT id, name, status FROM agent_instances WHERE id = ANY($1::text[])`,
            [Array.from(botIds)],
          );
          bots.push(...ag.rows);
        }
      } catch { /* nodes 可能为空 */ }
      jsonResponse(res, 200, ok({
        pipelineId: r.id, pipelineName: r.name,
        ownerId: r.owner_id, owner,
        collaborators: team,
        participatingBots: bots,
      }));
      return true;
    } catch (e) {
      jsonResponse(res, 500, fail('internal_error', String(e)));
      return true;
    }
  }

  // PATCH /api/v2/tasks/pipelines/:id/bindings
  if (method === 'PATCH' && bindMatch) {
    if (!requireAnyScope(ctx, ['agent:admin', '*'])) {
      jsonResponse(res, 403, fail('forbidden', '需要 agent:admin'));
      return true;
    }
    try {
      const id = bindMatch[1];
      const body = await parseJsonBody(req);
      const updates: string[] = [];
      const params: unknown[] = [];
      if (body?.ownerId !== undefined) {
        params.push(body.ownerId || null);
        updates.push(`owner_id = $${params.length}`);
      }
      if (Array.isArray(body?.collaboratorIds)) {
        params.push(body.collaboratorIds);
        updates.push(`collaborators = $${params.length}::uuid[]`);
      }
      if (updates.length === 0) {
        jsonResponse(res, 400, fail('bad_request', '无更新字段'));
        return true;
      }
      params.push(id);
      await pool.query(
        `UPDATE agent_pipelines SET ${updates.join(', ')}, updated_at = now() WHERE id = $${params.length}`,
        params,
      );
      jsonResponse(res, 200, ok({ updated: true }));
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
