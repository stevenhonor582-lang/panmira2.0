/**
 * R52-SCHEMA · 数字 HR(数字员工模板)CRUD 路由
 *
 * 设计原则(R52-REFACTOR-PLAN):
 *   - HR = agent_templates 表,只描述静态蓝图(name/role/persona/system_prompt/style...)
 *   - 严格分离动态字段(instance 才有 channel_ids/model_id/working_dir/...)
 *   - 与 /api/v2/employees 解耦,不复用其路由
 *
 * 端点:
 *   GET    /api/v2/digital-hr              列表(分类/搜索/分页)
 *   POST   /api/v2/digital-hr              新建(仅接受静态字段,后端兜底拒绝动态字段)
 *   GET    /api/v2/digital-hr/:id          详情
 *   PATCH  /api/v2/digital-hr/:id          改(白名单)
 *   DELETE /api/v2/digital-hr/:id          删(检查无人引用)
 */
import type * as http from 'node:http';
import { eq, and, desc, ilike, or } from 'drizzle-orm';
import { db, pool } from '../../db/index.js';
import { agentTemplates } from '../../db/schema.js';
import { jsonResponse, parseJsonBody } from './helpers.js';
import { requireBearer, requireAnyScope } from '../oauth-middleware.js';

// 允许写入的字段白名单(HR 蓝图静态字段,严禁动态字段)
const HR_WRITABLE = new Set([
  'name', 'roleTemplate', 'description', 'capabilities', 'tools',
  'persona', 'systemPrompt', 'style', 'category', 'templateType',
  'ironLaws', 'boundary', 'orchestration',
  'visibility', 'source', 'isActive',
]);

// 严禁字段(动态字段是 instance 独有的)
const HR_FORBIDDEN = new Set([
  'channelIds', 'channel_ids', 'ownerUserId', 'owner_user_id',
  'workingDir', 'working_dir', 'modelId', 'model_id',
  'defaultEngine', 'default_engine', 'defaultModel', 'default_model',
  'defaultContextWindow', 'default_context_window', 'defaultMaxTurns', 'default_max_turns',
  'status', 'deploymentType', 'deployment_type', 'temperature',
  'avatarUrl', 'avatar_glyph', 'avatarHue', 'displayName', 'avatar_url',
  'sourceTemplateId', 'source_template_id',
]);

// camelCase → snake_case 字段映射(白名单)
const HR_FIELD_MAP: Record<string, string> = {
  name: 'name',
  roleTemplate: 'role_template',
  description: 'description',
  capabilities: 'capabilities',
  tools: 'tools',
  persona: 'persona',
  systemPrompt: 'system_prompt',
  style: 'style',
  category: 'category',
  templateType: 'template_type',
  ironLaws: 'iron_laws',
  boundary: 'boundary',
  orchestration: 'orchestration',
  visibility: 'visibility',
  source: 'source',
  isActive: 'is_active',
};

