/**
 * R52-SCHEMA · 数字员工 招聘 / 提炼 端点
 *
 * 设计:
 *   - 招聘:POST /api/v2/digital-employees/recruit
 *     body { hrId, instanceConfig }
 *     → 读 HR 蓝图 + 合并 instanceConfig → INSERT agent_instances
 *
 *   - 提炼:POST /api/v2/digital-employees/:id/promote-to-hr
 *     body { name }
 *     → 读 instance + 关联 HR → 合并"实例修改的静态字段"→ INSERT 新 HR(source='custom')
 *     → 写 instance_to_hr 表
 *
 * 与 /api/v2/digital-hr 配套,数字员工生命周期完整闭环。
 */
import type * as http from 'node:http';
import { pool } from '../../db/index.js';
import { jsonResponse, parseJsonBody } from './helpers.js';
import { requireBearer, requireAnyScope } from '../oauth-middleware.js';
import { generateWorkingDir } from '../../db/agent-store.js';

// 实例动态字段(招聘 instanceConfig 允许写入)
const INSTANCE_DYNAMIC = new Set([
  'name', 'channelIds', 'ownerUserId', 'workingDir',
  'modelId', 'defaultEngine', 'defaultModel',
  'defaultContextWindow', 'defaultMaxTurns',
  'visibility', 'isActive', 'complexityLevel',
  'deploymentType', 'temperature', 'avatarUrl', 'avatarGlyph', 'avatarHue', 'displayName',
]);

// 招聘写实例时,以下字段(动态)在 INSERT 时单独处理
const INSTANCE_FIELD_MAP: Record<string, string> = {
  name: 'name',
  ownerUserId: 'owner_user_id',
  workingDir: 'working_dir',
  modelId: 'model_id',
  defaultEngine: 'default_engine',
  defaultModel: 'default_model',
  defaultContextWindow: 'default_context_window',
  defaultMaxTurns: 'default_max_turns',
  visibility: 'visibility',
  isActive: 'is_active',
  complexityLevel: 'complexity_level',
  deploymentType: 'deployment_type',
  temperature: 'temperature',
  avatarUrl: 'avatar_url',
  avatarGlyph: 'avatar_glyph',
  avatarHue: 'avatar_hue',
  displayName: 'display_name',
};

// HR 蓝图静态字段(提炼时复制这些)
const HR_STATIC = [
  'name', 'role_template', 'description', 'capabilities', 'tools',
  'persona', 'system_prompt', 'style', 'category', 'template_type',
  'iron_laws', 'boundary', 'orchestration',
];

