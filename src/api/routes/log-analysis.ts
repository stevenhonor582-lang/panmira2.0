/**
 * Log Analysis · 人类可读映射 + AI 分析(规则引擎)
 *
 * 设计原则:
 *  - 不调真 LLM,纯规则引擎(避免成本 + 延迟)
 *  - activity_events 是主数据源(7827 条),audit_logs 是辅助(3 条)
 *  - 派生字段:title / description / levelLabel / sourceLabel / actionLabel / impact
 *
 * 调用方: r9-mock-endpoints-routes.ts 的 adminLogs / adminLogsAnalyze
 */

// ────────────────────────────────────────────────────────────────
// 中文映射表
// ────────────────────────────────────────────────────────────────

export const LEVEL_LABEL: Record<string, string> = {
  error: '错误',
  warn: '警告',
  info: '信息',
  debug: '调试',
};

export const SOURCE_LABEL: Record<string, string> = {
  system: '系统',
  agent: '数字员工',
  user: '正式员工',
  pipeline: '流水线',
  channel: '接入渠道',
  oauth: 'OAuth',
  kb: '知识库',
  task: '任务',
  memory: '记忆',
  registry: '注册表',
  activity: '活动',
  scheduled_jobs: '定时任务',
  agent_pipelines: '智能流水线',
};

export const ACTION_LABEL: Record<string, string> = {
  login: '登录',
  logout: '登出',
  create: '创建',
  update: '更新',
  delete: '删除',
  execute: '执行',
  invoke: '调用',
  error: '出错',
  task_execute: '任务执行',
  agent_invoke: '数字员工调用',
  kb_query: '知识库查询',
  memory_extract: '记忆抽取',
  task_started: '任务启动',
  task_completed: '任务完成',
  task_failed: '任务失败',
};

// 已知错误模式(从历史数据抽样归纳)
const ERROR_PATTERNS: Array<{ match: RegExp; pattern: string; severity: 'high' | 'medium' | 'low'; fixHint: string }> = [
  { match: /SDK stream failed/i, pattern: 'SDK 流中断', severity: 'high', fixHint: '检查 Claude Code native binary 路径与进程生命周期' },
  { match: /Claude session ended unexpectedly/i, pattern: 'Claude 会话意外结束', severity: 'high', fixHint: '检查 agent 进程稳定性,可能需要重启策略' },
  { match: /Claude Code process exited with code 1/i, pattern: 'Claude Code 进程崩溃', severity: 'high', fixHint: '查看完整 stderr,通常是参数或环境问题' },
  { match: /Claude Code process exited with code 143/i, pattern: 'Claude Code 进程被终止', severity: 'medium', fixHint: 'SIGTERM,通常是超时或手动停止' },
  { match: /Task was stopped/i, pattern: '任务被停止', severity: 'medium', fixHint: '人工或超时停止,确认是否符合预期' },
  { match: /API Error:\s*529/i, pattern: '模型过载 (529)', severity: 'high', fixHint: '该模型当前访问量过大,考虑切备用模型或稍后重试' },
  { match: /API Error:\s*500/i, pattern: '上游服务错误 (500)', severity: 'high', fixHint: '上游模型服务器内部错误,需联系供应商或重试' },
  { match: /API Error:\s*400/i, pattern: '请求参数错误 (400)', severity: 'medium', fixHint: '检查 prompt/tool schema 是否合规' },
  { match: /流意外中断/i, pattern: '响应流中断', severity: 'medium', fixHint: '网络抖动或上游断流,检查任务产出完整性' },
  { match: /Cannot write to terminated process/i, pattern: '进程已终止仍写入', severity: 'high', fixHint: '进程被外部杀掉,排查 OOM 或手动 kill' },
];

// ────────────────────────────────────────────────────────────────
// 公共类型
// ────────────────────────────────────────────────────────────────

