/**
 * Plan B-2 Agent KB refs 端点:
 *   GET    /api/v2/agents/:id/knowledge-refs      (agent:read)
 *   POST   /api/v2/agents/:id/knowledge-refs      (agent:edit, body: { kbId, topK?, minScore? })
 *   DELETE /api/v2/agents/:id/knowledge-refs/:refId  (agent:edit)
 *
 * 业务端 (Bearer Token 鉴权),通过 requireBearer + requireScopes
 */
import type http from 'node:http';
import { eq, and } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { agentKnowledgeRefs, knowledgeBases } from '../../db/schema.js';
import { jsonResponse, parseJsonBody } from './helpers.js';
import { requireBearer, requireScopes } from '../oauth-middleware.js';

async function listKnowledgeRefs(req: http.IncomingMessage, res: http.ServerResponse, agentId: string) {
  const ctx = await requireBearer(req, res);
  if (!ctx) return;
  const check = requireScopes(ctx, ['agent:read', 'agent:edit', 'agent:admin']);
  if (!check.ok) { jsonResponse(res, 403, { error: 'insufficient_scope', missing: check.missing }); return; }

  const rows = await db.select().from(agentKnowledgeRefs).where(eq(agentKnowledgeRefs.agentId, agentId));
  jsonResponse(res, 200, { success: true, data: rows });
}

async function createKnowledgeRef(req: http.IncomingMessage, res: http.ServerResponse, agentId: string) {
  const ctx = await requireBearer(req, res);
  if (!ctx) return;
  const check = requireScopes(ctx, ['agent:edit', 'agent:admin']);
  if (!check.ok) { jsonResponse(res, 403, { error: 'insufficient_scope', missing: check.missing }); return; }

  const body = (await parseJsonBody(req)) as Record<string, unknown>;
  const { kbId, topK, minScore } = body;
  if (!kbId) { jsonResponse(res, 400, { error: 'kbId required' }); return; }

  // 验证 KB 存在
  const [kb] = await db.select().from(knowledgeBases).where(eq(knowledgeBases.id, String(kbId))).limit(1);
  if (!kb) { jsonResponse(res, 404, { error: 'KB not found' }); return; }

  // 同一 agent + kb 不能重复 bind(去重)
  const existing = await db.select().from(agentKnowledgeRefs)
    .where(and(eq(agentKnowledgeRefs.agentId, agentId), eq(agentKnowledgeRefs.kbId, String(kbId))));
  if (existing.length > 0) {
    jsonResponse(res, 200, { success: true, data: existing[0], note: 'already bound' });
    return;
  }

  const [row] = await db.insert(agentKnowledgeRefs).values({
    agentId,
    kbId: String(kbId),
    topK: Number(topK) || 5,
    minScore: String(minScore || '0'),
  }).returning();
  jsonResponse(res, 201, { success: true, data: row });
}

async function deleteKnowledgeRef(req: http.IncomingMessage, res: http.ServerResponse, agentId: string, refId: string) {
  const ctx = await requireBearer(req, res);
  if (!ctx) return;
  const check = requireScopes(ctx, ['agent:edit', 'agent:admin']);
  if (!check.ok) { jsonResponse(res, 403, { error: 'insufficient_scope', missing: check.missing }); return; }

  const [ref] = await db.select().from(agentKnowledgeRefs)
    .where(and(eq(agentKnowledgeRefs.id, refId), eq(agentKnowledgeRefs.agentId, agentId)))
    .limit(1);
  if (!ref) { jsonResponse(res, 404, { error: 'ref not found' }); return; }

  await db.delete(agentKnowledgeRefs).where(eq(agentKnowledgeRefs.id, refId));
  jsonResponse(res, 200, { success: true, data: { id: refId, deleted: true } });
}

export async function handleAgentKnowledgeRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  method: string,
  url: string,
): Promise<boolean> {
  // /api/v2/agents/:id/knowledge-refs
  const listMatch = url.match(/^\/api\/v2\/agents\/([^/]+)\/knowledge-refs$/);
  if (listMatch) {
    if (method === 'GET') { await listKnowledgeRefs(req, res, listMatch[1]!); return true; }
    if (method === 'POST') { await createKnowledgeRef(req, res, listMatch[1]!); return true; }
  }

  // /api/v2/agents/:id/knowledge-refs/:refId
  const delMatch = url.match(/^\/api\/v2\/agents\/([^/]+)\/knowledge-refs\/([^/]+)$/);
  if (delMatch && method === 'DELETE') {
    await deleteKnowledgeRef(req, res, delMatch[1]!, delMatch[2]!);
    return true;
  }

  return false;
}
