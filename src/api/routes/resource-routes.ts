/**
 * Plan B-1 资源引擎端点:
 *   /api/v2/admin/embedding-providers  (CRUD,需 model:admin scope)
 *   /api/v2/admin/mcp-servers          (CRUD + health check,需 mcp:admin scope)
 *   /api/v2/admin/agents/:id/skill-refs (CRUD,需 agent:edit scope)
 *   /api/v2/admin/mcp-servers/:id/credentials     (CRUD + 轮询,需 mcp:admin scope)
 *
 * 模式:跟 oauth-routes 一样,纯函数 handleXxxRoutes,挂 http-server
 */
import type http from 'node:http';
import { eq, and, desc, asc } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { embeddingProviders, mcpServers, agentSkillRefs, skills, agentInstances, mcpCredentials } from '../../db/schema.js';
import { jsonResponse, parseJsonBody } from './helpers.js';
import { requireBearer, requireScopes } from '../oauth-middleware.js';
import { checkMcpHealth } from '../../services/mcp-health.js';

async function listEmbeddingProviders(req: http.IncomingMessage, res: http.ServerResponse) {
  const ctx = await requireBearer(req, res);
  if (!ctx) return;
  const check = requireScopes(ctx, ['model:read', 'model:admin']);
  if (!check.ok) { jsonResponse(res, 403, { error: 'insufficient_scope', missing: check.missing }); return; }
  const rows = await db.select().from(embeddingProviders).orderBy(desc(embeddingProviders.createdAt));
  jsonResponse(res, 200, { success: true, data: rows });
}

async function createEmbeddingProvider(req: http.IncomingMessage, res: http.ServerResponse) {
  const ctx = await requireBearer(req, res);
  if (!ctx) return;
  const check = requireScopes(ctx, ['model:admin']);
  if (!check.ok) { jsonResponse(res, 403, { error: 'insufficient_scope', missing: check.missing }); return; }
  const body = (await parseJsonBody(req)) as Record<string, unknown>;
  const { id, name, baseUrl, apiKey, modelName, dimensions, pricingPer1k, isDefault } = body;
  if (!id || !name || !modelName) { jsonResponse(res, 400, { error: 'id + name + modelName required' }); return; }
  await db.insert(embeddingProviders).values({
    id: String(id), name: String(name), baseUrl: String(baseUrl || ''),
    apiKeyEncrypted: apiKey ? String(apiKey) : null,
    modelName: String(modelName), dimensions: Number(dimensions) || 1024,
    pricingPer1k: String(pricingPer1k || '0'), isDefault: Boolean(isDefault),
  });
  jsonResponse(res, 201, { success: true, data: { id } });
}

async function listMcpServers(req: http.IncomingMessage, res: http.ServerResponse) {
  const ctx = await requireBearer(req, res);
  if (!ctx) return;
  const check = requireScopes(ctx, ['mcp:read', 'mcp:admin']);
  if (!check.ok) { jsonResponse(res, 403, { error: 'insufficient_scope', missing: check.missing }); return; }
  const rows = await db.select().from(mcpServers)
    .where(eq(mcpServers.tenantId, ctx.tenantId))
    .orderBy(desc(mcpServers.createdAt));
  jsonResponse(res, 200, { success: true, data: rows });
}

async function createMcpServer(req: http.IncomingMessage, res: http.ServerResponse) {
  const ctx = await requireBearer(req, res);
  if (!ctx) return;
  const check = requireScopes(ctx, ['mcp:admin']);
  if (!check.ok) { jsonResponse(res, 403, { error: 'insufficient_scope', missing: check.missing }); return; }
  const body = (await parseJsonBody(req)) as Record<string, unknown>;
  const { name, url, transport, authType, apiKey, teamId } = body;
  if (!name || !url) { jsonResponse(res, 400, { error: 'name + url required' }); return; }
  const [row] = await db.insert(mcpServers).values({
    tenantId: ctx.tenantId, teamId: teamId ? String(teamId) : null,
    name: String(name), url: String(url), transport: String(transport || 'http'),
    authType: String(authType || 'none'),
    apiKeyEncrypted: apiKey ? String(apiKey) : null,
  }).returning();
  jsonResponse(res, 201, { success: true, data: row });
}

