"use client";

// /overview/logs · R14-F 面板集合(AI 分析 + 趋势图 + 热力图 + Header)
//
// 这里集中放与 LogAnalysis / HumanizedLog 视图模型强相关的展示组件,
// 保持 page.tsx 只关注 main page + ListSection + Drawer。
//
// 同时把共享 types 集中 export,page.tsx 反向 import。

import * as React from "react";
import {
  ScrollText,
  AlertTriangle,
  Inbox,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Flame,
  ArrowRight,
  Lightbulb,
  Activity,
  Bot,
  Server,
  RefreshCw,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  ResponsiveContainer,
} from "recharts";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────
// 共享 types (与后端 HumanizedLog / LogAnalysis 对齐)
// ─────────────────────────────────────────────────────────────

export type Level = "error" | "warn" | "info" | "debug";

export interface HumanizedLog {
  id: string;
  ts: string;
  tsLabel: string;
  level: Level;
  levelLabel: string;
  source: string;
  sourceLabel: string;
  title: string;
  description: string;
  actor: string;
  action: string;
  actionLabel: string;
  result: "success" | "failed" | "info" | "unknown";
  impact: "high" | "medium" | "low";
  pattern?: string;
  fixHint?: string;
  entityId?: string;
  entityType?: "agent" | "pipeline" | "user" | "system";
  entityName?: string;
  raw?: Record<string, unknown>;
}

export interface AnalysisTopIssue {
  pattern: string;
  count: number;
  severity: "high" | "medium" | "low";
  sample: string;
  sampleTs?: string;
  fixHint: string;
  source: string;
}

export interface AnalysisAffectedEntity {
  type: "agent" | "pipeline" | "user" | "system";
  id: string;
  name: string;
  issues: number;
  lastIssue: string;
  lastIssueTs?: string;
}

export interface AnalysisTrendDay {
  day: string;
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

export interface AnalysisAction {
  priority: "high" | "medium" | "low";
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

// ─────────────────────────────────────────────────────────────
// 常量 / 共享 helpers
// ─────────────────────────────────────────────────────────────

export const SOURCE_LABEL_FALLBACK: Record<string, string> = {
  agent: "数字员工",
  system: "系统",
  pipeline: "流水线",
  scheduled_jobs: "定时任务",
  agent_pipelines: "智能流水线",
  user: "正式员工",
  channel: "接入渠道",
  oauth: "OAuth",
  kb: "知识库",
  task: "任务",
  memory: "记忆",
};

export function sourceLabelOf(s: string): string {
  return SOURCE_LABEL_FALLBACK[s] ?? s;
}

export function levelTone(level: Level): string {
  if (level === "error") return "bg-rose-500/15 text-rose-700 dark:text-rose-300";
  if (level === "warn") return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
  if (level === "info") return "bg-sky-500/15 text-sky-700 dark:text-sky-300";
  return "bg-stone-500/15 text-stone-700 dark:text-stone-300";
}

export function impactTone(impact: "high" | "medium" | "low"): string {
  if (impact === "high") return "bg-rose-500/15 text-rose-700 dark:text-rose-300 ring-rose-500/30";
  if (impact === "medium") return "bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-amber-500/30";
  return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-500/20";
}

export function impactLabel(impact: "high" | "medium" | "low"): string {
  if (impact === "high") return "高";
  if (impact === "medium") return "中";
  return "低";
}

// ─────────────────────────────────────────────────────────────
// PanelShell / SkeletonRows / EmptyHint — 共享 UI 原语
// ─────────────────────────────────────────────────────────────

export function PanelShell({
  title,
  icon,
  subtitle,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl ring-1 ring-border bg-card p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {icon && <span className="text-foreground/70">{icon}</span>}
          <h2 className="text-[14px] font-semibold tracking-tight">{title}</h2>
        </div>
        {subtitle && <span className="font-mono text-[10.5px] text-foreground/45">{subtitle}</span>}
      </div>
      {children}
    </section>
  );
}

export function SkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-4 rounded bg-muted/60 animate-pulse" style={{ width: `${90 - i * 10}%` }} />
      ))}
    </div>
  );
}

export function EmptyHint({ text }: { text: string }) {
  return (
    <div className="py-6 text-center">
      <Inbox className="mx-auto size-5 text-foreground/35" />
      <p className="mt-2 text-[12px] text-foreground/50">{text}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Header
// ─────────────────────────────────────────────────────────────

export function Header({ onRefresh, loading }: { onRefresh: () => void; loading: boolean }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-6 border-b border-border pb-7">
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[10.5px] font-mono uppercase tracking-[0.22em] text-foreground/45">
          <ScrollText className="size-3.5" />
          关键日志 · R14-F
        </div>
        <h1 className="text-4xl font-semibold tracking-tighter leading-[1.05] max-w-[18ch]">
          系统日志 · AI 分析
        </h1>
        <p className="max-w-[60ch] text-[14px] leading-relaxed text-foreground/65">
          每条日志都有人类可读的标题与描述,AI 自动分析最近 7 天的异常,
          告诉你「哪里出问题、为什么、怎么修」。
        </p>
      </div>
      <button
        type="button"
        onClick={onRefresh}
        disabled={loading}
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-[12px] font-medium transition",
          "hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed",
        )}
      >
        <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
        刷新
      </button>
    </header>
  );
}

