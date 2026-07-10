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
      const filter = u.searchParams.get('filter') || 'instance'; // instance|template|all|unassigned
      const owner = u.searchParams.get('owner'); // R27 规则 4: 配合 filter=unassigned,owner_user_id IS NULL OR = owner

      const params: unknown[] = [tenantId];
      let where = 'tenant_id = $1';
      if (filter === 'template') {
        where += ' AND is_template = true';
      } else if (filter === 'all') {
        // 不加 is_template 条件
      } else if (filter === 'unassigned') {
        // R27 规则 4: 未归属 OR 归属当前真人(用于真人详情添加 agent 选择器)
        where += ' AND is_template = false';
        if (owner) {
          params.push(owner);
          where += ` AND (owner_user_id IS NULL OR owner_user_id = $${params.length})`;
        } else {
          where += ' AND owner_user_id IS NULL';
        }
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

  // POST /api/v2/employees/test-config — R17-3 发布前测试
  // 检查 model/skills/mcp/kb/folders/channels 引用是否有效
  if (method === 'POST' && u.pathname === '/api/v2/employees/test-config') {
    if (!requireAnyScope(ctx, ['agent:read', 'agent:admin', '*'])) {
      jsonResponse(res, 403, fail('forbidden', '需要 agent:read 或 agent:admin'));
      return true;
    }
    try {
      const body = await parseJsonBody(req);
      const providerId = typeof body?.providerId === 'string' ? body.providerId : '';
      const providerModel = typeof body?.providerModel === 'string' ? body.providerModel : '';
      const skillIds: string[] = Array.isArray(body?.skillIds) ? body.skillIds.filter((x) => typeof x === 'string') : [];
      const mcpServerIds: string[] = Array.isArray(body?.mcpServerIds) ? body.mcpServerIds.filter((x) => typeof x === 'string') : [];
      const kbFolderIds: string[] = Array.isArray(body?.kbFolderIds) ? body.kbFolderIds.filter((x) => typeof x === 'string') : [];
      const knowledgeBaseIds: string[] = Array.isArray(body?.knowledgeBaseIds) ? body.knowledgeBaseIds.filter((x) => typeof x === 'string') : [];
      const channelIds: string[] = Array.isArray(body?.channelIds) ? body.channelIds.filter((x) => typeof x === 'string') : [];

      const results: Array<{ category: string; item: string; key: string; ok: boolean; detail: string }> = [];

      // 1) 模型 / Provider — provider_configs
      if (providerId) {
        try {
          const r = await pool.query(
            `SELECT id, name, model, api_key_encrypted, base_url FROM provider_configs WHERE id = $1`,
            [providerId],
          );
          if (r.rows.length === 0) {
            results.push({ category: 'model', item: '模型', key: `model:${providerId}`, ok: false, detail: `provider_configs.id=${providerId} 不存在(可能已被删除)` });
          } else {
            const row = r.rows[0] as { name: string; model: string; api_key_encrypted: string | null; base_url: string };
            const hasKey = !!row.api_key_encrypted && row.api_key_encrypted.length > 0;
            const okModel = !!row.model;
            const okFlag = hasKey && okModel;
            const bits: string[] = [];
            if (okModel) bits.push(`model=${row.model}`);
            if (hasKey) bits.push('api_key 已配置');
            else bits.push('⚠ api_key 未配置');
            if (row.base_url) bits.push(`base_url=${row.base_url}`);
            results.push({
              category: 'model',
              item: `模型 · ${row.name || providerModel || providerId}`,
              key: `model:${providerId}`,
              ok: okFlag,
              detail: bits.join(' · '),
            });
          }
        } catch (e) {
          results.push({ category: 'model', item: '模型', key: `model:${providerId}`, ok: false, detail: `查询失败: ${String(e)}` });
        }
      } else {
        results.push({ category: 'model', item: '模型', key: 'model', ok: false, detail: '未选择 provider(回到 Step 2 选模型)' });
      }

      // 2) 技能 — skills (按 id 或 name)
      for (const sid of skillIds) {
        try {
          const r = await pool.query(
            `SELECT id, name, description FROM skills WHERE id::text = $1 OR name = $2`,
            [sid, sid],
          );
          if (r.rows.length === 0) {
            results.push({ category: 'skill', item: `技能 · ${sid}`, key: `skill:${sid}`, ok: false, detail: '未找到(可能已被删除或重命名)' });
          } else {
            const row = r.rows[0] as { name: string; description: string };
            const desc = row.description ? ` · ${row.description.slice(0, 40)}` : '';
            results.push({ category: 'skill', item: `技能 · ${row.name}`, key: `skill:${sid}`, ok: true, detail: `已加载${desc}` });
          }
        } catch (e) {
          results.push({ category: 'skill', item: `技能 · ${sid}`, key: `skill:${sid}`, ok: false, detail: `查询失败: ${String(e)}` });
        }
      }

      // 3) MCP servers — mcp_servers
      for (const mid of mcpServerIds) {
        try {
          const r = await pool.query(
            `SELECT id, name, url, transport, health_status FROM mcp_servers WHERE id::text = $1`,
            [mid],
          );
          if (r.rows.length === 0) {
            results.push({ category: 'mcp', item: `MCP · ${mid}`, key: `mcp:${mid}`, ok: false, detail: '未找到' });
          } else {
            const row = r.rows[0] as { name: string; url: string; transport: string; health_status: string };
            const healthOk = row.health_status === 'ok' || row.health_status === 'healthy' || row.health_status === 'unknown';
            results.push({
              category: 'mcp',
              item: `MCP · ${row.name}`,
              key: `mcp:${mid}`,
              ok: healthOk,
              detail: `transport=${row.transport} · health=${row.health_status} · url=${row.url || '(未配置)'}`,
            });
          }
        } catch (e) {
          results.push({ category: 'mcp', item: `MCP · ${mid}`, key: `mcp:${mid}`, ok: false, detail: `查询失败: ${String(e)}` });
        }
      }

      // 4) 知识文件夹 — folders
      for (const fid of kbFolderIds) {
        try {
          const r = await pool.query(`SELECT id, name, path FROM folders WHERE id = $1`, [fid]);
          if (r.rows.length === 0) {
            results.push({ category: 'folder', item: `文件夹 · ${fid}`, key: `folder:${fid}`, ok: false, detail: '未找到' });
          } else {
            const row = r.rows[0] as { name: string; path: string };
            results.push({ category: 'folder', item: `文件夹 · ${row.name}`, key: `folder:${fid}`, ok: true, detail: `path=${row.path}` });
          }
        } catch (e) {
          results.push({ category: 'folder', item: `文件夹 · ${fid}`, key: `folder:${fid}`, ok: false, detail: `查询失败: ${String(e)}` });
        }
      }

      // 5) 知识库 — knowledge_bases
      for (const kid of knowledgeBaseIds) {
        try {
          const r = await pool.query(
            `SELECT kb.id, kb.name, kb.index_status, COUNT(d.id)::int AS docs
             FROM knowledge_bases kb
             LEFT JOIN documents d ON d.kb_id = kb.id::text OR d.knowledge_base_id = kb.id::text
             WHERE kb.id::text = $1
             GROUP BY kb.id, kb.name, kb.index_status`,
            [kid],
          );
          if (r.rows.length === 0) {
            results.push({ category: 'kb', item: `知识库 · ${kid}`, key: `kb:${kid}`, ok: false, detail: '未找到' });
          } else {
            const row = r.rows[0] as { name: string; index_status: string; docs: number };
            const okIdx = row.index_status === 'ready' || row.index_status === 'indexed';
            results.push({
              category: 'kb',
              item: `知识库 · ${row.name}`,
              key: `kb:${kid}`,
              ok: okIdx,
              detail: `${row.docs} 文档 · index=${row.index_status}`,
            });
          }
        } catch (e) {
          results.push({ category: 'kb', item: `知识库 · ${kid}`, key: `kb:${kid}`, ok: false, detail: `查询失败: ${String(e)}` });
        }
      }

      // 6) 频道绑定 — bot_configs (channelIds 实际上是 agent id 列表)
      for (const cid of channelIds) {
        try {
          const r = await pool.query(
            `SELECT a.id, a.name, a.status, b.id AS bot_id, b.platform, b.is_active
             FROM agents a
             LEFT JOIN bot_configs b ON b.bot_id::text = a.id::text
             WHERE a.id::text = $1`,
            [cid],
          );
          if (r.rows.length === 0) {
            results.push({ category: 'channel', item: `频道 · ${cid}`, key: `channel:${cid}`, ok: false, detail: 'agent 未找到' });
          } else {
            const row = r.rows[0] as { name: string; status: string; bot_id: string | null; platform: string | null; is_active: boolean | null };
            if (!row.bot_id) {
              results.push({ category: 'channel', item: `频道 · ${row.name}`, key: `channel:${cid}`, ok: false, detail: 'agent 未绑定 bot_config(去频道页绑定)' });
            } else if (!row.is_active) {
              results.push({ category: 'channel', item: `频道 · ${row.name}`, key: `channel:${cid}`, ok: false, detail: `platform=${row.platform} · bot 已禁用` });
            } else {
              results.push({ category: 'channel', item: `频道 · ${row.name}`, key: `channel:${cid}`, ok: true, detail: `platform=${row.platform} · 已激活` });
            }
          }
        } catch (e) {
          results.push({ category: 'channel', item: `频道 · ${cid}`, key: `channel:${cid}`, ok: false, detail: `查询失败: ${String(e)}` });
        }
      }

      const okCount = results.filter((r) => r.ok).length;
      const failCount = results.length - okCount;
      jsonResponse(res, 200, ok({
        results,
        summary: {
          ok: okCount,
          fail: failCount,
          total: results.length,
          allOk: failCount === 0,
        },
      }));
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
      let created;
      try {
        created = await agentStore.createInstanceFromTemplate(templateId, {
          name: name.trim(),
          ownerId,
        });
      } catch (e: any) {
        const msg = String(e?.message || e);
        if (msg.includes('已存在')) {
          jsonResponse(res, 409, fail('name_taken', msg));
          return true;
        }
        jsonResponse(res, 500, fail('internal_error', msg));
        return true;
      }
      if (!created) {
        jsonResponse(res, 404, fail('not_found', `Template ${templateId} 不存在`));
        return true;
      }
      jsonResponse(res, 201, ok({ ...created, _hint: '已创建独立实例' }));
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
        // R38-C3: model_id FK 直写(权威)
        model_id: 'modelId',
      };
      const updates: Record<string, unknown> = {};
      for (const [snake, camel] of Object.entries(map)) {
        if (snake in body) updates[camel] = body[snake];
      }
      if (Object.keys(updates).length === 0) {
        jsonResponse(res, 400, fail('no_fields', '请求体未包含任何可更新字段'));
        return true;
      }
      // R35+R38-C3: channel_ids 独占校验 + 双向同步
      //  - 解绑:旧 channelIds 中不再出现的 bot_id → bot_configs.agent_id = NULL
      //  - 新增:新 channelIds 中的 bot_id → bot_configs.agent_id = $id(独占校验后)
      // 根因:R34-A 只填了 agents.channel_ids,没回填 bot_configs.agent_id → 3/5 bot 缺失
      if ('channelIds' in updates) {
        const newCids = Array.isArray(updates.channelIds) ? updates.channelIds.filter((x) => typeof x === 'string') : [];
        const newSet = new Set(newCids);
        // R35: 解绑 — 不在新列表里的旧 bot 清空 agent_id
        await pool.query(
          `UPDATE bot_configs SET agent_id = NULL
           WHERE agent_id::text = $1 AND NOT (bot_id::text = ANY($2))`,
          [id, Array.from(newSet)]
        );

        // 找已被其他 agent 占用的 bot_id(独占校验)
        const conflict = await pool.query(
          `SELECT bot_id, agent_id FROM bot_configs
           WHERE bot_id::text = ANY($1) AND agent_id IS NOT NULL AND agent_id::text != $2`,
          [newCids, id]
        );
        if (conflict.rows.length > 0) {
          const occupied = conflict.rows.map((r: { bot_id: string }) => r.bot_id);
          // 找出占用方 agent 名字
          const owners = await pool.query(
            `SELECT id, name FROM agents WHERE id::text = ANY($1)`,
            [conflict.rows.map(r => r.agent_id)]
          );
          const ownerMap = Object.fromEntries(owners.rows.map((r: { id: string; name: string }) => [r.id, r.name]));
          const detail = conflict.rows
            .map((r: { bot_id: string; agent_id: string }) => `${r.bot_id}(已占用 · ${ownerMap[r.agent_id] || r.agent_id})`)
            .join('; ');
          jsonResponse(res, 409, fail('bot_already_bound', `入口已被其他实例占用: ${detail}`));
          return true;
        }
      }
      let agent;
      try {
        agent = await agentStore.update(id, updates);
      } catch (e: any) {
        const code = (e && e.code) || '';
        const msg = String(e?.message || e);
        if (code === 'bot_already_bound') {
          jsonResponse(res, 409, fail('bot_already_bound', msg));
          return true;
        }
        if (msg.includes('已存在')) {
          jsonResponse(res, 409, fail('name_taken', msg));
          return true;
        }
        jsonResponse(res, 500, fail('update_failed', msg));
        return true;
      }
      if (!agent) {
        jsonResponse(res, 404, fail('not_found', `Employee ${id} 不存在`));
        return true;
      }

      // R38-C3: PATCH 模型字段联级 + channelIds 联级 — 在 AgentStore.update 成功之后跑
      //         (前置 PATCH 已校验独占,但不写 bot_configs.agent_id → 这里补)
      try {
        // 3.2: 新增的 channelId 同步写 bot_configs.agent_id
        if ('channelIds' in updates) {
          const newCids = Array.isArray(updates.channelIds) ? updates.channelIds.filter((x) => typeof x === 'string') : [];
          if (newCids.length > 0) {
            // 仅写 agent_id=NULL 或已 = $id 的(独占校验已保证不会写其它 agent 的 bot)
            await pool.query(
              `UPDATE bot_configs SET agent_id = $1::uuid
               WHERE bot_id::text = ANY($2)
                 AND (agent_id IS NULL OR agent_id::text = $1)`,
              [id, newCids],
            );
          }
        }

        // 3.1: model_id / defaultEngine / defaultModel 联级
        const hasModelId = 'modelId' in updates;
        const hasDefaultEng = 'defaultEngine' in updates;
        const hasDefaultModel = 'defaultModel' in updates;
        if (hasModelId || hasDefaultEng || hasDefaultModel) {
          let resolvedModelId: string | null | undefined = updates.modelId as string | null | undefined;
          let resolvedEngine: string | null | undefined = updates.defaultEngine as string | null | undefined;
          let resolvedModel: string | null | undefined = updates.defaultModel as string | null | undefined;

          // 只给了 modelId 时反查 provider_configs → 同步 defaultEngine/defaultModel
          if (hasModelId && !hasDefaultEng && !hasDefaultModel) {
            const mid = resolvedModelId;
            if (mid && typeof mid === 'string') {
              const pc = await pool.query(
                `SELECT id, type, model FROM provider_configs WHERE id::text = $1 LIMIT 1`,
                [mid],
              );
              if (pc.rows[0]) {
                resolvedEngine = pc.rows[0].type as string;
                resolvedModel = pc.rows[0].model as string;
                await pool.query(
                  `UPDATE agents SET default_engine = $1, default_model = $2 WHERE id::text = $3`,
                  [resolvedEngine, resolvedModel, id],
                );
              }
            } else if (mid === null || mid === '') {
              // 清空 model_id
              resolvedEngine = null;
              resolvedModel = null;
            }
          }

          // 同时给了 modelId → 写 agents.model_id FK
          if (hasModelId && resolvedModelId && typeof resolvedModelId === 'string') {
            await pool.query(
              `UPDATE agents SET model_id = $1 WHERE id::text = $2`,
              [resolvedModelId, id],
            );
          } else if (hasModelId && (resolvedModelId === null || resolvedModelId === '')) {
            await pool.query(
              `UPDATE agents SET model_id = NULL WHERE id::text = $1`,
              [id],
            );
          }

          // 同步 chat_sessions.model + model_engine(best-effort,JOIN bot_configs 反查)
          // 注意:chat_sessions 当前 PK 是 (bot_name, chat_id),无 agent_id 列 — R38 stage 1 待补
          // 我们走 JOIN 通过 bot_configs.agent_id 定位这个 agent 的所有 bot
          if (resolvedEngine !== undefined || resolvedModel !== undefined) {
            try {
              await pool.query(
                `UPDATE chat_sessions cs
                 SET model = COALESCE($2, cs.model),
                     model_engine = COALESCE($3, cs.model_engine),
                     updated_at = now()
                 FROM bot_configs bc
                 WHERE cs.bot_name = bc.name
                   AND bc.agent_id::text = $1`,
                [id, resolvedModel ?? null, resolvedEngine ?? null],
              );
            } catch (csErr) {
              // chat_sessions 更新失败不影响主流程(墨言示例也无 session)
            }
          }
        }
      } catch (cascadeErr) {
        // 联级失败不回滚 PATCH(主表已更新);记日志,后续清理
        // eslint-disable-next-line no-console
        console.warn(`[PATCH /api/v2/employees/${id}] cascade failed:`, (cascadeErr as Error).message);
      }

      // R39: PATCH 联级后重拉 agent,响应返回 DB 最新状态
      //   (AgentStore.update 返回的是入参 data 拼的对象,不是 DB 真实最新行)
      //   否则前端 PATCH model_id 后看到的 defaultModel 是旧值(误导)
      try {
        const fresh = await agentStore.findById(id);
        if (fresh) agent = fresh;
      } catch (reloadErr) {
        // 重拉失败用旧的,不影响主流程
        console.warn(`[PATCH /api/v2/employees/${id}] reload after cascade failed:`, (reloadErr as Error).message);
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
