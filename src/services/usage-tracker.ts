/**
 * Plan B-3 usage_reports 写入工具
 * 异步 fire-and-forget 写 usage_reports 表
 * 同一 (date+dimension+dimension_key) 累加 count
 */
import { sql } from 'drizzle-orm';
import { db, pool } from '../db/index.js';

export type Dimension = 'token' | 'skill' | 'mcp' | 'channel' | 'knowledge';

export const DIMENSIONS: readonly Dimension[] = ['token', 'skill', 'mcp', 'channel', 'knowledge'] as const;

function isValidDimension(d: string): d is Dimension {
  return (DIMENSIONS as readonly string[]).includes(d);
}

export interface RecordUsageParams {
  tenantId: string;
  dimension: Dimension;
  dimensionKey: string;
  count?: number;
  date?: string;
}

/** 拿今天日期 YYYY-MM-DD (UTC) */
function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * 写一条 usage 记录,同 (date, dimension, dimension_key) 累加 count
 * 异步 fire-and-forget,错误仅 console.error
 */
export async function recordUsage(params: RecordUsageParams): Promise<void> {
  const date = params.date || todayDate();
  const count = params.count ?? 1;
  if (!params.tenantId || !params.dimensionKey) {
    console.warn('[usage-tracker] missing tenantId or dimensionKey', params);
    return;
  }
  if (!isValidDimension(params.dimension)) {
    console.warn('[usage-tracker] invalid dimension', params.dimension);
    return;
  }
  try {
    await pool.query(
      `INSERT INTO usage_reports (id, tenant_id, date, dimension, dimension_key, count, cost_usd, metadata)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 0, '{}'::jsonb)
       ON CONFLICT (tenant_id, date, dimension, dimension_key)
       DO UPDATE SET count = usage_reports.count + EXCLUDED.count`,
      [params.tenantId, date, params.dimension, params.dimensionKey, count],
    );
  } catch (err) {
    console.error('[usage-tracker] failed to record', err);
  }
}

/** Fire-and-forget 版本,不 await */
export function recordUsageAsync(params: RecordUsageParams): void {
  recordUsage(params).catch(() => { /* swallow */ });
}

// ── 各 dimension 的 helper ───────────────────────────────────────────

export function recordTokenUsage(tenantId: string, key: string, count = 1): void {
  recordUsageAsync({ tenantId, dimension: 'token', dimensionKey: key, count });
}
export function recordSkillUsage(tenantId: string, key: string, count = 1): void {
  recordUsageAsync({ tenantId, dimension: 'skill', dimensionKey: key, count });
}
export function recordMcpUsage(tenantId: string, key: string, count = 1): void {
  recordUsageAsync({ tenantId, dimension: 'mcp', dimensionKey: key, count });
}
export function recordChannelUsage(tenantId: string, key: string, count = 1): void {
  recordUsageAsync({ tenantId, dimension: 'channel', dimensionKey: key, count });
}
export function recordKnowledgeUsage(tenantId: string, key: string, count = 1): void {
  recordUsageAsync({ tenantId, dimension: 'knowledge', dimensionKey: key, count });
}