// ─────────────────────────────────────────────────────────────
// 1. AI 分析面板(最显眼)
// ─────────────────────────────────────────────────────────────

export function AIAnalysisPanel({ analysis, loading }: { analysis: LogAnalysis | null; loading: boolean }) {
  if (loading && !analysis) {
    return (
      <PanelShell title="AI 日志分析" icon={<Sparkles className="size-4" />}>
        <SkeletonRows rows={4} />
      </PanelShell>
    );
  }
  if (!analysis) {
    return (
      <PanelShell title="AI 日志分析" icon={<Sparkles className="size-4" />}>
        <p className="text-[13px] text-foreground/55">分析数据暂不可用。</p>
      </PanelShell>
    );
  }

  const totalAbnormal = analysis.totals.errors + analysis.totals.warns;
  const isHealthy = totalAbnormal === 0;
  const headineTone = isHealthy
    ? "from-emerald-500/10 via-emerald-500/5 to-transparent"
    : "from-rose-500/10 via-rose-500/5 to-transparent";

  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-3xl ring-1 ring-border bg-gradient-to-br p-7",
        headineTone,
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-2xl",
          isHealthy ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300" : "bg-rose-500/15 text-rose-600 dark:text-rose-300",
        )}>
          {isHealthy ? <Activity className="size-5" /> : <AlertTriangle className="size-5" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-[10.5px] font-mono uppercase tracking-[0.22em] text-foreground/55">
            <Sparkles className="size-3" />
            AI 日志分析 · 最近 {analysis.windowHours}h
          </div>
          <p className="mt-2 text-[20px] font-semibold tracking-tight leading-snug">
            {analysis.summary}
          </p>
        </div>
      </div>

      {/* 四个统计块 */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="错误" value={analysis.totals.errors} tone="rose" />
        <StatTile label="警告" value={analysis.totals.warns} tone="amber" />
        <StatTile label="正常事件" value={analysis.totals.info} tone="sky" />
        <StatTile label="受影响实体" value={analysis.affectedEntities.length} tone="violet" />
      </div>

      {/* 高频问题 chips */}
      {analysis.topIssues.length > 0 && (
        <div className="mt-6">
          <div className="text-[10.5px] font-mono uppercase tracking-[0.22em] text-foreground/55 mb-3">
            高频问题 Top {Math.min(analysis.topIssues.length, 5)}
          </div>
          <div className="flex flex-wrap gap-2">
            {analysis.topIssues.slice(0, 5).map((iss) => (
              <span
                key={iss.pattern}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] ring-1",
                  iss.severity === "high"
                    ? "bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-rose-500/30"
                    : iss.severity === "medium"
                    ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-amber-500/30"
                    : "bg-stone-500/10 text-stone-700 dark:text-stone-300 ring-stone-500/30",
                )}
              >
                <Flame className="size-3" />
                {iss.pattern}
                <span className="font-mono text-[10px] opacity-70">×{iss.count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 建议行动 */}
      {analysis.actions.length > 0 && (
        <div className="mt-6">
          <div className="text-[10.5px] font-mono uppercase tracking-[0.22em] text-foreground/55 mb-3 flex items-center gap-1.5">
            <Lightbulb className="size-3" />
            建议行动 · 按优先级排序
          </div>
          <div className="space-y-2">
            {analysis.actions.slice(0, 4).map((act, i) => (
              <ActionRow key={`${act.action}-${i}`} action={act} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function StatTile({ label, value, tone }: { label: string; value: number; tone: "rose" | "amber" | "sky" | "violet" }) {
  const cls = {
    rose: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
    amber: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    sky: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
    violet: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  }[tone];
  return (
    <div className={cn("rounded-2xl px-4 py-3", cls)}>
      <div className="text-[10.5px] font-mono uppercase tracking-[0.18em] opacity-75">{label}</div>
      <div className="mt-1 font-mono text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function ActionRow({ action }: { action: AnalysisAction }) {
  const priorityTone = action.priority === "high"
    ? "bg-rose-500/15 text-rose-700 dark:text-rose-300"
    : action.priority === "medium"
    ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
    : "bg-stone-500/15 text-stone-700 dark:text-stone-300";
  const priorityLabel = action.priority === "high" ? "高" : action.priority === "medium" ? "中" : "低";
  return (
    <a
      href={action.link}
      className="group flex items-center gap-3 rounded-2xl border border-border bg-card/60 px-4 py-3 transition hover:bg-accent hover:border-foreground/20"
    >
      <span className={cn("inline-flex shrink-0 items-center justify-center rounded-full px-2 py-0.5 font-mono text-[10px] font-medium", priorityTone)}>
        {priorityLabel}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-foreground/90 truncate">{action.action}</div>
        <div className="text-[11px] text-foreground/55 truncate">{action.reason}</div>
      </div>
      <ArrowRight className="size-4 shrink-0 text-foreground/40 transition group-hover:translate-x-0.5 group-hover:text-foreground/70" />
    </a>
  );
}

// ─────────────────────────────────────────────────────────────
// 2. 7 天错误趋势
// ─────────────────────────────────────────────────────────────

export function TrendCard({ analysis, loading }: { analysis: LogAnalysis | null; loading: boolean }) {
  const data = React.useMemo(() => {
    if (!analysis) return [];
    return analysis.trend.map((d) => ({
      day: d.day.slice(5), // MM-DD
      errors: d.errors,
      warns: d.warns,
      total: d.total,
    }));
  }, [analysis]);

  const peakErrors = data.reduce((m, d) => Math.max(m, d.errors), 0);
  const totalErr = data.reduce((s, d) => s + d.errors, 0);
  const trendUp = data.length >= 2 && data[data.length - 1].errors > data[0].errors;

  return (
    <PanelShell
      title="错误趋势"
      icon={trendUp ? <TrendingUp className="size-4 text-rose-500" /> : <TrendingDown className="size-4 text-emerald-500" />}
      subtitle={data.length > 0 ? `${data[0].day} → ${data[data.length - 1].day} · 共 ${totalErr} 个错误` : undefined}
    >
      {loading && !analysis ? (
        <SkeletonRows rows={3} />
      ) : data.length === 0 ? (
        <EmptyHint text="暂无趋势数据" />
      ) : (
        <>
          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.4)" vertical={false} />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  width={32}
                />
                <RTooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: "hsl(var(--foreground))" }}
                />
                <Line
                  type="monotone"
                  dataKey="errors"
                  stroke="#f43f5e"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#f43f5e" }}
                  activeDot={{ r: 5 }}
                  name="错误"
                />
                <Line
                  type="monotone"
                  dataKey="warns"
                  stroke="#f59e0b"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  dot={false}
                  name="警告"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          {peakErrors > 0 && (
            <div className="mt-3 text-[11px] font-mono text-foreground/55">
              峰值 {peakErrors} 错误/天
            </div>
          )}
        </>
      )}
    </PanelShell>
  );
}

// ─────────────────────────────────────────────────────────────
// 3. 问题热力图(来源 × 级别)
// ─────────────────────────────────────────────────────────────

export function HeatmapCard({ analysis, loading }: { analysis: LogAnalysis | null; loading: boolean }) {
  if (loading && !analysis) {
    return (
      <PanelShell title="问题热力图" icon={<Flame className="size-4" />}>
        <SkeletonRows rows={3} />
      </PanelShell>
    );
  }
  if (!analysis || analysis.bySource.length === 0) {
    return (
      <PanelShell title="问题热力图" icon={<Flame className="size-4" />}>
        <EmptyHint text="暂无热力图数据" />
      </PanelShell>
    );
  }

  const maxErr = Math.max(1, ...analysis.bySource.map((s) => s.error));

  return (
    <PanelShell
      title="问题热力图"
      icon={<Flame className="size-4" />}
      subtitle="按来源 × 级别聚合 · 颜色越深错误越多"
    >
      <div className="overflow-hidden rounded-2xl ring-1 ring-border">
        <table className="w-full text-[13px]">
          <thead className="bg-muted/40 text-left text-[10.5px] font-mono uppercase tracking-[0.18em] text-foreground/55">
            <tr>
              <th className="px-3 py-2.5">来源</th>
              <th className="px-3 py-2.5 text-right">错误</th>
              <th className="px-3 py-2.5 text-right">警告</th>
              <th className="px-3 py-2.5 text-right">信息</th>
              <th className="px-3 py-2.5 text-right">合计</th>
            </tr>
          </thead>
          <tbody>
            {analysis.bySource.map((cell) => {
              const intensity = cell.error / maxErr;
              const bg = cell.error > 0
                ? `rgba(244, 63, 94, ${0.08 + intensity * 0.32})`
                : "transparent";
              return (
                <tr key={cell.source} className="border-t border-border">
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-1.5">
                      <SourceIcon source={cell.source} />
                      {cell.sourceLabel}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums" style={{ background: bg }}>
                    {cell.error > 0 ? <span className="font-semibold text-rose-700 dark:text-rose-300">{cell.error}</span> : <span className="text-foreground/30">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                    {cell.warn > 0 ? <span className="text-amber-700 dark:text-amber-300">{cell.warn}</span> : <span className="text-foreground/30">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                    {cell.info > 0 ? cell.info : <span className="text-foreground/30">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-foreground/70">{cell.total}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </PanelShell>
  );
}

function SourceIcon({ source }: { source: string }) {
  const cls = "size-3.5 text-foreground/50";
  if (source === "agent") return <Bot className={cls} />;
  if (source === "system" || source === "scheduled_jobs") return <Server className={cls} />;
  if (source === "agent_pipelines" || source === "pipeline") return <Activity className={cls} />;
  return <ScrollText className={cls} />;
}
