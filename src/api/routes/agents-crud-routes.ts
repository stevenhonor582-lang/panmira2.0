import type * as http from 'node:http';
import { eq, desc } from 'drizzle-orm';
import { db, pool } from '../../db/index.js';
import { agentInstances, agentTemplates } from '../../db/schema.js';
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
  if (!u.pathname.startsWith('/api/v2/admin/agents') && !u.pathname.startsWith('/api/v2/admin/agent-templates') && !u.pathname.startsWith('/api/v2/admin/agent-instances')) return false;

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
      const rows = await db.select().from(agentInstances)
        .where(eq(agentInstances.tenantId, tenantId))
        .orderBy(desc(agentInstances.createdAt));
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
      const result = await db.insert(agentInstances).values({
        tenantId: ctx.tenantId || '00000000-0000-0000-0000-000000000000',
        name: body.name as string,
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
      const [row] = await db.select().from(agentInstances).where(eq(agentInstances.id, id)).limit(1);
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
      const [row] = await db.update(agentInstances).set(updates).where(eq(agentInstances.id, id)).returning();
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
      await db.delete(agentInstances).where(eq(agentInstances.id, id));
      jsonResponse(res, 200, { deleted: id });
      return true;
    } catch (err) {
      jsonResponse(res, 500, { error: 'internal_error', message: String(err) });
      return true;
    }
  }

  // R42-ROUTES 阶段 3.3: POST /api/v2/admin/agent-templates/:id/instantiate
  // 用 templateId 从 agent_templates 蓝图复制一个新 instance(替代 promote/demote/copy-as-template 三路由)
  const instantiateMatch = u.pathname.match(/^\/api\/v2\/admin\/agent-templates\/([^/]+)\/instantiate$/);
  if (method === 'POST' && instantiateMatch) {
    if (!requireAnyScope(ctx, ['agent:admin'])) {
      jsonResponse(res, 403, { error: 'insufficient_scope', required: 'agent:admin' });
      return true;
    }
    const templateId = instantiateMatch[1];
    try {
      const body = await parseJsonBody(req).catch(() => ({} as any));
      const name: string | undefined = typeof body?.name === 'string' ? body.name.trim() : undefined;
      const ownerUserId: string | null = typeof body?.ownerUserId === 'string' && body.ownerUserId.length > 0
        ? body.ownerUserId
        : null;
      if (!name || name.length === 0) {
        jsonResponse(res, 400, { error: 'bad_request', message: 'name 必填' });
        return true;
      }
      const { AgentStore } = await import('../../db/agent-store.js');
      const agentStore = new AgentStore();
      let created;
      try {
        created = await agentStore.createInstanceFromTemplate(templateId, { name, ownerUserId });
      } catch (e: any) {
        const msg = String(e?.message || e);
        if (msg.includes('已存在')) {
          jsonResponse(res, 409, { error: 'name_taken', message: msg });
          return true;
        }
        jsonResponse(res, 500, { error: 'internal_error', message: msg });
        return true;
      }
      if (!created) {
        jsonResponse(res, 404, { error: 'template_not_found', message: `Template ${templateId} 不存在` });
        return true;
      }
      jsonResponse(res, 201, { agent: created, source_template_id: templateId });
      return true;
    } catch (err) {
      jsonResponse(res, 500, { error: 'internal_error', message: String(err) });
      return true;
    }
  }

  // R42-ROUTES 阶段 3.4: POST /api/v2/admin/agent-templates — 创建模板
  if (method === 'POST' && u.pathname === '/api/v2/admin/agent-templates') {
    if (!requireAnyScope(ctx, ['agent:admin'])) {
      jsonResponse(res, 403, { error: 'insufficient_scope', required: 'agent:admin' });
      return true;
    }
    try {
      const body = await parseJsonBody(req);
      const orchestration = mergeStrategyIntoOrchestration(
        body.orchestration,
        normalizeTriggerStrategy(body.triggerStrategy),
      );
      const { AgentStore } = await import('../../db/agent-store.js');
      const agentStore = new AgentStore();
      const created = await agentStore.createTemplate({
        name: body.name as string,
        roleTemplate: body.roleTemplate as string | undefined,
        description: body.description as string | undefined,
        systemPrompt: body.systemPrompt as string | undefined,
        capabilities: (body.capabilities as any[]) || [],
        tools: (body.tools as any[]) || [],
        category: (body.category as string) || 'general',
        templateType: (body.templateType as 'standard' | 'custom') || 'custom',
        ironLaws: (body.ironLaws as string[]) || [],
        boundary: body.boundary || {},
        orchestration: orchestration ?? {},
        persona: body.persona as string | undefined,
        createdBy: ctx.userId || undefined,
      });
      jsonResponse(res, 201, { agent: created });
      return true;
    } catch (err) {
      jsonResponse(res, 500, { error: 'internal_error', message: String(err) });
      return true;
    }
  }

  // R42-ROUTES 阶段 3.5: GET /api/v2/admin/agent-templates — 列模板
  if (method === 'GET' && u.pathname === '/api/v2/admin/agent-templates') {
    if (!requireAnyScope(ctx, ['agent:read', 'agent:admin'])) {
      jsonResponse(res, 403, { error: 'insufficient_scope', required: 'agent:read OR agent:admin' });
      return true;
    }
    try {
      const tenantId = ctx.tenantId || '00000000-0000-0000-0000-000000000000';
      const rows = await db.select().from(agentTemplates)
        .where(eq(agentTemplates.tenantId, tenantId))
        .orderBy(desc(agentTemplates.createdAt));
      jsonResponse(res, 200, { templates: rows });
      return true;
    } catch (err) {
      jsonResponse(res, 500, { error: 'internal_error', message: String(err) });
      return true;
    }
  }

  // R42-ROUTES 阶段 3.6: GET /api/v2/admin/agent-instances — 列 instance
  if (method === 'GET' && u.pathname === '/api/v2/admin/agent-instances') {
    if (!requireAnyScope(ctx, ['agent:read', 'agent:admin'])) {
      jsonResponse(res, 403, { error: 'insufficient_scope', required: 'agent:read OR agent:admin' });
      return true;
    }
    try {
      const tenantId = ctx.tenantId || '00000000-0000-0000-0000-000000000000';
      const rows = await db.select().from(agentInstances)
        .where(eq(agentInstances.tenantId, tenantId))
        .orderBy(desc(agentInstances.createdAt));
      jsonResponse(res, 200, { instances: rows });
      return true;
    } catch (err) {
      jsonResponse(res, 500, { error: 'internal_error', message: String(err) });
      return true;
    }
  }

  // R42-X: DELETE /api/v2/admin/agent-instances/:id — 删 instance
  // 解绑 user_agent_bindings + 清关联 + 删行
  const instanceDelMatch = u.pathname.match(/^\/api\/v2\/admin\/agent-instances\/([^/]+)$/);
  if (method === 'DELETE' && instanceDelMatch) {
    if (!requireAnyScope(ctx, ['agent:admin'])) {
      jsonResponse(res, 403, { error: 'insufficient_scope', required: 'agent:admin' });
      return true;
    }
    const id = instanceDelMatch[1];
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const bindings = await client.query('DELETE FROM user_agent_bindings WHERE agent_id = $1', [id]);
      const mcp = await client.query('DELETE FROM agent_mcp_refs WHERE agent_id = $1', [id]);
      const kb = await client.query('DELETE FROM agent_knowledge_refs WHERE agent_id = $1', [id]);
      const logs = await client.query('DELETE FROM agent_run_logs WHERE agent_template_id = $1', [id]);
      const skills = await client.query('DELETE FROM agent_skill_refs WHERE agent_id = $1', [id]);
      const team = await client.query('DELETE FROM agent_team_auth WHERE agent_id = $1', [id]);
      const msgs = await client.query('DELETE FROM agent_messages WHERE from_agent_id = $1 OR to_agent_id = $1', [id]);
      const result = await client.query('DELETE FROM agent_instances WHERE id = $1', [id]);
      await client.query('COMMIT');
      if ((result.rowCount ?? 0) === 0) {
        jsonResponse(res, 404, { error: 'instance_not_found' });
        return true;
      }
      jsonResponse(res, 200, { deleted: id, bindings_removed: bindings.rowCount ?? 0, mcp_removed: mcp.rowCount ?? 0, kb_removed: kb.rowCount ?? 0, logs_removed: logs.rowCount ?? 0, skills_removed: skills.rowCount ?? 0, team_removed: team.rowCount ?? 0, msgs_removed: msgs.rowCount ?? 0 });
      return true;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      jsonResponse(res, 500, { error: 'internal_error', message: String(err) });
      return true;
    } finally {
      client.release();
    }
  }

  // R42-X: DELETE /api/v2/admin/agent-templates/:id — 删 template
  const templateDelMatch = u.pathname.match(/^\/api\/v2\/admin\/agent-templates\/([^/]+)$/);
  if (method === 'DELETE' && templateDelMatch) {
    if (!requireAnyScope(ctx, ['agent:admin'])) {
      jsonResponse(res, 403, { error: 'insufficient_scope', required: 'agent:admin' });
      return true;
    }
    const id = templateDelMatch[1];
    try {
      const [row] = await db.delete(agentTemplates).where(eq(agentTemplates.id, id)).returning({ id: agentTemplates.id });
      if (!row) {
        jsonResponse(res, 404, { error: 'template_not_found' });
        return true;
      }
      jsonResponse(res, 200, { deleted: row.id });
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
  // Effect: INSERT into user_agent_bindings + UPDATE agentInstances.owner_user_id.
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
      const agentChk = await pool.query('SELECT id, owner_user_id FROM agent_instances WHERE id = $1', [agentId]);
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
          `UPDATE agent_instances SET owner_user_id = $1, updated_at = now() WHERE id = $2`,
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
  // Effect: DELETE from user_agent_bindings, clear agentInstances.owner_user_id if it matched.
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
            `UPDATE agent_instances SET owner_user_id = NULL, updated_at = now()
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
            `UPDATE agent_instances SET owner_user_id = NULL, updated_at = now() WHERE id = $1`,
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
