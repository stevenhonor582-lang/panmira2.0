/**
 * Admin Memory Routes (2026-07-08, P9 BLOCKER fix)
 *
 * /api/v2/admin/memory/aggregate (POST)
 *   - Triggers aggregation across memories + extracted_memories + memory_settings
 *   - Returns: { success, summary, byLayer, topBots, ts }
 *
 * 安全: requireBearer + agent:admin scope (跟其他 admin 一致)
 */
import type * as http from 'node:http';
import { db } from '../../db/index.js';
import { sql } from 'drizzle-orm';
import { jsonResponse, parseJsonBody } from './helpers.js';
import { requireBearer, requireScopes } from '../oauth-middleware.js';

interface LayerAgg {
  layer: number;
  n: number;
  avg_imp: number | null;
  latest: string | null;
}

interface BotAgg {
  bot_id: string;
  n: number;
}

interface CountRow {
  n: number;
}

interface DrizzleRows<T> {
  rows: T[];
}

function asRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === 'object' && 'rows' in result) {
    return (result as DrizzleRows<T>).rows;
  }
  return [];
}

function asCount(result: unknown): number {
  const rows = asRows<CountRow>(result);
  return rows[0]?.n ?? 0;
}

export async function handleAdminMemoryRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  method: string,
  url: string,
): Promise<boolean> {
  if (!url.startsWith('/api/v2/admin/memory')) return false;

  const ctx = await requireBearer(req, res);
  if (!ctx) return true;

  // POST /api/v2/admin/memory/aggregate
  if (url === '/api/v2/admin/memory/aggregate' && method === 'POST') {
    const check = requireScopes(ctx, ['agent:admin']);
    if (!check.ok) {
      jsonResponse(res, 403, { error: 'insufficient_scope', missing: check.missing });
      return true;
    }
    await parseJsonBody(req).catch(() => ({}));
    try {
      // R10 (2026-07-08): drop tenant_id filter — memories.tenant_id uses
      // legacy formats ('user:ou_xxx' / 'default' / 'tenant:backfill' / etc.)
      // that never match users.tenant_id (UUID). Admin aggregate sees all rows.
      const byLayerRaw = await db.execute(sql`
        SELECT layer, count(*)::int AS n,
          avg(importance)::float AS avg_imp,
          max(created_at) AS latest
        FROM memories
        GROUP BY layer
        ORDER BY layer
      `);
      const byLayer: LayerAgg[] = asRows<LayerAgg>(byLayerRaw);

      const topBotsRaw = await db.execute(sql`
        SELECT bot_id, count(*)::int AS n
        FROM memories
        WHERE bot_id IS NOT NULL
        GROUP BY bot_id
        ORDER BY n DESC
        LIMIT 10
      `);
      const topBots: BotAgg[] = asRows<BotAgg>(topBotsRaw);

      const totalRaw = await db.execute(sql`
        SELECT count(*)::int AS n FROM memories
      `);
      const total = asCount(totalRaw);

      jsonResponse(res, 200, {
        success: true,
        summary: { total, tenantId: ctx.tenantId, scope: 'all_tenants' },
        byLayer,
        topBots,
        ts: new Date().toISOString(),
      });
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'unknown';
      jsonResponse(res, 500, { error: 'aggregate_failed', message });
      return true;
    }
  }

  // GET /api/v2/admin/memory/stats
  if (url === '/api/v2/admin/memory/stats' && method === 'GET') {
    const check = requireScopes(ctx, ['agent:read', 'agent:admin']);
    if (!check.ok) {
      jsonResponse(res, 403, { error: 'insufficient_scope', missing: check.missing });
      return true;
    }
    try {
      const totalRaw = await db.execute(sql`
        SELECT count(*)::int AS n FROM memories
      `);
      const total = asCount(totalRaw);
      jsonResponse(res, 200, { success: true, total, scope: 'all_tenants' });
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'unknown';
      jsonResponse(res, 500, { error: 'stats_failed', message });
      return true;
    }
  }

  return false;
}
