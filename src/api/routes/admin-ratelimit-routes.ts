/**
 * Admin Rate Limit Routes (Phase 4 Level 4 #1):
 *   POST   /api/v2/admin/rate-limit/override                    (agent:admin)
 *     body: { userId: string, ratePerMin?: number, dailyTokens?: number }
 *     -> 200 { ok, userId, effective: { ratePerMin, dailyTokens } }
 *     -> 400 missing/invalid userId
 *     -> 403 missing scope
 *
 *   DELETE /api/v2/admin/rate-limit/override/{userId}           (agent:admin)
 *     -> 200 { ok, userId, cleared: true|false }
 *
 *   GET    /api/v2/admin/rate-limit/inspect/{userId}            (agent:admin)
 *     -> 200 {
 *         ok, userId,
 *         rate: { count, resetAt } | null,
 *         tokens: { tokens, resetAt } | null,
 *         override: { ratePerMin?, dailyTokens? } | null,
 *         effective: { ratePerMin, dailyTokens },
 *         defaults: { ratePerMin, dailyTokens }
 *       }
 */
import type http from 'node:http';
import { requireBearer, requireScopes } from '../oauth-middleware.js';
import { jsonResponse, parseJsonBody } from './helpers.js';
import {
  setOverride,
  clearOverride,
  getOverride,
  _inspect,
} from '../../middleware/pipeline-rate-limit.js';

async function setOverrideRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<boolean> {
  const body = (await parseJsonBody(req)) as {
    userId?: unknown;
    ratePerMin?: unknown;
    dailyTokens?: unknown;
  };
  const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
  if (!userId) {
    jsonResponse(res, 400, { error: 'invalid_request', message: 'userId (string) required' });
    return true;
  }

  const rate = body.ratePerMin;
  const tokens = body.dailyTokens;
  let rateArg: number | null = null;
  let tokensArg: number | null = null;
  if (rate !== undefined && rate !== null) {
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
      jsonResponse(res, 400, { error: 'invalid_request', message: 'ratePerMin must be positive number' });
      return true;
    }
    rateArg = rate;
  }
  if (tokens !== undefined && tokens !== null) {
    if (typeof tokens !== 'number' || !Number.isFinite(tokens) || tokens <= 0) {
      jsonResponse(res, 400, { error: 'invalid_request', message: 'dailyTokens must be positive number' });
      return true;
    }
    tokensArg = tokens;
  }
  if (rateArg === null && tokensArg === null) {
    jsonResponse(res, 400, { error: 'invalid_request', message: 'ratePerMin and/or dailyTokens required' });
    return true;
  }

  const next = setOverride(userId, rateArg, tokensArg);
  const state = _inspect(userId);
  jsonResponse(res, 200, {
    ok: true,
    userId,
    override: next,
    effective: { ratePerMin: state.limits.perMin, dailyTokens: state.limits.daily },
  });
  return true;
}

async function clearOverrideRoute(
  res: http.ServerResponse,
  userId: string,
): Promise<boolean> {
  if (!userId) {
    jsonResponse(res, 400, { error: 'invalid_request', message: 'userId required' });
    return true;
  }
  const cleared = clearOverride(userId);
  jsonResponse(res, 200, { ok: true, userId, cleared });
  return true;
}

async function inspectRoute(
  res: http.ServerResponse,
  userId: string,
): Promise<boolean> {
  if (!userId) {
    jsonResponse(res, 400, { error: 'invalid_request', message: 'userId required' });
    return true;
  }
  const state = _inspect(userId);
  jsonResponse(res, 200, {
    ok: true,
    userId,
    rate: state.rate ?? null,
    tokens: state.tokens ?? null,
    override: getOverride(userId) ?? null,
    effective: { ratePerMin: state.limits.perMin, dailyTokens: state.limits.daily },
    defaults: { ratePerMin: state.limits.defaultPerMin, dailyTokens: state.limits.defaultDaily },
  });
  return true;
}

export async function handleAdminRateLimitRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  method: string,
  url: string,
): Promise<boolean> {
  // POST /api/v2/admin/rate-limit/override
  if (url === '/api/v2/admin/rate-limit/override' && method === 'POST') {
    const ctx = await requireBearer(req, res); if (!ctx) return true;
    const check = requireScopes(ctx, ['agent:admin']);
    if (!check.ok) {
      jsonResponse(res, 403, { error: 'insufficient_scope', required: 'agent:admin' });
      return true;
    }
    return setOverrideRoute(req, res);
  }

  // DELETE /api/v2/admin/rate-limit/override/{userId}
  const deleteMatch = url.match(/^\/api\/v2\/admin\/rate-limit\/override\/([^\/]+)$/);
  if (deleteMatch && method === 'DELETE') {
    const ctx = await requireBearer(req, res); if (!ctx) return true;
    const check = requireScopes(ctx, ['agent:admin']);
    if (!check.ok) {
      jsonResponse(res, 403, { error: 'insufficient_scope', required: 'agent:admin' });
      return true;
    }
    return clearOverrideRoute(res, decodeURIComponent(deleteMatch[1]));
  }

  // GET /api/v2/admin/rate-limit/inspect/{userId}
  const inspectMatch = url.match(/^\/api\/v2\/admin\/rate-limit\/inspect\/([^\/]+)$/);
  if (inspectMatch && method === 'GET') {
    const ctx = await requireBearer(req, res); if (!ctx) return true;
    const check = requireScopes(ctx, ['agent:admin']);
    if (!check.ok) {
      jsonResponse(res, 403, { error: 'insufficient_scope', required: 'agent:admin' });
      return true;
    }
    return inspectRoute(res, decodeURIComponent(inspectMatch[1]));
  }

  return false;
}