export async function handleDigitalEmployeeRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  method: string,
  url: string,
): Promise<boolean> {
  const u = new URL(url, 'http://localhost');
  if (!u.pathname.startsWith('/api/v2/digital-employees')) return false;

  const ctx = await requireBearer(req, res);
  if (!ctx) return true;
  const tenantId = ctx.tenantId || '00000000-0000-0000-0000-000000000000';

  // ── POST /api/v2/digital-employees/recruit ── 招聘
  if (method === 'POST' && u.pathname === '/api/v2/digital-employees/recruit') {
    if (!requireAnyScope(ctx, ['agent:admin', '*'])) {
      jsonResponse(res, 403, { error: 'forbidden', message: '需要 agent:admin 权限' });
      return true;
    }
    const client = await pool.connect();
    try {
      const body = await parseJsonBody(req);
      const hrId: string | undefined = typeof body?.hrId === 'string' ? body.hrId : undefined;
      const cfg: Record<string, any> = (body?.instanceConfig && typeof body.instanceConfig === 'object')
        ? body.instanceConfig : {};

      if (!hrId) {
        jsonResponse(res, 400, {
          error: 'hr_required',
          message: 'hrId 必填(无 HR 不能建实例,所有实例必须挂在模板下)',
        });
        return true;
      }

      // 校验 instance.name
      const instanceName = typeof cfg.name === 'string' && cfg.name.trim() ? cfg.name.trim() : null;
      if (!instanceName) {
        jsonResponse(res, 400, { error: 'bad_request', message: 'instanceConfig.name 必填' });
        return true;
      }

      await client.query('BEGIN');

      // 读 HR
      const hrRes = await client.query(
        `SELECT * FROM agent_templates WHERE id = $1 AND tenant_id = $2`,
        [hrId, tenantId],
      );
      if (hrRes.rows.length === 0) {
        await client.query('ROLLBACK');
        jsonResponse(res, 404, { error: 'hr_not_found', message: `HR ${hrId} 不存在` });
        return true;
      }
      const hr = hrRes.rows[0];

      // 重名检查
      const dupCheck = await client.query(
        `SELECT 1 FROM agent_instances WHERE name = $1 LIMIT 1`,
        [instanceName],
      );
      if (dupCheck.rows.length > 0) {
        await client.query('ROLLBACK');
        jsonResponse(res, 409, { error: 'name_taken', message: `实例名 "${instanceName}" 已存在` });
        return true;
      }

      // INSERT instance — 蓝图字段从 HR 拷,动态字段从 cfg 拷(id 走 DB default)
      const cols: string[] = [
        'tenant_id', 'name',
        'role_template', 'description', 'capabilities', 'tools',
        'persona', 'system_prompt', 'category', 'template_type',
        'iron_laws', 'orchestration', 'boundary',
        'source_template_id', 'source_type',
      ];
      const vals: any[] = [
        tenantId, instanceName,
        hr.role_template ?? null, hr.description ?? null,
        JSON.stringify(hr.capabilities ?? []),
        JSON.stringify(hr.tools ?? []),
        hr.persona ?? null, hr.system_prompt ?? null,
        hr.category ?? 'general',
        hr.template_type ?? 'custom',
        JSON.stringify(hr.iron_laws ?? []),
        JSON.stringify(hr.orchestration ?? {}),
        JSON.stringify(hr.boundary ?? {}),
        hrId, // FK → HR
        hr.source === 'custom' ? 'custom' : 'system', // 沿用 HR 来源类型
      ];

      // 动态字段(从 cfg)
      for (const [jsKey, dbCol] of Object.entries(INSTANCE_FIELD_MAP)) {
        if (jsKey === 'name') continue; // 已加
        if (!(jsKey in cfg)) continue;
        cols.push(dbCol);
        let v = cfg[jsKey];
        if (dbCol === 'channel_ids') v = JSON.stringify(Array.isArray(v) ? v : []);
        else if (v === undefined) v = null;
        else if (dbCol === 'is_active') v = v === false ? false : true;
        else if (dbCol === 'temperature' && typeof v === 'number') v = v;
        else if (typeof v === 'string' && v.length === 0) v = null;
        vals.push(v);
      }
      cols.push('channel_ids');
      vals.push(JSON.stringify(Array.isArray(cfg.channelIds) ? cfg.channelIds : []));

      // 默认值兜底
      cols.push('status');
      vals.push('active');

      cols.push('created_by');
      vals.push(ctx.userId || null);

      const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');
      const insertSql = `INSERT INTO agent_instances (${cols.join(', ')}) VALUES (${placeholders}) RETURNING *`;
      const insertRes = await client.query(insertSql, vals);
      const created = insertRes.rows[0];

      // working_dir 兜底(R27 规则 5: 拼音首字母)
      if (!cfg.workingDir) {
        const wd = generateWorkingDir(instanceName);
        await client.query(
          `UPDATE agent_instances SET working_dir = $1 WHERE id = $2`,
          [wd, created.id],
        );
        created.working_dir = wd;
      }

      await client.query('COMMIT');

      // 重新读取返回完整字段
      const finalRes = await pool.query(
        `SELECT * FROM agent_instances WHERE id = $1`,
        [created.id],
      );
      jsonResponse(res, 201, {
        instance: finalRes.rows[0],
        source_hr: { id: hr.id, name: hr.name, category: hr.category },
      });
      return true;
    } catch (e: any) {
      await client.query('ROLLBACK').catch(() => {});
      const msg = String(e?.message || e);
      jsonResponse(res, 500, { error: 'internal_error', message: msg });
      return true;
    } finally {
      client.release();
    }
  }

  // ── POST /api/v2/digital-employees/:id/promote-to-hr ── 提炼
  const promoteMatch = u.pathname.match(/^\/api\/v2\/digital-employees\/([0-9a-f-]{36})\/promote-to-hr$/);
  if (promoteMatch && method === 'POST') {
    if (!requireAnyScope(ctx, ['agent:admin', '*'])) {
      jsonResponse(res, 403, { error: 'forbidden', message: '需要 agent:admin 权限' });
      return true;
    }
    const instanceId = promoteMatch[1];
    const client = await pool.connect();
    try {
      const body = await parseJsonBody(req);
      const newName: string | undefined = typeof body?.name === 'string' ? body.name.trim() : undefined;
      if (!newName) {
        jsonResponse(res, 400, { error: 'bad_request', message: 'name 必填(新 HR 名)' });
        return true;
      }

      await client.query('BEGIN');

      // 读 instance
      const instRes = await client.query(
        `SELECT * FROM agent_instances WHERE id = $1 AND tenant_id = $2`,
        [instanceId, tenantId],
      );
      if (instRes.rows.length === 0) {
        await client.query('ROLLBACK');
        jsonResponse(res, 404, { error: 'instance_not_found', message: `实例 ${instanceId} 不存在` });
        return true;
      }
      const inst = instRes.rows[0];

      // 读原 HR(用于追溯)
      const hrRes = await client.query(
        `SELECT * FROM agent_templates WHERE id = $1`,
        [inst.source_template_id],
      );
      if (hrRes.rows.length === 0) {
        await client.query('ROLLBACK');
        jsonResponse(res, 500, { error: 'hr_missing', message: '原 HR 模板已不存在' });
        return true;
      }
      const sourceHr = hrRes.rows[0];

      // 合成新 HR 字段 = 原 HR 静态字段 + 实例修改的静态字段
      // 不带 skill/mcp/tool/memory/kb/folder/entry/model/ctx/channel
      const merged: Record<string, any> = {};
      for (const col of HR_STATIC) {
        // 实例上字段优先(用户实际改过的)
        merged[col] = inst[col] !== null && inst[col] !== undefined ? inst[col] : sourceHr[col];
      }
      merged.name = newName;
      merged.source = 'custom';
      merged.is_active = true;

      // 重名检查
      const dupCheck = await client.query(
        `SELECT 1 FROM agent_templates WHERE name = $1 AND tenant_id = $2 LIMIT 1`,
        [newName, tenantId],
      );
      if (dupCheck.rows.length > 0) {
        await client.query('ROLLBACK');
        jsonResponse(res, 409, { error: 'name_taken', message: `HR 名 "${newName}" 已存在` });
        return true;
      }

      const insertCols = [
        'tenant_id', 'name', 'role_template', 'description',
        'capabilities', 'tools', 'persona', 'system_prompt',
        'style', 'category', 'template_type',
        'iron_laws', 'orchestration', 'boundary',
        'source', 'visibility', 'is_active', 'created_by',
      ];
      const insertVals: any[] = [
        tenantId, newName,
        merged.role_template ?? null, merged.description ?? null,
        JSON.stringify(merged.capabilities ?? []),
        JSON.stringify(merged.tools ?? []),
        merged.persona ?? null, merged.system_prompt ?? null,
        merged.style ?? null,
        merged.category ?? 'general',
        merged.template_type ?? 'custom',
        JSON.stringify(merged.iron_laws ?? []),
        JSON.stringify(merged.orchestration ?? {}),
        JSON.stringify(merged.boundary ?? {}),
        'custom',
        'private', // 新提炼 HR 默认私有,owner 手动公开
        true,
        ctx.userId || null,
      ];
      const placeholders = insertVals.map((_, i) => `$${i + 1}`).join(', ');
      const insertRes = await client.query(
        `INSERT INTO agent_templates (${insertCols.join(', ')})
         VALUES (${placeholders}) RETURNING *`,
        insertVals,
      );
      const newHr = insertRes.rows[0];

      // 写 instance_to_hr 追溯表
      const snapshot = {
        instance_name: inst.name,
        instance_static_fields: {
          persona: inst.persona,
          system_prompt: inst.system_prompt,
          style: merged.style,
          description: inst.description,
          role_template: inst.role_template,
          category: inst.category,
          template_type: inst.template_type,
          iron_laws: inst.iron_laws,
          orchestration: inst.orchestration,
          boundary: inst.boundary,
          capabilities: inst.capabilities,
          tools: inst.tools,
        },
        promoted_at: new Date().toISOString(),
      };
      await client.query(
        `INSERT INTO instance_to_hr (instance_id, source_template_id, new_template_id, snapshot, created_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [instanceId, inst.source_template_id, newHr.id, JSON.stringify(snapshot), ctx.userId || null],
      );

      await client.query('COMMIT');

      jsonResponse(res, 201, {
        hr: newHr,
        source_hr: { id: sourceHr.id, name: sourceHr.name },
        instance: { id: inst.id, name: inst.name },
        instance_to_hr: {
          source_template_id: inst.source_template_id,
          new_template_id: newHr.id,
        },
      });
      return true;
    } catch (e: any) {
      await client.query('ROLLBACK').catch(() => {});
      jsonResponse(res, 500, { error: 'internal_error', message: String(e?.message || e) });
      return true;
    } finally {
      client.release();
    }
  }

  return false;
}