async function triggerMcpHealth(req: http.IncomingMessage, res: http.ServerResponse, mcpId: string) {
  const ctx = await requireBearer(req, res);
  if (!ctx) return;
  const check = requireScopes(ctx, ['mcp:admin']);
  if (!check.ok) { jsonResponse(res, 403, { error: 'insufficient_scope', missing: check.missing }); return; }
  const [server] = await db.select().from(mcpServers).where(eq(mcpServers.id, mcpId)).limit(1);
  if (!server) { jsonResponse(res, 404, { error: 'MCP server not found' }); return; }
  const result = await checkMcpHealth(server);
  await db.update(mcpServers).set({
    healthStatus: result.status, lastCheckAt: new Date(),
    toolsCache: result.tools || server.toolsCache,
  }).where(eq(mcpServers.id, mcpId));
  jsonResponse(res, 200, { success: true, data: result });
}


// ============================================================================
// R68-3 · 块 8: MCP 多密钥 + 轮询
// ============================================================================

async function listMcpCredentials(req: http.IncomingMessage, res: http.ServerResponse, mcpId: string) {
  const ctx = await requireBearer(req, res);
  if (!ctx) return;
  const check = requireScopes(ctx, ['mcp:read', 'mcp:admin']);
  if (!check.ok) { jsonResponse(res, 403, { error: 'insufficient_scope', missing: check.missing }); return; }
  const rows = await db.select({
    id: mcpCredentials.id,
    mcpServerId: mcpCredentials.mcpServerId,
    label: mcpCredentials.label,
    failureCount: mcpCredentials.failureCount,
    lastUsedAt: mcpCredentials.lastUsedAt,
    disabled: mcpCredentials.disabled,
    createdAt: mcpCredentials.createdAt,
  }).from(mcpCredentials).where(eq(mcpCredentials.mcpServerId, mcpId));
  // 永远不返回 encrypted_key 明文到前端,只回 length 提示
  jsonResponse(res, 200, {
    success: true,
    data: rows.map((r: any) => ({
      ...r,
      keyHint: `***${String(Math.random()).slice(-4)}`, // 占位,前端仅显示存在/长度
      hasKey: true,
    })),
  });
}

async function createMcpCredential(req: http.IncomingMessage, res: http.ServerResponse, mcpId: string) {
  const ctx = await requireBearer(req, res);
  if (!ctx) return;
  const check = requireScopes(ctx, ['mcp:admin']);
  if (!check.ok) { jsonResponse(res, 403, { error: 'insufficient_scope', missing: check.missing }); return; }
  const body = (await parseJsonBody(req)) as Record<string, unknown>;
  const key = body.encryptedKey || body.key;
  if (!key) { jsonResponse(res, 400, { error: 'encryptedKey required' }); return; }
  const [row] = await db.insert(mcpCredentials).values({
    mcpServerId: mcpId,
    label: body.label ? String(body.label) : null,
    encryptedKey: String(key),
    failureCount: 0,
    disabled: false,
  }).returning();
  jsonResponse(res, 201, { success: true, data: { id: row.id } });
}

async function updateMcpCredential(req: http.IncomingMessage, res: http.ServerResponse, mcpId: string, credId: string) {
  const ctx = await requireBearer(req, res);
  if (!ctx) return;
  const check = requireScopes(ctx, ['mcp:admin']);
  if (!check.ok) { jsonResponse(res, 403, { error: 'insufficient_scope', missing: check.missing }); return; }
  const body = (await parseJsonBody(req)) as Record<string, unknown>;
  const sets: Record<string, unknown> = {};
  if (body.label !== undefined) sets.label = String(body.label);
  if (body.encryptedKey !== undefined || body.key !== undefined) sets.encryptedKey = String(body.encryptedKey ?? body.key);
  if (body.disabled !== undefined) sets.disabled = !!body.disabled;
  if (body.failureCount !== undefined) sets.failureCount = Number(body.failureCount);
  if (Object.keys(sets).length === 0) { jsonResponse(res, 400, { error: 'no fields to update' }); return; }
  const [row] = await db.update(mcpCredentials)
    .set(sets as any)
    .where(and(eq(mcpCredentials.id, credId), eq(mcpCredentials.mcpServerId, mcpId)))
    .returning();
  if (!row) { jsonResponse(res, 404, { error: 'credential not found' }); return; }
  jsonResponse(res, 200, { success: true });
}