export async function handleHrRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  method: string,
  url: string,
): Promise<boolean> {
  const u = new URL(url, 'http://localhost');
  if (!u.pathname.startsWith('/api/v2/digital-hr')) return false;

  const ctx = await requireBearer(req, res);
  if (!ctx) return true;
  const tenantId = ctx.tenantId || '00000000-0000-0000-0000-000000000000';

  // ── GET /api/v2/digital-hr ── 列表
  if (method === 'GET' && u.pathname === '/api/v2/digital-hr') {
    if (!requireAnyScope(ctx, ['agent:read', 'agent:admin', '*'])) {
      jsonResponse(res, 403, { error: 'forbidden', message: '需要 agent:read 或 agent:admin' });
      return true;
    }
    try {
      const limit = Math.min(parseInt(u.searchParams.get('limit') || '50', 10), 200);
      const offset = parseInt(u.searchParams.get('offset') || '0', 10);
      const category = u.searchParams.get('category');
      const q = u.searchParams.get('q');
      const source = u.searchParams.get('source');
      const visibility = u.searchParams.get('visibility');

      const conds: any[] = [eq(agentTemplates.tenantId, tenantId)];
      if (category) conds.push(eq(agentTemplates.category, category));
      if (source) conds.push(eq(agentTemplates.source, source));
      if (visibility) conds.push(eq(agentTemplates.visibility, visibility));
      if (q) {
        conds.push(or(
          ilike(agentTemplates.name, `%${q}%`),
          ilike(agentTemplates.roleTemplate, `%${q}%`),
          ilike(agentTemplates.description, `%${q}%`),
        ));
      }
      const where = and(...conds);

      const rows = await db.select().from(agentTemplates).where(where)
        .orderBy(desc(agentTemplates.createdAt))
        .limit(limit).offset(offset);
      const totalResult = await pool.query(
        `SELECT count(*)::int AS c FROM agent_templates WHERE tenant_id = $1`,
        [tenantId],
      );
      jsonResponse(res, 200, {
        hrs: rows,
        total: totalResult.rows[0].c,
        limit, offset,
      });
      return true;
    } catch (e) {
      jsonResponse(res, 500, { error: 'internal_error', message: String(e) });
      return true;
    }
  }

  // ── POST /api/v2/digital-hr ── 新建
  if (method === 'POST' && u.pathname === '/api/v2/digital-hr') {
    if (!requireAnyScope(ctx, ['agent:admin', '*'])) {
      jsonResponse(res, 403, { error: 'forbidden', message: '需要 agent:admin 权限' });
      return true;
    }
    try {
      const body = await parseJsonBody(req);
      if (!body || typeof body !== 'object') {
        jsonResponse(res, 400, { error: 'bad_request', message: 'body 必填' });
        return true;
      }

      // 严禁字段检查
      for (const k of Object.keys(body)) {
        if (HR_FORBIDDEN.has(k)) {
          jsonResponse(res, 400, {
            error: 'forbidden_field',
            message: `HR 蓝图不允许字段 "${k}"(该字段属于 instance,不是 HR 蓝图)`,
          });
          return true;
        }
      }

      if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
        jsonResponse(res, 400, { error: 'bad_request', message: 'name 必填' });
        return true;
      }

      const insertCols: string[] = ['tenant_id', 'name'];
      const insertVals: any[] = [tenantId, body.name.trim()];

      for (const [jsKey, dbCol] of Object.entries(HR_FIELD_MAP)) {
        if (jsKey === 'name') continue; // 已加
        if (!(jsKey in body)) continue;
        insertCols.push(dbCol);
        const v = body[jsKey];
        if (['capabilities', 'tools', 'iron_laws', 'boundary', 'orchestration'].includes(dbCol)) {
          insertVals.push(JSON.stringify(v ?? (dbCol === 'boundary' || dbCol === 'orchestration' ? {} : [])));
        } else {
          insertVals.push(v ?? null);
        }
      }
      insertCols.push('created_by');
      insertVals.push(ctx.userId || null);

      // id 列无 DB default,显式 INSERT id = gen_random_uuid()
      const placeholders = insertVals.map((_, i) => `$${i + 1}`).join(', ');
      const sql = `INSERT INTO agent_templates (id, ${insertCols.join(', ')})
                   VALUES (gen_random_uuid(), ${placeholders}) RETURNING *`;
      const result = await pool.query(sql, insertVals);
      jsonResponse(res, 201, { hr: result.rows[0] });
      return true;
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (msg.includes('unique') || msg.includes('duplicate')) {
        jsonResponse(res, 409, { error: 'conflict', message: msg });
        return true;
      }
      jsonResponse(res, 500, { error: 'internal_error', message: msg });
      return true;
    }
  }

  // ── /:id 详情/改/删 ──
  const idMatch = u.pathname.match(/^\/api\/v2\/digital-hr\/([0-9a-f-]{36})$/);
  if (idMatch) {
    const id = idMatch[1];

    // GET
    if (method === 'GET') {
      if (!requireAnyScope(ctx, ['agent:read', 'agent:admin', '*'])) {
        jsonResponse(res, 403, { error: 'forbidden', message: '需要 agent:read 或 agent:admin' });
        return true;
      }
      try {
        const r = await pool.query(
          `SELECT * FROM agent_templates WHERE id = $1 AND tenant_id = $2`,
          [id, tenantId],
        );
        if (r.rows.length === 0) {
          jsonResponse(res, 404, { error: 'not_found', message: `HR ${id} 不存在` });
          return true;
        }
        jsonResponse(res, 200, { hr: r.rows[0] });
        return true;
      } catch (e) {
        jsonResponse(res, 500, { error: 'internal_error', message: String(e) });
        return true;
      }
    }

    // PATCH
    if (method === 'PATCH') {
      if (!requireAnyScope(ctx, ['agent:admin', '*'])) {
        jsonResponse(res, 403, { error: 'forbidden', message: '需要 agent:admin 权限' });
        return true;
      }
      try {
        const body = await parseJsonBody(req);
        if (!body || typeof body !== 'object') {
          jsonResponse(res, 400, { error: 'bad_request', message: 'body 必填' });
          return true;
        }

        for (const k of Object.keys(body)) {
          if (HR_FORBIDDEN.has(k)) {
            jsonResponse(res, 400, {
              error: 'forbidden_field',
              message: `HR 蓝图不允许字段 "${k}"(该字段属于 instance)`,
            });
            return true;
          }
        }

        const setCols: string[] = [];
        const setVals: any[] = [];
        for (const [jsKey, dbCol] of Object.entries(HR_FIELD_MAP)) {
          if (!(jsKey in body)) continue;
          setCols.push(`${dbCol} = $${setVals.length + 1}`);
          const v = body[jsKey];
          if (['capabilities', 'tools', 'iron_laws', 'boundary', 'orchestration'].includes(dbCol)) {
            setVals.push(JSON.stringify(v ?? (dbCol === 'boundary' || dbCol === 'orchestration' ? {} : [])));
          } else {
            setVals.push(v ?? null);
          }
        }
        if (setCols.length === 0) {
          jsonResponse(res, 400, { error: 'bad_request', message: '无可更新字段' });
          return true;
        }
        setCols.push(`updated_at = now()`);
        setVals.push(id, tenantId);
        const sql = `UPDATE agent_templates SET ${setCols.join(', ')}
                     WHERE id = $${setVals.length - 1} AND tenant_id = $${setVals.length}
                     RETURNING *`;
        const r = await pool.query(sql, setVals);
        if (r.rows.length === 0) {
          jsonResponse(res, 404, { error: 'not_found', message: `HR ${id} 不存在` });
          return true;
        }
        jsonResponse(res, 200, { hr: r.rows[0] });
        return true;
      } catch (e) {
        jsonResponse(res, 500, { error: 'internal_error', message: String(e) });
        return true;
      }
    }

    // DELETE — 检查是否被 instance 引用(RESTRICT FK 也会挡,但先给清晰错误)
    if (method === 'DELETE') {
      if (!requireAnyScope(ctx, ['agent:admin', '*'])) {
        jsonResponse(res, 403, { error: 'forbidden', message: '需要 agent:admin 权限' });
        return true;
      }
      try {
        const refCheck = await pool.query(
          `SELECT count(*)::int AS c FROM agent_instances WHERE source_template_id = $1`,
          [id],
        );
        if ((refCheck.rows[0]?.c ?? 0) > 0) {
          jsonResponse(res, 409, {
            error: 'hr_in_use',
            message: `HR ${id} 仍被 ${refCheck.rows[0].c} 个实例引用,无法删除`,
          });
          return true;
        }
        const r = await pool.query(
          `DELETE FROM agent_templates WHERE id = $1 AND tenant_id = $2 RETURNING id`,
          [id, tenantId],
        );
        if (r.rows.length === 0) {
          jsonResponse(res, 404, { error: 'not_found', message: `HR ${id} 不存在` });
          return true;
        }
        jsonResponse(res, 200, { deleted: id });
        return true;
      } catch (e: any) {
        const msg = String(e?.message || e);
        if (msg.includes('foreign key') || msg.includes('violates')) {
          jsonResponse(res, 409, { error: 'hr_in_use', message: 'HR 仍被引用,无法删除' });
          return true;
        }
        jsonResponse(res, 500, { error: 'internal_error', message: msg });
        return true;
      }
    }
  }

  return false;
}
