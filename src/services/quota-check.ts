/**
 * Plan C Tenant Quota Check 服务
 * 检查 tenant 在某 dimension 上是否超 quota
 * 超限抛 QuotaExceeded
 */
import { eq, and, sql } from 'drizzle-orm';
import { db, pool } from '../db/index.js';
import { tenantQuotas } from '../db/schema.js';
import type { Dimension } from './usage-tracker.js';

export class QuotaExceeded extends Error {
  constructor(
    public dimension: string,
    public limit: number,
    public used: number,
    public period: string,
    public resetAt: string,
  ) {
    super(`quota exceeded: ${dimension} used ${used}/${limit} per ${period}`);
    this.name = 'QuotaExceeded';
  }
}

export interface QuotaCheck {
  allowed: boolean;
  dimension: string;
  period: string;
  used: number;
  limit: number;
  remaining: number;
  resetAt: string;
}

/** 计算 period 起始日期 (UTC) */
function periodStart(period: string): string {
  const now = new Date();
  if (period === 'monthly') {
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
  }
  return now.toISOString().slice(0, 10); // daily: today
}

/** 计算 period 结束时间 (ISO) — for Retry-After 头 */
function periodEndIso(period: string): string {
  const now = new Date();
  if (period === 'monthly') {
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    return next.toISOString();
  }
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return next.toISOString();
}

/**
 * 检查 tenant 在某 dimension 上, requestedCount 是否超 quota
 * 默认无 quota → always allowed
 */
export async function checkQuota(
  tenantId: string,
  dimension: Dimension,
  requestedCount: number = 1,
): Promise<QuotaCheck> {
  // 1. 查 tenant 的 quota config (enabled=true)
  const quotas = await db.select().from(tenantQuotas)
    .where(and(
      eq(tenantQuotas.tenantId, tenantId),
      eq(tenantQuotas.dimension, dimension),
      eq(tenantQuotas.enabled, true),
    ));
  if (quotas.length === 0) {
    return {
      allowed: true,
      dimension,
      period: 'daily',
      used: 0,
      limit: Infinity,
      remaining: Infinity,
      resetAt: periodEndIso('daily'),
    };
  }

  // 多个 quota (daily + monthly), 取最严格的 (remaining 最小且非无限)
  let strictest: QuotaCheck | null = null;
  for (const q of quotas) {
    const start = periodStart(q.period);
    // 查当前 period 用量
    const result = await pool.query(
      `SELECT COALESCE(SUM(count), 0)::bigint AS used
       FROM usage_reports
       WHERE tenant_id = $1 AND dimension = $2 AND date >= $3`,
      [tenantId, dimension, start],
    );
    const used = Number(result.rows[0]?.used || 0);
    const remaining = Math.max(0, q.limitValue - used);
    const allowed = used + requestedCount <= q.limitValue;
    const check: QuotaCheck = {
      allowed,
      dimension,
      period: q.period,
      used,
      limit: q.limitValue,
      remaining,
      resetAt: periodEndIso(q.period),
    };
    if (!strictest || remaining < strictest.remaining) {
      strictest = check;
    }
  }

  if (strictest && !strictest.allowed) {
    throw new QuotaExceeded(
      strictest.dimension,
      strictest.limit,
      strictest.used,
      strictest.period,
      strictest.resetAt,
    );
  }

  return strictest!;
}