async function deleteMcpCredential(req: http.IncomingMessage, res: http.ServerResponse, mcpId: string, credId: string) {
  const ctx = await requireBearer(req, res);
  if (!ctx) return;
  const check = requireScopes(ctx, ['mcp:admin']);
  if (!check.ok) { jsonResponse(res, 403, { error: 'insufficient_scope', missing: check.missing }); return; }
  await db.delete(mcpCredentials)
    .where(and(eq(mcpCredentials.id, credId), eq(mcpCredentials.mcpServerId, mcpId)));
  jsonResponse(res, 200, { success: true, deleted: true });
}

/**
 * R68-3 · 块 8 轮询:选下一个最久未用 + 未禁用 + 失败最少 的 key
 * 调用方使用 → mark this credential as used
 *   POST /api/v2/admin/mcp-servers/:id/credentials/:cid/used    { ok: boolean }
 */
async function markMcpCredentialUsed(req: http.IncomingMessage, res: http.ServerResponse, mcpId: string, credId: string) {
  const ctx = await requireBearer(req, res);
  if (!ctx) return;
  const body = (await parseJsonBody(req)) as Record<string, unknown>;
  const ok = body.ok !== false;
  const [cur] = await db.select({ failureCount: mcpCredentials.failureCount })
    .from(mcpCredentials).where(eq(mcpCredentials.id, credId)).limit(1);
  if (!cur) { jsonResponse(res, 404, { error: 'credential not found' }); return; }
  await db.update(mcpCredentials).set({
    lastUsedAt: new Date(),
    failureCount: ok ? 0 : cur.failureCount + 1,
    disabled: !ok && cur.failureCount + 1 >= 5 ? true : undefined,
  }).where(eq(mcpCredentials.id, credId));
  jsonResponse(res, 200, { success: true });
}

/**
 * 选下一个候选 key(内部用,不需要 mcp admin 权限由调用方控制)
 * 优先级:disabled=false → failureCount ASC → last_used_at ASC(越久越优先)
 */
async function pickNextMcpCredential(req: http.IncomingMessage, res: http.ServerResponse, mcpId: string) {
  const ctx = await requireBearer(req, res);
  if (!ctx) return;
  const check = requireScopes(ctx, ['mcp:read', 'mcp:admin']);
  if (!check.ok) { jsonResponse(res, 403, { error: 'insufficient_scope', missing: check.missing }); return; }
  const [row] = await db.select({
    id: mcpCredentials.id,
    encryptedKey: mcpCredentials.encryptedKey,
    label: mcpCredentials.label,
    failureCount: mcpCredentials.failureCount,
  }).from(mcpCredentials)
    .where(and(eq(mcpCredentials.mcpServerId, mcpId), eq(mcpCredentials.disabled, false)))
    .orderBy(asc(mcpCredentials.failureCount), asc(mcpCredentials.lastUsedAt))
    .limit(1);
  if (!row) { jsonResponse(res, 404, { error: 'no active credential' }); return; }
  await db.update(mcpCredentials).set({ lastUsedAt: new Date() }).where(eq(mcpCredentials.id, row.id));
  jsonResponse(res, 200, { success: true, data: row });
}

async function listAgentSkillRefs(req: http.IncomingMessage, res: http.ServerResponse, agentId: string) {
  const ctx = await requireBearer(req, res);
  if (!ctx) return;
  const check = requireScopes(ctx, ['agent:read', 'agent:edit', 'agent:admin']);
  if (!check.ok) { jsonResponse(res, 403, { error: 'insufficient_scope', missing: check.missing }); return; }
  const rows = await db.select().from(agentSkillRefs).where(eq(agentSkillRefs.agentId, agentId));
  jsonResponse(res, 200, { success: true, data: rows });
}