export interface HumanizedLog {
  id: string;
  ts: string;                     // ISO 时间(原始)
  tsLabel: string;                // 人类可读时间 yyyy-mm-dd HH:MM:SS
  level: 'error' | 'warn' | 'info' | 'debug';
  levelLabel: string;
  source: string;                 // 原始来源 key
  sourceLabel: string;
  title: string;                  // 人类可读标题
  description: string;            // 人类可读描述
  actor: string;                  // 谁干的
  action: string;
  actionLabel: string;
  result: 'success' | 'failed' | 'info' | 'unknown';
  impact: 'high' | 'medium' | 'low';
  pattern?: string;               // 命中的错误模式(供前端聚合用)
  fixHint?: string;               // 修复建议(若有)
  entityId?: string;              // 关联实体 id(agent_id / pipeline_id)
  entityType?: 'agent' | 'pipeline' | 'user' | 'system';
  entityName?: string;
  raw: Record<string, unknown>;   // 原始数据(折叠)
}

// ────────────────────────────────────────────────────────────────
// humanizeLog — 单条日志转人类可读
// ────────────────────────────────────────────────────────────────

const MODEL_NAME_FALLBACK = '未知模型';

function labelOf(map: Record<string, string>, key: string | undefined | null, fallback: string): string {
  if (!key) return fallback;
  return map[key] ?? fallback;
}

function impactFromDuration(durationMs: number | null | undefined): 'high' | 'medium' | 'low' {
  if (!durationMs || durationMs <= 0) return 'low';
  if (durationMs >= 300_000) return 'high';   // ≥ 5 分钟
  if (durationMs >= 60_000) return 'medium';  // ≥ 1 分钟
  return 'low';
}

function matchErrorPattern(errorMessage: string | null | undefined): { pattern: string; severity: 'high' | 'medium' | 'low'; fixHint: string } | null {
  if (!errorMessage) return null;
  for (const p of ERROR_PATTERNS) {
    if (p.match.test(errorMessage)) return p;
  }
  return null;
}

function truncate(s: string | null | undefined, n: number): string {
  if (!s) return '';
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function pad2(n: number): string { return n < 10 ? '0' + n : '' + n; }

// 把任意 timestamp 输入(number / bigint / 数字字符串 / ISO 字符串)统一转成毫秒 number
function toMs(ts: number | bigint | string | null | undefined): number | null {
  if (ts === null || ts === undefined) return null;
  if (typeof ts === 'number') return ts;
  if (typeof ts === 'bigint') return Number(ts);
  const s = String(ts).trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) return Number(s);
  const d = new Date(s);
  const t = d.getTime();
  return Number.isFinite(t) ? t : null;
}

