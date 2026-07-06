/**
 * Plan D 报表 CSV 导出端点:
 *   GET /api/v2/admin/reports/{dimension}/export?from=&to=&groupBy=&format=csv
 *   响应: text/csv + Content-Disposition: attachment
 */
import type http from 'node:http';
import { pool } from '../../db/index.js';
import { jsonResponse } from './helpers.js';
import { requireBearer, requireAnyScope } from '../oauth-middleware.js';
import { DIMENSIONS, type Dimension } from '../../services/usage-tracker.js';

const VALID_GROUP_BY = ['day', 'dimension_key'] as const;
type GroupBy = typeof VALID_GROUP_BY[number];

function isValidDimension(d: string): d is Dimension {
  return (DIMENSIONS as readonly string[]).includes(d);
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function defaultFrom(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}
function defaultTo(): string {
  return new Date().toISOString().slice(0, 10);
}

async function exportReports(req: http.IncomingMessage, res: http.ServerResponse, dimension: Dimension) {
  const ctx = await requireBearer(req, res);
  if (!ctx) return;
  if (!requireAnyScope(ctx, ['reports:read', 'reports:admin'])) {
    jsonResponse(res, 403, { error: 'insufficient_scope', required: 'reports:read OR reports:admin' }); return;
  }

  const url = req.url || '';
  const pathOnly = url.split('?')[0]!;
  const qp = new URL(url, 'http://localhost').searchParams;
  const from = qp.get('from') || defaultFrom();
  const to = qp.get('to') || defaultTo();
  const groupBy = (qp.get('groupBy') || 'day') as string;
  if (!(VALID_GROUP_BY as readonly string[]).includes(groupBy)) {
    jsonResponse(res, 400, { error: 'invalid groupBy', allowed: VALID_GROUP_BY });
    return;
  }

  // 优先 MV
  let mvAvailable = true;
  try { await pool.query('SELECT 1 FROM mv_usage_reports_daily LIMIT 1'); } catch { mvAvailable = false; }
  const src = mvAvailable ? 'mv_usage_reports_daily' : 'usage_reports';

  let rows: any[];
  if (groupBy === 'day') {
    const r = await pool.query(
      `SELECT date, dimension, dimension_key, SUM(count)::bigint AS count
       FROM ${src}
       WHERE tenant_id = $1 AND dimension = $2 AND date BETWEEN $3 AND $4
       GROUP BY date, dimension, dimension_key
       ORDER BY date ASC`,
      [ctx.tenantId, dimension, from, to],
    );
    rows = r.rows;
  } else {
    const r = await pool.query(
      `SELECT dimension_key AS dimensionKey, dimension, SUM(count)::bigint AS count
       FROM ${src}
       WHERE tenant_id = $1 AND dimension = $2 AND date BETWEEN $3 AND $4
       GROUP BY dimension_key, dimension
       ORDER BY count DESC
       LIMIT 10000`,
      [ctx.tenantId, dimension, from, to],
    );
    rows = r.rows;
  }

  // CSV 输出
  const header = groupBy === 'day' ? 'date,dimension,dimension_key,count' : 'dimension_key,dimension,count';
  const lines = [header];
  for (const r of rows) {
    if (groupBy === 'day') {
      lines.push([r.date, r.dimension, r.dimension_key, r.count].map(csvEscape).join(','));
    } else {
      lines.push([r.dimensionkey || r.dimensionKey, r.dimension, r.count].map(csvEscape).join(','));
    }
  }
  const csv = lines.join('\n') + '\n';

  // 静默 unused warning for pathOnly
  void pathOnly;

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="panmira-${dimension}-${from}-to-${to}.csv"`);
  res.end(csv);
}

export async function handleReportsExportRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  method: string,
  url: string,
): Promise<boolean> {
  if (method !== 'GET') return false;
  const pathOnly = url.split('?')[0]!;
  const m = pathOnly.match(/^\/api\/v2\/admin\/reports\/([a-z_]+)\/export$/);
  if (m && isValidDimension(m[1]!)) {
    await exportReports(req, res, m[1] as Dimension);
    return true;
  }
  return false;
}
