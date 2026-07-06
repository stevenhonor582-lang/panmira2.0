/**
 * Plan D Channel 维度使用上报端点:
 *   POST /api/v2/admin/channels/usage   (channel:admin 或 webhook:write)
 *   body: { channelKey, count? }
 *
 * 给 IM handlers (feishu/telegram) 调用,记录 channel 使用
 */
import type http from 'node:http';
import { jsonResponse, parseJsonBody } from './helpers.js';
import { requireBearer, requireAnyScope } from '../oauth-middleware.js';
import { recordChannelUsage } from '../../services/usage-tracker.js';

async function recordChannel(req: http.IncomingMessage, res: http.ServerResponse) {
  const ctx = await requireBearer(req, res);
  if (!ctx) return;
  if (!requireAnyScope(ctx, ['channel:admin', 'channel:write', 'webhook:write'])) {
    jsonResponse(res, 403, { error: 'insufficient_scope', required: 'channel:admin OR channel:write OR webhook:write' }); return;
  }
  const body = (await parseJsonBody(req)) as Record<string, unknown>;
  const { channelKey, count } = body;
  if (!channelKey || typeof channelKey !== 'string') {
    jsonResponse(res, 400, { error: 'channelKey required' }); return;
  }
  recordChannelUsage(ctx.tenantId, channelKey, Number(count) || 1);
  jsonResponse(res, 200, { success: true, data: { channelKey, recorded: Number(count) || 1 } });
}

export async function handleChannelUsageRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  method: string,
  url: string,
): Promise<boolean> {
  if (url === '/api/v2/admin/channels/usage' && method === 'POST') {
    await recordChannel(req, res);
    return true;
  }
  return false;
}
