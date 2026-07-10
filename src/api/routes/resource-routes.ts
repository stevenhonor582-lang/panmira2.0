/**
 * Plan B-1 资源引擎端点:
 *   /api/v2/admin/embedding-providers  (CRUD,需 model:admin scope)
 *   /api/v2/admin/mcp-servers          (CRUD + health check,需 mcp:admin scope)
 *   /api/v2/admin/agents/:id/skill-refs (CRUD,需 agent:edit scope)
 *
 * 模式:跟 oauth-routes 一样,纯函数 handleXxxRoutes,挂 http-server
 */
import type http from 'node:http';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { embeddingProviders, mcpServers, agentSkillRefs, skills, agentInstances } from '../../db/schema.js';
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
  // /api/v2/admin/agents/:id/skill-refs
  const skillRefMatch = url.match(/^\/api\/v2\/admin\/agents\/([0-9a-f-]+)\/skill-refs$/);
  if (skillRefMatch) {
    if (method === 'GET') { await listAgentSkillRefs(req, res, skillRefMatch[1]!); return true; }
    if (method === 'POST') { await createAgentSkillRef(req, res, skillRefMatch[1]!); return true; }
  }
  return false;
}
