/**
 * Admin Cache Routes (Phase 4 Level 3 Fix 3):
 *   POST /api/v2/admin/pipelines/cache/invalidate  (agent:admin)
 *   - Clears the pipelineCache Map in pipeline-bot-trigger.ts
 *   - Clears the botAgentTemplateCache Map in feishu-bot-starter.ts (if any)
 *
 * Required when:
 * - Pipeline graph (nodes/edges) changed → bot-cache stale
 * - bot_configs.agent_template_id changed → bot-trigger stale
 */
import type http from 'node:http';
import { requireBearer, requireScopes } from '../oauth-middleware.js';
import { jsonResponse } from './helpers.js';
import { invalidatePipelineCache, getCacheSize } from '../../services/pipeline-bot-trigger.js';

export async function handleAdminCacheRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  method: string,
  url: string,
): Promise<boolean> {
  if (url !== "/api/v2/admin/pipelines/cache/invalidate") return false;

  if (method !== "POST") {
    jsonResponse(res, 405, { error: "method_not_allowed", allowed: ["POST"] });
    return true;
  }

  const ctx = await requireBearer(req, res); if (!ctx) return true;
  const check = requireScopes(ctx, ["agent:admin"]);
  if (!check.ok) {
    jsonResponse(res, 403, { error: "insufficient_scope", required: "agent:admin" });
    return true;
  }

  const beforeSize = getCacheSize();
  invalidatePipelineCache();
  jsonResponse(res, 200, {
    ok: true,
    cleared: beforeSize,
    clearedAt: new Date().toISOString(),
  });
  return true;
}
