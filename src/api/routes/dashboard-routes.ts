import type http from 'node:http';
import { pool } from '../../db/index.js';
import { jsonResponse } from './helpers.js';
import { requireBearer, requireAnyScope } from '../oauth-middleware.js';

export async function handleDashboardRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  method: string,
  url: string,
): Promise<boolean> {
  const u = new URL(url, 'http://localhost');
  if (!u.pathname.startsWith('/api/v2/admin/dashboard')) return false;
  if (method !== 'GET') {
    jsonResponse(res, 405, { error: 'method_not_allowed' });
    return true;
  }

  const ctx = await requireBearer(req, res);
  if (!ctx) return true;
  if (!requireAnyScope(ctx, ['reports:read', 'reports:admin'])) {
    jsonResponse(res, 403, { error: 'insufficient_scope', required: 'reports:read OR reports:admin' });
    return true;
  }

  if (u.pathname === '/api/v2/admin/dashboard/stats') {
    try {
      const countsRes = await pool.query(`
        SELECT
          (SELECT count(*) FROM provider_configs) AS llm,
          (SELECT count(*) FROM embedding_providers WHERE status != 'disabled') AS embedding,
          (SELECT count(*) FROM mcp_servers WHERE status != 'disabled') AS mcp,
          (SELECT count(*) FROM knowledge_bases) AS knowledge_bases,
          (SELECT count(*) FROM agents) AS agents,
          (SELECT count(*) FROM oauth_clients) AS oauth_clients,
          (SELECT count(*) FROM skills) AS skills
      `);
      const c = countsRes.rows[0] as any;

      const trendsRes = await pool.query(`
        SELECT date, dimension, SUM(count)::bigint AS count
        FROM mv_usage_reports_daily
        WHERE date >= TO_CHAR(CURRENT_DATE - INTERVAL '7 days', 'YYYY-MM-DD')
        GROUP BY date, dimension
        ORDER BY date ASC
      `);

      const trendMap = new Map<string, Record<string, number>>();
      for (const row of trendsRes.rows as any[]) {
        const day = row.date.toString();
        if (!trendMap.has(day)) trendMap.set(day, { date: day, token: 0, skill: 0, mcp: 0, knowledge: 0 });
        const entry = trendMap.get(day)!;
        const dim = row.dimension;
        if (dim === 'token' || dim === 'skill' || dim === 'mcp' || dim === 'knowledge') {
          entry[dim] = Number(row.count);
        }
      }

      jsonResponse(res, 200, {
        counts: {
          llm: Number(c.llm),
          embedding: Number(c.embedding),
          mcp: Number(c.mcp),
          knowledgeBases: Number(c.knowledge_bases),
          agents: Number(c.agents),
          oauthClients: Number(c.oauth_clients),
          skills: Number(c.skills),
        },
        trends: Array.from(trendMap.values()),
      });
      return true;
    } catch (err) {
      console.error('[dashboard] stats error:', err);
      jsonResponse(res, 500, { error: 'internal_error', message: String(err) });
      return true;
    }
  }

  jsonResponse(res, 404, { error: 'not_found' });
  return true;
}
