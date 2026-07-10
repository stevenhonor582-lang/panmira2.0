import type * as http from 'node:http';
import { eq, desc } from 'drizzle-orm';
import { db, pool } from '../../db/index.js';
import { agents } from '../../db/schema.js';
import { jsonResponse, parseJsonBody } from './helpers.js';
import { requireBearer, requireAnyScope } from '../oauth-middleware.js';
import { generateWorkingDir } from '../../db/agent-store.js';


/**
 * L9 #C: Normalize a pipeline trigger strategy value coming from the request body.
 * Accepts the canonical union ('first' | 'all' | 'race'); anything else is dropped
 * so the backend never persists an unknown value into the jsonb column.
 */
const TRIGGER_STRATEGIES = new Set(['first', 'all', 'race']);
function normalizeTriggerStrategy(raw: unknown): 'first' | 'all' | 'race' | undefined {
  return typeof raw === 'string' && TRIGGER_STRATEGIES.has(raw)
    ? (raw as 'first' | 'all' | 'race')
    : undefined;
}

/**
 * L9 #C: Merge a triggerStrategy into an existing orchestration jsonb blob.
 * Preserves every other key (orchestration may hold unrelated future config).
 * Returns undefined if there is nothing to persist.
 */
function mergeStrategyIntoOrchestration(
  orchestration: unknown,
  strategy: 'first' | 'all' | 'race' | undefined,
): Record<string, unknown> | undefined {
  if (!strategy) {
    return orchestration && typeof orchestration === 'object'
      ? (orchestration as Record<string, unknown>)
      : undefined;
  }
  const base = orchestration && typeof orchestration === 'object'
    ? (orchestration as Record<string, unknown>)
    : {};
  return { ...base, triggerStrategy: strategy };
}

