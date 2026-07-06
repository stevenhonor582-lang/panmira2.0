/**
 * Plan B-3 报表查询端点:
 *   GET /api/v2/admin/reports/{dimension}?from=&to=&groupBy=
 *   dimension: token / skill / mcp / channel / knowledge
 *   groupBy:   day (default) / dimension_key
 *   权限: reports:read OR reports:admin
 */
import type http from 'node:http';
import { eq, and, gte, lte, sql } from 'drizzle-orm';
import { pool } from '../../db/index.js';
import { usageReports } from '../../db/schema.js';
import { jsonResponse } from './helpers.js';
import { requireBearer, requireAnyScope } from '../oauth-middleware.js';
import { DIMENSIONS, type Dimension } from '../../services/usage-tracker.js';

const VALID_GROUP_BY = ['day', 'dimension_key'] as const;
type GroupBy = typeof VALID_GROUP_BY[number];

function isValidDimension(d: string): d is Dimension {
  return (DIMENSIONS as readonly string[]).includes(d);
}
function isValidGroupBy(g: string): g is GroupBy {
  return (VALID_GROUP_BY as readonly string[]).includes(g);
}

function defaultFrom(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}
function defaultTo(): string {
  return new Date().toISOString().slice(0, 10);
}

async function queryReports(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  dimension: Dimension,
) {
  const ctx = await requireBearer(req, res);
  if (!ctx) return;
  if (!requireAnyScope(ctx, ['reports:read', 'reports:admin'])) {
    jsonResponse(res, 403, { error: 'insufficient_scope', required: 'reports:read OR reports:admin' }); return;
  }

  const url = req.url || '';
  const qp = new URL(url, 'http://localhost').searchParams;
  const from = qp.get('from') || defaultFrom();
  const to = qp.get('to') || defaultTo();
  const groupBy = (qp.get('groupBy') || 'day') as string;
  if (!isValidGroupBy(groupBy)) {
    jsonResponse(res, 400, { error: 'invalid groupBy', allowed: VALID_GROUP_BY });
    return;
  }

  let rows: any[];
  if (groupBy === 'day') {
    const result = await pool.query(
      `SELECT date, SUM(count)::bigint AS count
       FROM usage_reports
       WHERE tenant_id = $1 AND dimension = $2 AND date BETWEEN $3 AND $4
       GROUP BY date
       ORDER BY date ASC`,
      [ctx.tenantId, dimension, from, to],
    );
    rows = result.rows;
  } else {
    const result = await pool.query(
      `SELECT dimension_key AS dimensionKey, SUM(count)::bigint AS count
       FROM usage_reports
       WHERE tenant_id = $1 AND dimension = $2 AND date BETWEEN $3 AND $4
       GROUP BY dimension_key
       ORDER BY count DESC
       LIMIT 100`,
      [ctx.tenantId, dimension, from, to],
    );
    rows = result.rows;
  }

  jsonResponse(res, 200, {
    success: true,
    data: {
      dimension,
      from,
      to,
      groupBy,
      rows: rows.map(r => ({
        ...(groupBy === 'day' ? { date: r.date } : { dimensionKey: r.dimensionkey || r.dimensionKey }),
        count: Number(r.count),
      })),
    },
  });
}

export async function handleReportsRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  method: string,
  url: string,
): Promise<boolean> {
  if (method !== 'GET') return false;
  const pathOnly = url.split('?')[0]!;
  const m = pathOnly.match(/^\/api\/v2\/admin\/reports\/([a-z_]+)$/);
  if (m && isValidDimension(m[1]!)) {
    await queryReports(req, res, m[1] as Dimension);
    return true;
  }
  return false;
}