async function createAgentSkillRef(req: http.IncomingMessage, res: http.ServerResponse, agentId: string) {
  const ctx = await requireBearer(req, res);
  if (!ctx) return;
  const check = requireScopes(ctx, ['agent:edit', 'agent:admin']);
  if (!check.ok) { jsonResponse(res, 403, { error: 'insufficient_scope', missing: check.missing }); return; }
  const body = (await parseJsonBody(req)) as Record<string, unknown>;
  const { skillId, skillVersion, params } = body;
  if (!skillId) { jsonResponse(res, 400, { error: 'skillId required' }); return; }
  // verify skill exists
  const [skill] = await db.select().from(skills).where(eq(skills.id, String(skillId))).limit(1);
  if (!skill) { jsonResponse(res, 404, { error: 'skill not found' }); return; }
  // verify agent exists
  const [agent] = await db.select().from(agentInstances).where(eq(agentInstances.id, agentId)).limit(1);
  if (!agent) { jsonResponse(res, 404, { error: 'agent not found' }); return; }
  const [row] = await db.insert(agentSkillRefs).values({
    agentId, skillId: String(skillId),
    skillVersion: skillVersion ? String(skillVersion) : null,
    params: (params as Record<string, unknown>) || {},
  }).returning();
  jsonResponse(res, 201, { success: true, data: row });
}

export async function handleResourceRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  method: string,
  url: string,
): Promise<boolean> {
  // /api/v2/admin/embedding-providers
  if (url === '/api/v2/admin/embedding-providers' && method === 'GET') {
    await listEmbeddingProviders(req, res); return true;
  }
  if (url === '/api/v2/admin/embedding-providers' && method === 'POST') {
    await createEmbeddingProvider(req, res); return true;
  }
  // /api/v2/admin/mcp-servers
  if (url === '/api/v2/admin/mcp-servers' && method === 'GET') {
    await listMcpServers(req, res); return true;
  }
  if (url === '/api/v2/admin/mcp-servers' && method === 'POST') {
    await createMcpServer(req, res); return true;
  }
  // /api/v2/admin/mcp-servers/:id/health
  const mcpHealthMatch = url.match(/^\/api\/v2\/admin\/mcp-servers\/([0-9a-f-]+)\/health$/);
  if (mcpHealthMatch && method === 'POST') {
    await triggerMcpHealth(req, res, mcpHealthMatch[1]!); return true;
  }
  // R68-3 · /api/v2/admin/mcp-servers/:id/credentials (list/create)
  const mcpCredListMatch = url.match(/^\/api\/v2\/admin\/mcp-servers\/([0-9a-f-]+)\/credentials\/?$/);
  if (mcpCredListMatch && method === 'GET') { await listMcpCredentials(req, res, mcpCredListMatch[1]!); return true; }
  if (mcpCredListMatch && method === 'POST') { await createMcpCredential(req, res, mcpCredListMatch[1]!); return true; }
  // R68-3 · /api/v2/admin/mcp-servers/:id/credentials/pick (polling)
  const mcpCredPickMatch = url.match(/^\/api\/v2\/admin\/mcp-servers\/([0-9a-f-]+)\/credentials\/pick$/);
  if (mcpCredPickMatch && method === 'POST') { await pickNextMcpCredential(req, res, mcpCredPickMatch[1]!); return true; }
  // R68-3 · /api/v2/admin/mcp-servers/:id/credentials/:cid (patch/delete)
  const mcpCredOneMatch = url.match(/^\/api\/v2\/admin\/mcp-servers\/([0-9a-f-]+)\/credentials\/([0-9a-f-]+)\/?$/);
  if (mcpCredOneMatch && method === 'PATCH') { await updateMcpCredential(req, res, mcpCredOneMatch[1]!, mcpCredOneMatch[2]!); return true; }
  if (mcpCredOneMatch && method === 'DELETE') { await deleteMcpCredential(req, res, mcpCredOneMatch[1]!, mcpCredOneMatch[2]!); return true; }
  // R68-3 · /api/v2/admin/mcp-servers/:id/credentials/:cid/used
  const mcpCredUsedMatch = url.match(/^\/api\/v2\/admin\/mcp-servers\/([0-9a-f-]+)\/credentials\/([0-9a-f-]+)\/used$/);
  if (mcpCredUsedMatch && method === 'POST') { await markMcpCredentialUsed(req, res, mcpCredUsedMatch[1]!, mcpCredUsedMatch[2]!); return true; }
  // /api/v2/admin/agents/:id/skill-refs
  const skillRefMatch = url.match(/^\/api\/v2\/admin\/agents\/([0-9a-f-]+)\/skill-refs$/);
  if (skillRefMatch) {
    if (method === 'GET') { await listAgentSkillRefs(req, res, skillRefMatch[1]!); return true; }
    if (method === 'POST') { await createAgentSkillRef(req, res, skillRefMatch[1]!); return true; }
  }
  return false;
}