function tsLabelFromMs(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function tsLabelFromIso(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return tsLabelFromMs(d.getTime());
}

/**
 * 把 activity_events 行转 HumanizedLog
 */
export function humanizeActivityEvent(row: {
  id: string | { toString(): string };
  type?: string | null;
  bot_name?: string | null;
  bot_id?: string | null;
  user_id?: string | null;
  prompt?: string | null;
  response_preview?: string | null;
  error_message?: string | null;
  duration_ms?: number | null;
  cost_usd?: number | null;
  timestamp?: number | string | null;
  model?: string | null;
  chat_id?: string | null;
}): HumanizedLog {
  const isFail = (row.type === 'task_failed') || (!!row.error_message && row.error_message.length > 0);
  const level: HumanizedLog['level'] = isFail ? 'error' : 'info';
  const result: HumanizedLog['result'] = isFail ? 'failed' : (row.type === 'task_completed' ? 'success' : 'info');
  const pat = matchErrorPattern(row.error_message);
  const impact: HumanizedLog['impact'] = isFail
    ? (pat?.severity ?? impactFromDuration(row.duration_ms))
    : impactFromDuration(row.duration_ms);

  const botName = row.bot_name ?? '未命名员工';
  // activity_events.timestamp 是 bigint,drizzle 返回字符串,统一用 toMs
  const ms = toMs(row.timestamp as number | bigint | string | null | undefined);
  const ts = ms !== null ? tsLabelFromMs(ms) : tsLabelFromMs(Date.now());
  const tsIso = ms !== null ? new Date(ms).toISOString() : new Date().toISOString();

  const actionKey = row.type ?? 'execute';
  const actionLabel = labelOf(ACTION_LABEL, actionKey, actionKey);

  // 标题派生
  let title: string;
  if (isFail) {
    if (pat) {
      title = `${botName} · ${pat.pattern}`;
    } else {
      title = `${botName} 任务失败`;
    }
  } else if (row.type === 'task_completed') {
    title = `${botName} 任务完成`;
  } else if (row.type === 'task_started') {
    title = `${botName} 任务启动`;
  } else {
    title = `${botName} 活动记录`;
  }

  // 描述派生
  const parts: string[] = [];
  parts.push(title);
  if (row.duration_ms && row.duration_ms > 0) {
    parts.push(`耗时 ${(row.duration_ms / 1000).toFixed(1)}s`);
  }
  if (row.model) parts.push(`模型 ${row.model}`);
  if (row.prompt) parts.push(`指令: ${truncate(row.prompt, 60)}`);
  if (row.error_message) parts.push(`错误: ${truncate(row.error_message, 120)}`);
  const description = parts.join(' · ');

  // entityId: 优先 bot_id, 否则用 name slug,保证受影响实体能聚合
  const entityId = (row.bot_id as string | null | undefined)
    ?? (botName && botName !== '未命名员工' ? `bot:${botName}` : undefined);
  const actor = row.bot_id ? `${botName} (${String(row.bot_id).slice(0, 8)})` : botName;

  return {
    id: String(row.id),
    ts: tsIso,
    tsLabel: ts,
    level,
    levelLabel: labelOf(LEVEL_LABEL, level, level),
    source: 'agent',
    sourceLabel: labelOf(SOURCE_LABEL, 'agent', 'agent'),
    title,
    description,
    actor,
    action: actionKey,
    actionLabel,
    result,
    impact,
    pattern: pat?.pattern,
    fixHint: pat?.fixHint,
    entityId,
    entityType: entityId ? 'agent' : undefined,
    entityName: botName,
    raw: row as Record<string, unknown>,
  };
}

/**
 * 把 audit_logs 行转 HumanizedLog
 */
export function humanizeAuditLog(row: {
  id: string | { toString(): string };
  action?: string | null;
  resource_type?: string | null;
  resource_id?: string | null;
  user_id?: string | null;
  agent_id?: string | null;
  details?: Record<string, unknown> | null;
  created_at?: string | null;
}): HumanizedLog {
  const source = row.resource_type ?? 'system';
  const action = row.action ?? 'execute';
  const details = row.details ?? {};
  const isFail = /fail|error|degraded/i.test(action) || (typeof details.status === 'string' && /degraded|fail/i.test(details.status));
  const level: HumanizedLog['level'] = isFail ? 'warn' : 'info';

  const tsIso = row.created_at ?? new Date().toISOString();
  const actor = row.agent_id ? `agent:${String(row.agent_id).slice(0, 8)}`
    : row.user_id ? `user:${String(row.user_id).slice(0, 8)}`
    : '系统';

  // 中文标题: action 已是英文短语(q1_data_audit_completed) → 不强行翻译,直接展示
  const title = action.replace(/_/g, ' ');

  const description = `${labelOf(SOURCE_LABEL, source, source)} · ${action}${row.resource_id ? ' · ' + row.resource_id : ''}`;

  return {
    id: String(row.id),
    ts: tsIso,
    tsLabel: tsLabelFromIso(tsIso),
    level,
    levelLabel: labelOf(LEVEL_LABEL, level, level),
    source,
    sourceLabel: labelOf(SOURCE_LABEL, source, source),
    title,
    description,
    actor,
    action,
    actionLabel: labelOf(ACTION_LABEL, action, action),
    result: isFail ? 'failed' : 'info',
    impact: isFail ? 'medium' : 'low',
    entityId: row.agent_id ?? row.resource_id ?? undefined,
    entityType: row.agent_id ? 'agent' : (source === 'agent_pipelines' ? 'pipeline' : 'system'),
    entityName: typeof details.name === 'string' ? details.name : undefined,
    raw: row as Record<string, unknown>,
  };
}

// ────────────────────────────────────────────────────────────────
// AI 分析(规则引擎)
// ────────────────────────────────────────────────────────────────

export interface AnalysisTrendDay {
  day: string;            // YYYY-MM-DD
  errors: number;
  warns: number;
  info: number;
  total: number;
}

export interface AnalysisBySourceCell {
  source: string;
  sourceLabel: string;
  error: number;
  warn: number;
  info: number;
  total: number;
}

export interface AnalysisTopIssue {
  pattern: string;
  count: number;
  severity: 'high' | 'medium' | 'low';
  sample: string;
  sampleTs?: string;
  fixHint: string;
  source: string;
}

export interface AnalysisAffectedEntity {
  type: 'agent' | 'pipeline' | 'user' | 'system';
  id: string;
  name: string;
  issues: number;
  lastIssue: string;
  lastIssueTs?: string;
}

export interface AnalysisAction {
  priority: 'high' | 'medium' | 'low';
  action: string;
  link: string;
  reason: string;
}

export interface LogAnalysis {
  windowHours: number;
  generatedAt: string;
  totals: { errors: number; warns: number; info: number; all: number };
  bySource: AnalysisBySourceCell[];
  topIssues: AnalysisTopIssue[];
  trend: AnalysisTrendDay[];
  affectedEntities: AnalysisAffectedEntity[];
  actions: AnalysisAction[];
  summary: string;
}

function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * 对 humanized 日志数组做聚合分析
 *
 * 输入已经过 humanize,所以这里只做纯聚合,不再访问原始字段。
 */
export function analyzeLogs(logs: HumanizedLog[], windowHours: number): LogAnalysis {
  const totals = { errors: 0, warns: 0, info: 0, all: logs.length };
  const bySrc = new Map<string, AnalysisBySourceCell>();
  const issueAgg = new Map<string, { count: number; severity: 'high' | 'medium' | 'low'; sample: string; sampleTs?: string; fixHint: string; source: string }>();
  const trendMap = new Map<string, AnalysisTrendDay>();
  const affected = new Map<string, AnalysisAffectedEntity>();

  for (const l of logs) {
    if (l.level === 'error') totals.errors++;
    else if (l.level === 'warn') totals.warns++;
    else totals.info++;

    // bySource
    const srcCell = bySrc.get(l.source) ?? {
      source: l.source,
      sourceLabel: l.sourceLabel,
      error: 0, warn: 0, info: 0, total: 0,
    };
    if (l.level === 'error') srcCell.error++;
    else if (l.level === 'warn') srcCell.warn++;
    else srcCell.info++;
    srcCell.total++;
    bySrc.set(l.source, srcCell);

    // topIssues (只统计 error 级别)
    if (l.level === 'error') {
      const key = l.pattern ?? '其他错误';
      const agg = issueAgg.get(key) ?? {
        count: 0,
        severity: l.impact,
        sample: l.description,
        sampleTs: l.tsLabel,
        fixHint: l.fixHint ?? '查看详情确认根因',
        source: l.source,
      };
      agg.count++;
      // 用最近的样本
      agg.sample = l.description;
      agg.sampleTs = l.tsLabel;
      if (l.impact === 'high' && agg.severity !== 'high') agg.severity = 'high';
      if (l.fixHint && !agg.fixHint) agg.fixHint = l.fixHint;
      issueAgg.set(key, agg);
    }

    // trend (按天)
    const dayK = dayKey(new Date(l.ts).getTime());
    const trendDay = trendMap.get(dayK) ?? { day: dayK, errors: 0, warns: 0, info: 0, total: 0 };
    if (l.level === 'error') trendDay.errors++;
    else if (l.level === 'warn') trendDay.warns++;
    else trendDay.info++;
    trendDay.total++;
    trendMap.set(dayK, trendDay);

    // affectedEntities (只统计 error)
    if (l.level === 'error' && l.entityId && l.entityType) {
      const ekey = `${l.entityType}:${l.entityId}`;
      const ent = affected.get(ekey) ?? {
        type: l.entityType,
        id: l.entityId,
        name: l.entityName ?? l.entityId,
        issues: 0,
        lastIssue: l.title,
        lastIssueTs: l.tsLabel,
      };
      ent.issues++;
      ent.lastIssue = l.title;
      ent.lastIssueTs = l.tsLabel;
      affected.set(ekey, ent);
    }
  }

  const bySource = Array.from(bySrc.values()).sort((a, b) => b.error - a.error || b.total - a.total);
  const topIssues = Array.from(issueAgg.entries())
    .map(([pattern, v]) => ({ pattern, ...v }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  const trend = Array.from(trendMap.values()).sort((a, b) => a.day.localeCompare(b.day));
  const affectedEntities = Array.from(affected.values()).sort((a, b) => b.issues - a.issues).slice(0, 10);
  const actions = buildActions(topIssues, affectedEntities);

  const summary = buildSummary(totals, bySource, topIssues, affectedEntities, windowHours);

  return {
    windowHours,
    generatedAt: new Date().toISOString(),
    totals,
    bySource,
    topIssues,
    trend,
    affectedEntities,
    actions,
    summary,
  };
}

function buildSummary(
  totals: { errors: number; warns: number; info: number; all: number },
  bySource: AnalysisBySourceCell[],
  topIssues: AnalysisTopIssue[],
  affectedEntities: AnalysisAffectedEntity[],
  windowHours: number,
): string {
  if (totals.all === 0) {
    return `最近 ${windowHours}h 暂无日志记录,系统可能处于空闲或日志未采集。`;
  }
  const parts: string[] = [];
  parts.push(`最近 ${windowHours}h 共 ${totals.all} 条日志`);
  if (totals.errors > 0 || totals.warns > 0) {
    parts.push(`其中 ${totals.errors} 个错误、${totals.warns} 个警告`);
  } else {
    parts.push('未发现异常级别事件,运行平稳');
  }
  const topSrc = bySource.find((s) => s.error > 0);
  if (topSrc) {
    parts.push(`错误主要集中在【${topSrc.sourceLabel}】(${topSrc.error} 次)`);
  }
  if (topIssues.length > 0) {
    parts.push(`高频问题【${topIssues[0].pattern}】(${topIssues[0].count} 次)`);
  }
  if (affectedEntities.length > 0) {
    parts.push(`受影响最大的是【${affectedEntities[0].name}】(${affectedEntities[0].issues} 次)`);
  }
  return parts.join(' · ') + '。';
}

function buildActions(topIssues: AnalysisTopIssue[], affected: AnalysisAffectedEntity[]): AnalysisAction[] {
  const actions: AnalysisAction[] = [];
  const seen = new Set<string>();

  // 1. 受影响实体的修复建议(高优先级)
  for (const ent of affected.slice(0, 3)) {
    if (ent.issues < 2) continue;
    // entityId 可能是真实 uuid,也可能是 bot:<name> slug
    const link = ent.type === 'agent'
      ? (ent.id.startsWith('bot:') ? `/employees?name=${encodeURIComponent(ent.name)}` : `/employees/${ent.id}`)
      : ent.type === 'pipeline' ? `/pipelines/${ent.id}` : '/overview/logs';
    const key = `ent:${ent.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    actions.push({
      priority: ent.issues >= 5 ? 'high' : 'medium',
      action: `检查 ${ent.name} 的最近失败 (${ent.issues} 次,最近 ${ent.lastIssue})`,
      link,
      reason: `最近窗口内该${ent.type === 'agent' ? '员工' : ent.type === 'pipeline' ? '流水线' : '实体'}累积失败次数较高`,
    });
  }

  // 2. Top 问题修复建议
  for (const iss of topIssues.slice(0, 3)) {
    const key = `iss:${iss.pattern}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // 根据模式决定跳转目标
    let link = '/overview/diagnosis';
    if (/529|模型过载/.test(iss.pattern)) link = '/foundation/models';
    else if (/SDK|Claude/.test(iss.pattern)) link = '/employees';
    actions.push({
      priority: iss.severity === 'high' ? 'high' : 'medium',
      action: iss.fixHint,
      link,
      reason: `该模式最近出现 ${iss.count} 次`,
    });
  }

  // 排序: high 优先 → medium → low;并按 priority+count
  const order = { high: 0, medium: 1, low: 2 };
  return actions.sort((a, b) => order[a.priority] - order[b.priority]).slice(0, 6);
}
