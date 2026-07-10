/**
 * R14-D · Billing Aggregate (2026-07-08)
 *
 * Token-centric billing endpoint. Replaces the old "credits / 代批四 / channel+KB"
 * surface with a single fetch that returns 4 sections:
 *
 *   GET /api/v2/admin/billing-aggregate
 *
 * Response:
 *   {
 *     overview:  { today, week, month, cost30d, daily: [{day,input,output,total,cost}] },
 *     byEmployee:[{ id, name, avatarUrl, department, tokens30d, tokensToday, cost, pct }],
 *     byAgent:   [{ id, name, avatarUrl, tokens, cost, pct }],
 *     bySource:  [{ key, label, tokens, pct }]   // activity_events.user_id 分组
 *   }
 *
 * Design notes (data reality on this tenant):
 *   - activity_events.bot_id  is always NULL; bot_name is the join key.
 *   - activity_events.user_id holds 飞书 ou_* / "web" / "api" — no FK to users.
 *     So "by employee" joins via activity_events.bot_name → agents.name
 *     (LIKE prefix match — agents.name is "bot_name--template_suffix")
 *     → agents.owner_user_id → users.id.
 *   - No pipeline_id on activity_events; "by source" groups by user_id prefix
 *     instead. Channels/KB are excluded per product decision (not billable).
 *   - Token is the only cost dimension. cost_usd is reported as-is when present.
 */
import type * as http from 'node:http';
import { sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { jsonResponse } from './helpers.js';
import { requireBearer } from '../oauth-middleware.js';

// ── helpers ──────────────────────────────────────────────────────
function asArr(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (result && typeof result === 'object' && 'rows' in result) {
    const rows = (result as { rows: unknown }).rows;
    if (Array.isArray(rows)) return rows as Record<string, unknown>[];
  }
  return [];
}

function toInt(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : fallback;
}

function toNum(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : fallback;
}

function toStr(v: unknown, fallback = ''): string {
  if (v === null || v === undefined) return fallback;
  return String(v);
}

// Fill missing days so the 30-day bar chart stays continuous.
function fillDays(
  rows: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  const byDay = new Map<string, Record<string, unknown>>();
  for (const r of rows) {
    const day = toStr(r.day);
    if (day) byDay.set(day, r);
  }
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400_000);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const hit = byDay.get(key);
    out.push({
      day: key,
      input: hit ? toInt(hit.input) : 0,
      output: hit ? toInt(hit.output) : 0,
      total: hit ? toInt(hit.total !== undefined ? hit.total : (toInt(hit.input) + toInt(hit.output))) : 0,
      cost: hit ? toNum(hit.cost) : 0,
    });
  }
  return out;
}

// Compute percentage with a stable divisor; returns 0 when divisor is 0.
function pctOf(part: number, total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0;
  return Number(((part / total) * 100).toFixed(2));
}

// Pretty label for activity_events.user_id (ou_xxx → 飞书用户 xxx).
function sourceLabel(raw: string): { key: string; label: string } {
  if (!raw) return { key: 'unknown', label: '未知来源' };
  if (raw === 'web') return { key: 'web', label: 'Web 控制台' };
  if (raw === 'api') return { key: 'api', label: 'API 调用' };
  if (raw.startsWith('ou_')) {
    const short = raw.length > 12 ? raw.slice(0, 10) + '…' : raw;
    return { key: raw, label: `飞书用户 ${short}` };
  }
  return { key: raw, label: raw };
}