export async function handleAgentsCrudRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  method: string,
  url: string,
): Promise<boolean> {
  const u = new URL(url, 'http://localhost');
  if (!u.pathname.startsWith('/api/v2/admin/agents')) return false;

  const ctx = await requireBearer(req, res);
  if (!ctx) return true;

  if (method === 'GET' && u.pathname === '/api/v2/admin/agents') {
    // P9 RBAC (2026-07-08): admin only,operator 改 403
    if (!requireAnyScope(ctx, ['agent:admin'])) {
      jsonResponse(res, 403, { error: 'insufficient_scope', required: 'agent:admin (P9 RBAC)' });
      return true;
    }
    try {
      const tenantId = ctx.tenantId || '00000000-0000-0000-0000-000000000000';
      const rows = await db.select().from(agents)
        .where(eq(agents.tenantId, tenantId))
        .orderBy(desc(agents.createdAt));
      jsonResponse(res, 200, { agents: rows });
      return true;
    } catch (err) {
      jsonResponse(res, 500, { error: 'internal_error', message: String(err) });
      return true;
    }
  }

  if (method === 'POST' && u.pathname === '/api/v2/admin/agents') {
    if (!requireAnyScope(ctx, ['agent:admin'])) {
      jsonResponse(res, 403, { error: 'insufficient_scope', required: 'agent:admin' });
      return true;
    }
    try {
      const body = await parseJsonBody(req);
      // L9 #C: accept triggerStrategy at the top level and merge into orchestration jsonb.
      const orchestration = mergeStrategyIntoOrchestration(
        body.orchestration,
        normalizeTriggerStrategy(body.triggerStrategy),
      );
      const result = await db.insert(agents).values({
        tenantId: ctx.tenantId || '00000000-0000-0000-0000-000000000000',
        name: body.name,
        description: body.description || null,
        systemPrompt: body.systemPrompt || '',
        roleTemplate: body.roleTemplate || 'general',
        capabilities: body.capabilities || [],
        tools: body.tools || [],
        isActive: true,
        ...(orchestration ? { orchestration } : {}),
      } as any).returning();
      jsonResponse(res, 201, { agent: result[0] });
      return true;
    } catch (err) {
      jsonResponse(res, 500, { error: 'internal_error', message: String(err) });
      return true;
    }
  }

  const detailMatch = u.pathname.match(/^\/api\/v2\/admin\/agents\/([^/]+)$/);
  if (method === 'GET' && detailMatch) {
    if (!requireAnyScope(ctx, ['agent:read', 'agent:admin'])) {
      jsonResponse(res, 403, { error: 'insufficient_scope', required: 'agent:read OR agent:admin' });
      return true;
    }
    const id = detailMatch[1];
    try {
      const [row] = await db.select().from(agents).where(eq(agents.id, id)).limit(1);
      if (!row) { jsonResponse(res, 404, { error: 'not_found' }); return true; }
      jsonResponse(res, 200, { agent: row });
      return true;
    } catch (err) {
      jsonResponse(res, 500, { error: 'internal_error', message: String(err) });
      return true;
    }
  }

  if (method === 'PATCH' && detailMatch) {
    if (!requireAnyScope(ctx, ['agent:admin'])) {
      jsonResponse(res, 403, { error: 'insufficient_scope', required: 'agent:admin' });
      return true;
    }
    const id = detailMatch[1];
    try {
      const body = await parseJsonBody(req);
      const updates: any = { updatedAt: new Date() };
      if (body.name !== undefined) updates.name = body.name;
      if (body.description !== undefined) updates.description = body.description;
      if (body.systemPrompt !== undefined) updates.systemPrompt = body.systemPrompt;
      if (body.isActive !== undefined) updates.isActive = !!body.isActive;
      if (body.deploymentType !== undefined) updates.deploymentType = body.deploymentType;
      if (body.orchestration !== undefined) updates.orchestration = body.orchestration;
      // L9 #C: triggerStrategy field at top-level → merge into orchestration jsonb.
      const strategyPatch = normalizeTriggerStrategy(body.triggerStrategy);
      if (strategyPatch !== undefined) {
        const existing = (updates.orchestration && typeof updates.orchestration === 'object')
          ? (updates.orchestration as Record<string, unknown>)
          : (body.orchestration && typeof body.orchestration === 'object'
              ? (body.orchestration as Record<string, unknown>)
              : {});
        updates.orchestration = { ...existing, triggerStrategy: strategyPatch };
      }
      if (body.tools !== undefined) updates.tools = body.tools;
      if (body.boundary !== undefined) updates.boundary = body.boundary;
      if (body.ironLaws !== undefined) updates.ironLaws = body.ironLaws;
      const [row] = await db.update(agents).set(updates).where(eq(agents.id, id)).returning();
      if (!row) { jsonResponse(res, 404, { error: 'not_found' }); return true; }
      jsonResponse(res, 200, { agent: row });
      return true;
    } catch (err) {
      jsonResponse(res, 500, { error: 'internal_error', message: String(err) });
      return true;
    }
  }

  if (method === 'DELETE' && detailMatch) {
    if (!requireAnyScope(ctx, ['agent:admin'])) {
      jsonResponse(res, 403, { error: 'insufficient_scope', required: 'agent:admin' });
      return true;
    }
    const id = detailMatch[1];
    try {
      await db.delete(agents).where(eq(agents.id, id));
      jsonResponse(res, 200, { deleted: id });
      return true;
    } catch (err) {
      jsonResponse(res, 500, { error: 'internal_error', message: String(err) });
      return true;
    }
  }

  // R38-C4 阶段 3.3: POST /api/v2/admin/agents/:id/promote  实例 → 模板
  const promoteMatch = u.pathname.match(/^\/api\/v2\/admin\/agents\/([^/]+)\/promote$/);
  if (method === 'POST' && promoteMatch) {
    if (!requireAnyScope(ctx, ['agent:admin'])) {
      jsonResponse(res, 403, { error: 'insufficient_scope', required: 'agent:admin' });
      return true;
    }
    const id = promoteMatch[1];
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const cur = await client.query('SELECT id, is_template FROM agents WHERE id = $1 FOR UPDATE', [id]);
      if (cur.rows.length === 0) {
        await client.query('ROLLBACK');
        jsonResponse(res, 404, { error: 'agent_not_found' });
        return true;
      }
      if (cur.rows[0].is_template) {
        await client.query('ROLLBACK');
        jsonResponse(res, 400, { error: 'already_template' });
        return true;
      }
      // 先解绑所有 bot(否则 bot_configs.agent_id 引用消失)
      const boundBots = await client.query(
        'SELECT bot_id FROM bot_configs WHERE agent_id = $1',
        [id],
      );
      if (boundBots.rows.length > 0) {
        await client.query(
          'UPDATE bot_configs SET agent_id = NULL WHERE agent_id = $1',
          [id],
        );
      }
      // 提升为模板:清 channel_ids / model_id / working_dir
      const updated = await client.query(
        `UPDATE agents
           SET is_template = true,
               channel_ids = '[]'::jsonb,
               model_id = NULL,
               working_dir = NULL,
               updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [id],
      );
      await client.query('COMMIT');
      jsonResponse(res, 200, {
        agent: updated.rows[0],
        unbound_bots: boundBots.rows.map((r: any) => r.bot_id),
      });
      return true;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      jsonResponse(res, 500, { error: 'internal_error', message: String(err) });
      return true;
    } finally {
      client.release();
    }
  }

  // R38-C4 阶段 3.3: POST /api/v2/admin/agents/:id/demote  模板 → 实例
  const demoteMatch = u.pathname.match(/^\/api\/v2\/admin\/agents\/([^/]+)\/demote$/);
  if (method === 'POST' && demoteMatch) {
    if (!requireAnyScope(ctx, ['agent:admin'])) {
      jsonResponse(res, 403, { error: 'insufficient_scope', required: 'agent:admin' });
      return true;
    }
    const id = demoteMatch[1];
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const cur = await client.query('SELECT id, is_template, name FROM agents WHERE id = $1 FOR UPDATE', [id]);
      if (cur.rows.length === 0) {
        await client.query('ROLLBACK');
        jsonResponse(res, 404, { error: 'agent_not_found' });
        return true;
      }
      if (!cur.rows[0].is_template) {
        await client.query('ROLLBACK');
        jsonResponse(res, 400, { error: 'already_instance' });
        return true;
      }
      // 实例重名校验(若有同名实例 → 拒绝)
      const dup = await client.query(
        'SELECT id FROM agents WHERE name = $1 AND is_template = false AND id::text != $2',
        [cur.rows[0].name, id],
      );
      if (dup.rows.length > 0) {
        await client.query('ROLLBACK');
        jsonResponse(res, 400, { error: 'name_taken', message: `实例名称 "${cur.rows[0].name}" 已存在,请先处理同名实例或改名后重试` });
        return true;
      }
      const workingDir = generateWorkingDir(cur.rows[0].name);
      const updated = await client.query(
        `UPDATE agents
           SET is_template = false,
               working_dir = $2,
               updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [id, workingDir],
      );
      await client.query('COMMIT');
      jsonResponse(res, 200, { agent: updated.rows[0] });
      return true;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      jsonResponse(res, 500, { error: 'internal_error', message: String(err) });
      return true;
    } finally {
      client.release();
    }
  }

  // R38-C4 阶段 3.4: POST /api/v2/admin/agents/:srcId/copy-as-template
  const copyAsTplMatch = u.pathname.match(/^\/api\/v2\/admin\/agents\/([^/]+)\/copy-as-template$/);
  if (method === 'POST' && copyAsTplMatch) {
    if (!requireAnyScope(ctx, ['agent:admin'])) {
      jsonResponse(res, 403, { error: 'insufficient_scope', required: 'agent:admin' });
      return true;
    }
    const srcId = copyAsTplMatch[1];
    try {
      const body = await parseJsonBody(req).catch(() => ({} as any));
      const overridesName: string | undefined = typeof body?.name === 'string' ? body.name.trim() : undefined;

      const src = await pool.query('SELECT * FROM agents WHERE id = $1', [srcId]);
      if (src.rows.length === 0) {
        jsonResponse(res, 404, { error: 'agent_not_found' });
        return true;
      }
      const s = src.rows[0];

      // 深拷贝为新模板: 新 id + is_template=true + 清 channel_ids/model_id/working_dir
      // 模板允许重名,故不校验重名;显式 INSERT 列,避开 jsonb 列歧义
      const cap = typeof s.capabilities === 'string' ? s.capabilities : JSON.stringify(s.capabilities ?? []);
      const tls = typeof s.tools === 'string' ? s.tools : JSON.stringify(s.tools ?? []);
      const kf = typeof s.knowledge_folders === 'string' ? s.knowledge_folders : JSON.stringify(s.knowledge_folders ?? []);
      const sk = typeof s.skills === 'string' ? s.skills : JSON.stringify(s.skills ?? []);
      const orch = typeof s.orchestration === 'string' ? s.orchestration : JSON.stringify(s.orchestration ?? {});
      const bnd = typeof s.boundary === 'string' ? s.boundary : JSON.stringify(s.boundary ?? {});
      const il = typeof s.iron_laws === 'string' ? s.iron_laws : JSON.stringify(s.iron_laws ?? []);
      const inserted = await pool.query(
        `INSERT INTO agents (
            tenant_id, name, role_template, description, system_prompt,
            capabilities, tools, category, template_type, source_template_id,
            knowledge_folders, skills, orchestration, boundary, iron_laws,
            default_engine, default_model, default_context_window, default_max_turns,
            complexity_level, persona, engine, deployment_type,
            is_template, working_dir, channel_ids, visibility, temperature, owner_user_id
          ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, 'custom', $9,
            $10, $11, $12, $13, $14,
            $15, $16, $17, $18,
            $19, $20, $21, $22,
            true, NULL, '[]'::jsonb, 'team', $23, $24
          ) RETURNING *`,
        [
          s.tenant_id,
          overridesName || s.name,
          s.role_template,
          s.description,
          s.system_prompt,
          cap, tls, s.category ?? 'general', s.source_template_id ?? null,
          kf, sk, orch, bnd, il,
          s.default_engine ?? null, s.default_model ?? null,
          s.default_context_window ?? 200000, s.default_max_turns ?? null,
          s.complexity_level ?? 'L1', s.persona ?? null,
          s.engine ?? null, s.deployment_type ?? 'bot',
          s.temperature ?? 0.7, s.owner_user_id ?? null,
        ],
      );
      const newTpl = inserted.rows[0];

      // 同步克隆 refs 关联(skill/kb/mcp)
      await pool.query(
        `INSERT INTO agent_skill_refs (agent_id, skill_id, skill_version, params)
          SELECT $1, skill_id, skill_version, params FROM agent_skill_refs WHERE agent_id = $2`,
        [newTpl.id, srcId],
      );
      await pool.query(
        `INSERT INTO agent_knowledge_refs (agent_id, kb_id, top_k, min_score)
          SELECT $1, kb_id, top_k, min_score FROM agent_knowledge_refs WHERE agent_id = $2`,
        [newTpl.id, srcId],
      );
      await pool.query(
        `INSERT INTO agent_mcp_refs (agent_id, mcp_server_id, params)
          SELECT $1, mcp_server_id, params FROM agent_mcp_refs WHERE agent_id = $2`,
        [newTpl.id, srcId],
      );

      jsonResponse(res, 201, { agent: newTpl, source_id: srcId });
      return true;
    } catch (err) {
      jsonResponse(res, 500, { error: 'internal_error', message: String(err) });
      return true;
    }
  }

  // R38-C4 阶段 3.7: GET /api/v2/admin/agents/:id/mcp-refs
  const mcpRefsListMatch = u.pathname.match(/^\/api\/v2\/admin\/agents\/([^/]+)\/mcp-refs$/);
  if (method === 'GET' && mcpRefsListMatch) {
    if (!requireAnyScope(ctx, ['agent:read', 'agent:admin'])) {
      jsonResponse(res, 403, { error: 'insufficient_scope', required: 'agent:read OR agent:admin' });
      return true;
    }
    const agentId = mcpRefsListMatch[1];
    try {
      const rows = await pool.query(
        `SELECT amr.id AS ref_id, amr.agent_id, amr.mcp_server_id, amr.params, amr.created_at,
                 m.name, m.url, m.transport, m.health_status, m.status
            FROM agent_mcp_refs amr
            JOIN mcp_servers m ON m.id = amr.mcp_server_id
           WHERE amr.agent_id = $1 AND m.status = 'active'
           ORDER BY amr.created_at DESC`,
        [agentId],
      );
      jsonResponse(res, 200, { mcp_refs: rows.rows });
      return true;
    } catch (err) {
      jsonResponse(res, 500, { error: 'internal_error', message: String(err) });
      return true;
    }
  }

  // R38-C4 阶段 3.7: POST /api/v2/admin/agents/:id/mcp-refs
  if (method === 'POST' && mcpRefsListMatch) {
    if (!requireAnyScope(ctx, ['agent:admin'])) {
      jsonResponse(res, 403, { error: 'insufficient_scope', required: 'agent:admin' });
      return true;
    }
    const agentId = mcpRefsListMatch[1];
    try {
      const body = await parseJsonBody(req);
      const mcpServerId = typeof body?.mcpServerId === 'string' ? body.mcpServerId : null;
      if (!mcpServerId) {
        jsonResponse(res, 400, { error: 'bad_request', message: 'mcpServerId 必填' });
        return true;
      }
      const params = body?.params && typeof body.params === 'object' ? body.params : {};
      const inserted = await pool.query(
        `INSERT INTO agent_mcp_refs (agent_id, mcp_server_id, params)
         VALUES ($1, $2, $3::jsonb)
         ON CONFLICT (agent_id, mcp_server_id) DO UPDATE
           SET params = EXCLUDED.params
         RETURNING *`,
        [agentId, mcpServerId, JSON.stringify(params)],
      );
      jsonResponse(res, 201, { ref: inserted.rows[0] });
      return true;
    } catch (err) {
      const msg = String(err);
      if (msg.includes('foreign key') || msg.includes('violates')) {
        jsonResponse(res, 400, { error: 'invalid_ref', message: msg });
        return true;
      }
      jsonResponse(res, 500, { error: 'internal_error', message: msg });
      return true;
    }
  }

  // R38-C4 阶段 3.7: DELETE /api/v2/admin/agents/:id/mcp-refs/:refId
  const mcpRefDelMatch = u.pathname.match(/^\/api\/v2\/admin\/agents\/([^/]+)\/mcp-refs\/([^/]+)$/);
  if (method === 'DELETE' && mcpRefDelMatch) {
    if (!requireAnyScope(ctx, ['agent:admin'])) {
      jsonResponse(res, 403, { error: 'insufficient_scope', required: 'agent:admin' });
      return true;
    }
    const agentId = mcpRefDelMatch[1];
    const refId = mcpRefDelMatch[2];
    try {
      const result = await pool.query(
        'DELETE FROM agent_mcp_refs WHERE id = $1 AND agent_id = $2',
        [refId, agentId],
      );
      if ((result.rowCount ?? 0) === 0) {
        jsonResponse(res, 404, { error: 'ref_not_found' });
        return true;
      }
      jsonResponse(res, 200, { deleted: refId });
      return true;
    } catch (err) {
      jsonResponse(res, 500, { error: 'internal_error', message: String(err) });
      return true;
    }
  }

  // ====== R41-C: POST /api/v2/admin/agents/:id/assign  数字员工分配给真人 ======
  // Body: { userId: string, role?: 'owner'|'user'|'approver' }
  // Effect: INSERT into user_agent_bindings + UPDATE agents.owner_user_id.
  // Idempotent on (user_id, agent_id) pair — re-assigning just refreshes role.
  const assignMatch = u.pathname.match(/^\/api\/v2\/admin\/agents\/([^/]+)\/assign$/);
  if (method === 'POST' && assignMatch) {
    if (!requireAnyScope(ctx, ['agent:admin', 'people:admin', '*'])) {
      jsonResponse(res, 403, { error: 'insufficient_scope', required: 'agent:admin OR people:admin' });
      return true;
    }
    const agentId = assignMatch[1];
    try {
      const body = await parseJsonBody(req);
      const userId = typeof body?.userId === 'string' ? body.userId.trim() : '';
      if (!userId) {
        jsonResponse(res, 400, { error: 'bad_request', message: 'userId 必填' });
        return true;
      }
      const roleRaw = typeof body?.role === 'string' ? body.role : '';
      const role = (['owner', 'user', 'approver'] as string[]).includes(roleRaw) ? roleRaw : 'user';

      // Validate agent + user exist
      const agentChk = await pool.query('SELECT id, owner_user_id FROM agents WHERE id = $1', [agentId]);
      if (agentChk.rows.length === 0) {
        jsonResponse(res, 404, { error: 'agent_not_found' });
        return true;
      }
      const userChk = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
      if (userChk.rows.length === 0) {
        jsonResponse(res, 404, { error: 'user_not_found' });
        return true;
      }

      const tenantId = ctx.tenantId || agentChk.rows[0].owner_user_id || '00000000-0000-0000-0000-000000000000';
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // Upsert binding (idempotent on (tenant_id, user_id, agent_id, role))
        await client.query(
          `INSERT INTO user_agent_bindings (tenant_id, user_id, agent_id, role)
             VALUES ($1, $2, $3, $4)
           ON CONFLICT (tenant_id, user_id, agent_id, role) DO UPDATE
             SET updated_at = now()`,
          [tenantId, userId, agentId, role],
        );
        // Sync denormalized cache on agents
        await client.query(
          `UPDATE agents SET owner_user_id = $1, updated_at = now() WHERE id = $2`,
          [userId, agentId],
        );
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
      jsonResponse(res, 200, { ok: true, agentId, userId, role });
      return true;
    } catch (err) {
      jsonResponse(res, 500, { error: 'internal_error', message: String(err) });
      return true;
    }
  }

  // ====== R41-C: DELETE /api/v2/admin/agents/:id/assign  解除绑定 ======
  // Body: { userId: string } (optional — if absent, clears any binding for this agent)
  // Effect: DELETE from user_agent_bindings, clear agents.owner_user_id if it matched.
  if (method === 'DELETE' && assignMatch) {
    if (!requireAnyScope(ctx, ['agent:admin', 'people:admin', '*'])) {
      jsonResponse(res, 403, { error: 'insufficient_scope', required: 'agent:admin OR people:admin' });
      return true;
    }
    const agentId = assignMatch[1];
    try {
      const body = await parseJsonBody(req).catch(() => ({} as any));
      const userId = typeof body?.userId === 'string' ? body.userId.trim() : '';

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        let removed = 0;
        if (userId) {
          const r = await client.query(
            `DELETE FROM user_agent_bindings WHERE agent_id = $1 AND user_id = $2`,
            [agentId, userId],
          );
          removed = r.rowCount ?? 0;
          // If owner_user_id was this user, clear it
          await client.query(
            `UPDATE agents SET owner_user_id = NULL, updated_at = now()
              WHERE id = $1 AND owner_user_id = $2`,
            [agentId, userId],
          );
        } else {
          const r = await client.query(
            `DELETE FROM user_agent_bindings WHERE agent_id = $1`,
            [agentId],
          );
          removed = r.rowCount ?? 0;
          await client.query(
            `UPDATE agents SET owner_user_id = NULL, updated_at = now() WHERE id = $1`,
            [agentId],
          );
        }
        await client.query('COMMIT');
        jsonResponse(res, 200, { ok: true, agentId, userId: userId || null, removed });
        return true;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      jsonResponse(res, 500, { error: 'internal_error', message: String(err) });
      return true;
    }
  }

  jsonResponse(res, 404, { error: 'not_found' });
  return true;
}
