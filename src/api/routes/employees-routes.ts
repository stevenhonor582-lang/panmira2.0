/**
 * IA v6 → R15-A — /api/v2/employees — 数字员工 + 模板系统
 *
 * - GET /api/v2/employees?filter=instance|template|all  (默认 instance)
 * - GET /api/v2/employees/templates                      模板列表
 * - GET /api/v2/employees/:id                            单个(含 R15-A 字段)
 * - GET /api/v2/employees/stats
 * - POST /api/v2/employees/from-template                 从模板复制实例
 * - PATCH /api/v2/employees/:id                          白名单编辑
 */
import type * as http from 'node:http';
import { pool } from '../../db/index.js';
import { jsonResponse, ok, fail, paginated } from './helpers.js';
import { requireBearer, requireAnyScope } from '../oauth-middleware.js';
import { AgentStore } from '../../db/agent-store.js';
import { parseJsonBody } from './helpers.js';

const agentStore = new AgentStore();

export async function handleEmployeesRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  method: string,
  url: string,
): Promise<boolean> {
  const u = new URL(url, 'http://localhost');
  if (!u.pathname.startsWith('/api/v2/employees')) return false;

  const ctx = await requireBearer(req, res);
  if (!ctx) return true;

  const tenantId = ctx.tenantId || '00000000-0000-0000-0000-000000000000';

  // GET /api/v2/employees/templates — 模板列表(必须在 :id 之前匹配)
  if (method === 'GET' && u.pathname === '/api/v2/employees/templates') {
    if (!requireAnyScope(ctx, ['agent:read', 'agent:admin', '*'])) {
      jsonResponse(res, 403, fail('forbidden', '需要 agent:read 或 agent:admin'));
      return true;
    }
    try {
      const templates = await agentStore.listTemplates();
      jsonResponse(res, 200, paginated(templates, templates.length, 1, templates.length));
      return true;
    } catch (e) {
      jsonResponse(res, 500, fail('internal_error', String(e)));
      return true;
    }
  }

  // GET /api/v2/employees — 列表(支持 filter=instance|template|all + status 过滤)
  if (method === 'GET' && u.pathname === '/api/v2/employees') {
    if (!requireAnyScope(ctx, ['agent:read', 'agent:admin', '*'])) {
      jsonResponse(res, 403, fail('forbidden', '需要 agent:read 或 agent:admin'));
      return true;
    }
    try {
      const limit = Math.min(parseInt(u.searchParams.get('limit') || '100', 10), 200);
      const offset = parseInt(u.searchParams.get('offset') || '0', 10);
      const status = u.searchParams.get('status'); // active|paused|deprecated
      const filter = u.searchParams.get('filter') || 'instance'; // instance|template|all

      const params: unknown[] = [tenantId];
      let where = 'tenant_id = $1';
      if (filter === 'template') {
        where += ' AND is_template = true';
      } else if (filter === 'all') {
        // 不加 is_template 条件
      } else {
        // instance (默认)
        where += ' AND is_template = false';
      }
      if (status === 'active' || status === 'paused' || status === 'deprecated') {
        params.push(status);
        where += ` AND status = $${params.length}`;
      }

      params.push(limit); params.push(offset);
      const result = await pool.query(
        `SELECT
            id, name, display_name, role_template, description,
            capabilities, tools, deployment_type, is_active,
            version, status, model_id, owner_user_id, source_template_id,
            is_template, working_dir, channel_ids, visibility, temperature,
            persona, complexity_level, default_engine, default_model,
            created_at, updated_at
           FROM agents
          WHERE ${where}
          ORDER BY is_template DESC, created_at DESC
          LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );
      const countResult = await pool.query(
        `SELECT count(*) AS c FROM agents WHERE ${where}`,
        params.slice(0, params.length - 2),
      );
      jsonResponse(res, 200, paginated(result.rows, parseInt(countResult.rows[0].c, 10), Math.floor(offset / limit) + 1, limit));
      return true;
    } catch (e) {
      jsonResponse(res, 500, fail('internal_error', String(e)));
      return true;
    }
  }

  // GET /api/v2/employees/:id — 详情(完整 row,含 R15-A 字段)
  const empMatch = u.pathname.match(/^\/api\/v2\/employees\/([0-9a-f-]{36})$/);
  if (method === 'GET' && empMatch) {
    const id = empMatch[1];
    try {
      const agent = await agentStore.findById(id);
      if (!agent) {
        jsonResponse(res, 404, fail('not_found', `Employee ${id} 不存在`));
        return true;
      }
      jsonResponse(res, 200, ok(agent));
      return true;
    } catch (e) {
      jsonResponse(res, 500, fail('internal_error', String(e)));
      return true;
    }
  }

  // GET /api/v2/employees/stats
  if (method === 'GET' && u.pathname === '/api/v2/employees/stats') {
    if (!requireAnyScope(ctx, ['agent:read', 'agent:admin', '*'])) {
      jsonResponse(res, 403, fail('forbidden', '需要 agent:read 或 agent:admin'));
      return true;
    }
    try {
      const result = await pool.query(
        `SELECT
           count(*)::int AS total,
           count(*) FILTER (WHERE status = 'active')::int AS active,
           count(*) FILTER (WHERE status = 'paused')::int AS paused,
           count(*) FILTER (WHERE status = 'deprecated')::int AS deprecated,
           count(*) FILTER (WHERE is_template)::int AS templates,
           count(*) FILTER (WHERE deployment_type = 'bot')::int AS bots,
           count(*) FILTER (WHERE deployment_type = 'job')::int AS jobs,
           count(*) FILTER (WHERE deployment_type = 'api')::int AS apis
         FROM agents WHERE tenant_id = $1`,
        [tenantId],
      );
      jsonResponse(res, 200, ok(result.rows[0]));
      return true;
    } catch (e) {
      jsonResponse(res, 500, fail('internal_error', String(e)));
      return true;
    }
  }

  // POST /api/v2/employees/from-template — 从模板复制创建独立 agent 实例
  if (method === 'POST' && u.pathname === '/api/v2/employees/from-template') {
    if (!requireAnyScope(ctx, ['agent:admin', '*'])) {
      jsonResponse(res, 403, fail('forbidden', '需要 agent:admin 权限'));
      return true;
    }
    try {
      const body = await parseJsonBody(req);
      const templateId = typeof body?.templateId === 'string' ? body.templateId : undefined;
      const name = typeof body?.name === 'string' ? body.name : undefined;
      const ownerIdRaw: unknown = body?.ownerId;
      const ownerId: string | null =
        typeof ownerIdRaw === 'string' && ownerIdRaw.length > 0 ? ownerIdRaw : null;
      if (!templateId || typeof templateId !== 'string') {
        jsonResponse(res, 400, fail('bad_request', 'templateId 必填'));
        return true;
      }
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        jsonResponse(res, 400, fail('bad_request', 'name 必填'));
        return true;
      }
      const created = await agentStore.createInstanceFromTemplate(templateId, {
        name: name.trim(),
        ownerId,
      });
      if (!created) {
        jsonResponse(res, 404, fail('not_found', `Template ${templateId} 不存在`));
        return true;
      }
      jsonResponse(res, 201, ok(created));
      return true;
    } catch (e) {
      jsonResponse(res, 500, fail('internal_error', String(e)));
      return true;
    }
  }

  // PATCH /api/v2/employees/:id — 编辑(白名单 + RBAC: admin/operator)
  if (method === 'PATCH' && empMatch) {
    const id = empMatch[1];
    if (!requireAnyScope(ctx, ['agent:admin', '*'])) {
      jsonResponse(res, 403, fail('forbidden', '需要 agent:admin 权限'));
      return true;
    }
    try {
      const body = await parseJsonBody(req);
      const map: Record<string, string> = {
        name: 'name',
        description: 'description',
        persona: 'persona',
        system_prompt: 'systemPrompt',
        role_template: 'roleTemplate',
        category: 'category',
        template_type: 'templateType',
        capabilities: 'capabilities',
        tools: 'tools',
        skills: 'skills',
        knowledge_folders: 'knowledgeFolders',
        iron_laws: 'ironLaws',
        boundary: 'boundary',
        orchestration: 'orchestration',
        default_engine: 'defaultEngine',
        default_model: 'defaultModel',
        default_context_window: 'defaultContextWindow',
        default_max_turns: 'defaultMaxTurns',
        complexity_level: 'complexityLevel',
        engine: 'engine',
        status: 'status',
        owner_user_id: 'ownerId',
        is_active: 'isActive',
        // R15-A new
        is_template: 'isTemplate',
        working_dir: 'workingDir',
        channel_ids: 'channelIds',
        visibility: 'visibility',
        temperature: 'temperature',
      };
      const updates: Record<string, unknown> = {};
      for (const [snake, camel] of Object.entries(map)) {
        if (snake in body) updates[camel] = body[snake];
      }
      if (Object.keys(updates).length === 0) {
        jsonResponse(res, 400, fail('no_fields', '请求体未包含任何可更新字段'));
        return true;
      }
      const agent = await agentStore.update(id, updates);
      if (!agent) {
        jsonResponse(res, 404, fail('not_found', `Employee ${id} 不存在`));
        return true;
      }
      jsonResponse(res, 200, ok(agent));
      return true;
    } catch (e) {
      jsonResponse(res, 500, fail('internal_error', String(e)));
      return true;
    }
  }

  return false;
}