// ── main handler ─────────────────────────────────────────────────
export async function handleBillingAggregateRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  method: string,
  url: string,
): Promise<boolean> {
  const u = new URL(url, 'http://localhost');
  if (!u.pathname.startsWith('/api/v2/admin/billing-aggregate')) return false;
  if (method !== 'GET') {
    jsonResponse(res, 405, { error: 'method_not_allowed' });
    return true;
  }

  const ctx = await requireBearer(req, res);
  if (!ctx) return true;
  // requireBearer enforces auth; admin has '*' scope. Surface is read-only.

  try {
    const [
      todayRaw, weekRaw, monthRaw, cost30dRaw,
      dailyRaw,
      byEmployeeRaw,
      byAgentRaw,
      bySourceRaw,
    ] = await Promise.all([
      // ── overview KPIs ──
      db.execute(sql`
        SELECT coalesce(sum(input_tokens + output_tokens), 0)::bigint AS tokens
        FROM activity_events
        WHERE to_timestamp(timestamp / 1000.0) > now() - interval '1 day'
      `),
      db.execute(sql`
        SELECT coalesce(sum(input_tokens + output_tokens), 0)::bigint AS tokens
        FROM activity_events
        WHERE to_timestamp(timestamp / 1000.0) > now() - interval '7 days'
      `),
      db.execute(sql`
        SELECT coalesce(sum(input_tokens + output_tokens), 0)::bigint AS tokens
        FROM activity_events
        WHERE to_timestamp(timestamp / 1000.0) > now() - interval '30 days'
      `),
      db.execute(sql`
        SELECT round(coalesce(sum(cost_usd), 0)::numeric, 4)::float AS cost
        FROM activity_events
        WHERE to_timestamp(timestamp / 1000.0) > now() - interval '30 days'
      `),
      // ── 30-day daily series ──
      db.execute(sql`
        SELECT to_char(to_timestamp(timestamp / 1000.0)::date, 'YYYY-MM-DD') AS day,
               coalesce(sum(input_tokens), 0)::bigint AS input,
               coalesce(sum(output_tokens), 0)::bigint AS output,
               coalesce(sum(input_tokens + output_tokens), 0)::bigint AS total,
               round(coalesce(sum(cost_usd), 0)::numeric, 4)::float AS cost
        FROM activity_events
        WHERE to_timestamp(timestamp / 1000.0) > now() - interval '30 days'
        GROUP BY day
        ORDER BY day
      `),
      // ── by employee (via bot_name → agents.name LIKE prefix → owner_user_id) ──
      // activity_events.bot_name 形如 "得一"; agents.name 形如 "得一--替补模板"。
      // 关联路径: ae.bot_name -> agents.name LIKE 'bot_name--%' -> agents.owner_user_id -> users.id
      // 未关联上的 (NULL owner / 名称不匹配) 计入 "未归属"。
      db.execute(sql`
        WITH agent_owner AS (
          SELECT a.id AS agent_id,
                 a.name AS agent_name,
                 a.owner_user_id AS owner_user_id
          FROM agent_instances a
          WHERE a.status = 'active'
        ),
        agent_tokens AS (
          SELECT ao.owner_user_id,
                 coalesce(sum(ae.input_tokens + ae.output_tokens), 0)::bigint AS tokens_30d,
                 coalesce(sum(ae.input_tokens + ae.output_tokens) FILTER (
                     WHERE to_timestamp(ae.timestamp / 1000.0) > now() - interval '1 day'
                 ), 0)::bigint AS tokens_today,
                 round(coalesce(sum(ae.cost_usd), 0)::numeric, 4)::float AS cost
          FROM activity_events ae
          JOIN agent_owner ao
            ON ao.agent_name = ae.bot_name
            OR ao.agent_name LIKE (ae.bot_name || '--%')
          WHERE to_timestamp(ae.timestamp / 1000.0) > now() - interval '30 days'
            AND ae.bot_name IS NOT NULL
          GROUP BY ao.owner_user_id
        )
        SELECT u.id, u.name, u.avatar_url, u.department,
               coalesce(at.tokens_30d, 0)::bigint AS tokens_30d,
               coalesce(at.tokens_today, 0)::bigint AS tokens_today,
               coalesce(at.cost, 0)::float AS cost
        FROM users u
        LEFT JOIN agent_tokens at ON at.owner_user_id = u.id
        WHERE u.employee_status = 'active'
        ORDER BY at.tokens_30d DESC NULLS LAST, u.name ASC
      `),
      // ── by digital employee (agent) ──
      db.execute(sql`
        SELECT a.id, a.name, a.avatar_url,
               coalesce(sum(ae.input_tokens + ae.output_tokens), 0)::bigint AS tokens,
               round(coalesce(sum(ae.cost_usd), 0)::numeric, 4)::float AS cost
        FROM agent_instances a
        LEFT JOIN activity_events ae
          ON (a.name = ae.bot_name OR a.name LIKE (ae.bot_name || '--%'))
          AND to_timestamp(ae.timestamp / 1000.0) > now() - interval '30 days'
        WHERE a.status = 'active'
        GROUP BY a.id, a.name, a.avatar_url
        HAVING coalesce(sum(ae.input_tokens + ae.output_tokens), 0) > 0
        ORDER BY tokens DESC NULLS LAST
      `),
      // ── by source (activity_events.user_id 分组; 替代 pipeline_id) ──
      db.execute(sql`
        SELECT coalesce(user_id, 'unknown') AS user_id,
               coalesce(sum(input_tokens + output_tokens), 0)::bigint AS tokens
        FROM activity_events
        WHERE to_timestamp(timestamp / 1000.0) > now() - interval '30 days'
        GROUP BY user_id
        ORDER BY tokens DESC
      `),
    ]);

    // ── shape overview ──
    const today = toInt(asArr(todayRaw)[0]?.tokens);
    const week = toInt(asArr(weekRaw)[0]?.tokens);
    const month = toInt(asArr(monthRaw)[0]?.tokens);
    const cost30d = toNum(asArr(cost30dRaw)[0]?.cost);
    const daily = fillDays(asArr(dailyRaw));

    // ── shape byEmployee (百分比基于 month) ──
    const employeeRows = asArr(byEmployeeRaw).map((r) => ({
      id: toStr(r.id),
      name: toStr(r.name, '未命名'),
      avatarUrl: r.avatar_url ? toStr(r.avatar_url) : null,
      department: r.department ? toStr(r.department) : null,
      tokens30d: toInt(r.tokens_30d),
      tokensToday: toInt(r.tokens_today),
      cost: toNum(r.cost),
    }));
    const employeeTotal = employeeRows.reduce((acc, e) => acc + e.tokens30d, 0);
    // 未归属(数字员工的 owner 为空 / 员工已离职)的 token 单列一行。
    const unattributedEmpTokens = Math.max(0, month - employeeTotal);
    const byEmployee = employeeRows
      .map((e) => ({ ...e, pct: pctOf(e.tokens30d, month) }))
      .sort((a, b) => b.tokens30d - a.tokens30d);
    if (unattributedEmpTokens > 0) {
      byEmployee.push({
        id: '__unattributed__',
        name: '未归属员工',
        avatarUrl: null,
        department: null,
        tokens30d: unattributedEmpTokens,
        tokensToday: 0,
        cost: 0,
        pct: pctOf(unattributedEmpTokens, month),
      });
    }

    // ── shape byAgent ──
    const agentRows = asArr(byAgentRaw).map((r) => ({
      id: toStr(r.id),
      name: toStr(r.name, '未命名'),
      avatarUrl: r.avatar_url ? toStr(r.avatar_url) : null,
      tokens: toInt(r.tokens),
      cost: toNum(r.cost),
    }));
    const agentTotal = agentRows.reduce((acc, a) => acc + a.tokens, 0);
    // 未归属的 token (bot_name 在 activity_events 但 agents 表里没匹配项,例如已弃用)
    // 归入"未归属数字员工"行,保证 byAgent 总和 === overview.month。
    const unattributedAgentTokens = Math.max(0, month - agentTotal);
    const byAgent = agentRows
      .map((a) => ({ ...a, pct: pctOf(a.tokens, month) }))
      .sort((a, b) => b.tokens - a.tokens);
    if (unattributedAgentTokens > 0) {
      byAgent.push({
        id: '__unattributed__',
        name: '未归属数字员工',
        avatarUrl: null,
        tokens: unattributedAgentTokens,
        cost: 0,
        pct: pctOf(unattributedAgentTokens, month),
      });
    }

    // ── shape bySource (合并并打标签) ──
    const sourceMap = new Map<string, { label: string; tokens: number }>();
    for (const r of asArr(bySourceRaw)) {
      const raw = toStr(r.user_id);
      const { key, label } = sourceLabel(raw);
      const tokens = toInt(r.tokens);
      const prev = sourceMap.get(key);
      if (prev) prev.tokens += tokens;
      else sourceMap.set(key, { label, tokens });
    }
    const sourceList = Array.from(sourceMap.entries()).map(([key, v]) => ({
      key,
      label: v.label,
      tokens: v.tokens,
    }));
    const sourceTotal = sourceList.reduce((acc, s) => acc + s.tokens, 0);
    const bySource = sourceList
      .map((s) => ({ ...s, pct: pctOf(s.tokens, sourceTotal) }))
      .sort((a, b) => b.tokens - a.tokens);

    jsonResponse(res, 200, {
      success: true,
      data: {
        overview: {
          today,
          week,
          month,
          cost30d,
          daily,
        },
        byEmployee,
        byAgent,
        bySource,
        meta: {
          totalTokens30d: month,
          totalCost30d: cost30d,
          employeeCount: byEmployee.length,
          agentCount: byAgent.length,
          sourceCount: bySource.length,
        },
      },
    });
    return true;
  } catch (e) {
    jsonResponse(res, 500, {
      success: false,
      error: { code: 'internal_error', message: String(e) },
    });
    return true;
  }
}
