"use client";

// /overview/logs · R14-F 人类可读 + AI 分析
//
// 用户原话驱动:
//  1. "底下很多记录,但我不会查看,也不知道意义"   → 每条日志人类可读标题/描述
//  2. "以 bot 方式做的日志记录,我查看不了"          → 中文化 + 派生字段
//  3. "正常应该能查看这些日志,或怎么从里面发现问题" → AI 分析面板 + 建议行动
//  4. "这些日志可以给我用 AI 分析,告诉我哪些有问题" → 规则引擎 analyze 端点
//  5. "尤其是最近失调问题"                          → 7 天错误趋势 + 高频问题
//
// 后端契约:
//   GET /api/v2/admin/logs?level=&source=&hours=&q=&limit=
//     → { logs: HumanizedLog[], counts, sources, total, windowHours }
//   GET /api/v2/admin/logs/analyze?hours=
//     → { analysis: LogAnalysis }

import * as React from "react";
import {
  ScrollText,
  Search,
  Filter,
  AlertTriangle,
  XCircle,
  Info,
  Inbox,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Flame,
  ArrowRight,
  X,
  ChevronRight,
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
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────
// Types (与后端 HumanizedLog / LogAnalysis 对齐)
// ─────────────────────────────────────────────────────────────

type Level = "error" | "warn" | "info" | "debug";

interface HumanizedLog {
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

interface LogsResponse {
  success: boolean;
  total: number;
  windowHours: number;
  counts: {
    byLevel: Record<string, number>;
    bySource: Record<string, number>;
  };
  sources: string[];
  logs: HumanizedLog[];
}

interface AnalysisTopIssue {
  pattern: string;
  count: number;
  severity: "high" | "medium" | "low";
  sample: string;
  sampleTs?: string;
  fixHint: string;
  source: string;
}

interface AnalysisAffectedEntity {
  type: "agent" | "pipeline" | "user" | "system";
  id: string;
  name: string;
  issues: number;
  lastIssue: string;
  lastIssueTs?: string;
}

interface AnalysisTrendDay {
  day: string;
  errors: number;
  warns: number;
  info: number;
  total: number;
}

interface AnalysisBySourceCell {
  source: string;
  sourceLabel: string;
  error: number;
  warn: number;
  info: number;
  total: number;
}

interface AnalysisAction {
  priority: "high" | "medium" | "low";
  action: string;
  link: string;
  reason: string;
}

interface LogAnalysis {
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
// 常量 / 样式
// ─────────────────────────────────────────────────────────────

const SOURCE_LABEL_FALLBACK: Record<string, string> = {
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

function levelTone(level: Level): string {
  if (level === "error") return "bg-rose-500/15 text-rose-700 dark:text-rose-300";
  if (level === "warn") return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
  if (level === "info") return "bg-sky-500/15 text-sky-700 dark:text-sky-300";
  return "bg-stone-500/15 text-stone-700 dark:text-stone-300";
}

function impactTone(impact: "high" | "medium" | "low"): string {
  if (impact === "high") return "bg-rose-500/15 text-rose-700 dark:text-rose-300 ring-rose-500/30";
  if (impact === "medium") return "bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-amber-500/30";
  return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-500/20";
}

function impactLabel(impact: "high" | "medium" | "low"): string {
  if (impact === "high") return "高";
  if (impact === "medium") return "中";
  return "低";
}

function sourceLabelOf(s: string): string {
  return SOURCE_LABEL_FALLBACK[s] ?? s;
}

// ─────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────

const HOUR_OPTIONS = [
  { value: 1, label: "最近 1h" },
  { value: 24, label: "最近 24h" },
  { value: 168, label: "最近 7 天" },
  { value: 720, label: "最近 30 天" },
];

export default function LogsPage() {
  // 数据状态
  const [logs, setLogs] = React.useState<HumanizedLog[]>([]);
  const [analysis, setAnalysis] = React.useState<LogAnalysis | null>(null);
  const [counts, setCounts] = React.useState<{ byLevel: Record<string, number>; bySource: Record<string, number> }>({
    byLevel: {},
    bySource: {},
  });
  const [sources, setSources] = React.useState<string[]>([]);

  // 过滤
  const [levelFilter, setLevelFilter] = React.useState<"all" | Level>("all");
  const [sourceFilter, setSourceFilter] = React.useState<string>("all");
  const [hours, setHours] = React.useState<number>(168);
  const [searchInput, setSearchInput] = React.useState("");
  const [search, setSearch] = React.useState("");

  // UI
  const [loading, setLoading] = React.useState(true);
  const [analysisLoading, setAnalysisLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<HumanizedLog | null>(null);

  // 加载列表
  const loadLogs = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("level", levelFilter);
      params.set("source", sourceFilter);
      params.set("hours", String(hours));
      if (search) params.set("q", search);
      params.set("limit", "100");
      const r = await api<LogsResponse>(`/api/v2/admin/logs?${params.toString()}`);
      setLogs(r.logs ?? []);
      setCounts(r.counts ?? { byLevel: {}, bySource: {} });
      setSources(r.sources ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [levelFilter, sourceFilter, hours, search]);

  // 加载分析
  const loadAnalysis = React.useCallback(async () => {
    setAnalysisLoading(true);
    try {
      const r = await api<{ success: boolean; analysis: LogAnalysis }>(
        `/api/v2/admin/logs/analyze?hours=${hours}`,
      );
      setAnalysis(r.analysis);
    } catch {
      setAnalysis(null);
    } finally {
      setAnalysisLoading(false);
    }
  }, [hours]);

  React.useEffect(() => { void loadLogs(); }, [loadLogs]);
  React.useEffect(() => { void loadAnalysis(); }, [loadAnalysis]);

  // 搜索 debounce
  React.useEffect(() => {
    const id = setTimeout(() => {
      if (searchInput !== search) setSearch(searchInput);
    }, 350);
    return () => clearTimeout(id);
  }, [searchInput, search]);

  const refreshAll = () => { void loadLogs(); void loadAnalysis(); };

  return (
    <div className="space-y-8">
      <Header onRefresh={refreshAll} loading={loading || analysisLoading} />

      {/* ════════ 1. AI 日志分析(最显眼) ════════ */}
      <AIAnalysisPanel analysis={analysis} loading={analysisLoading} />

      {/* ════════ 2 + 3. 趋势图 + 热力图 ════════ */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <TrendCard analysis={analysis} loading={analysisLoading} />
        <HeatmapCard analysis={analysis} loading={analysisLoading} />
      </div>

      {/* ════════ 4. 日志列表(可过滤) ════════ */}
      <ListSection
        logs={logs}
        counts={counts}
        sources={sources}
        levelFilter={levelFilter}
        sourceFilter={sourceFilter}
        hours={hours}
        searchInput={searchInput}
        loading={loading}
        error={error}
        onLevelChange={setLevelFilter}
        onSourceChange={setSourceFilter}
        onHoursChange={setHours}
        onSearchChange={setSearchInput}
        onSelect={setSelected}
      />

      {/* ════════ 详情抽屉 ════════ */}
      <DetailDrawer log={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Header
// ─────────────────────────────────────────────────────────────

function Header({ onRefresh, loading }: { onRefresh: () => void; loading: boolean }) {
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
// 1. AI 分析面板
// ─────────────────────────────────────────────────────────────

function AIAnalysisPanel({ analysis, loading }: { analysis: LogAnalysis | null; loading: boolean }) {
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

      {/* 三个统计块 */}
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

function TrendCard({ analysis, loading }: { analysis: LogAnalysis | null; loading: boolean }) {
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

function HeatmapCard({ analysis, loading }: { analysis: LogAnalysis | null; loading: boolean }) {
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

// ─────────────────────────────────────────────────────────────
// 4. 日志列表(可过滤)
// ─────────────────────────────────────────────────────────────

interface ListSectionProps {
  logs: HumanizedLog[];
  counts: { byLevel: Record<string, number>; bySource: Record<string, number> };
  sources: string[];
  levelFilter: "all" | Level;
  sourceFilter: string;
  hours: number;
  searchInput: string;
  loading: boolean;
  error: string | null;
  onLevelChange: (v: "all" | Level) => void;
  onSourceChange: (v: string) => void;
  onHoursChange: (v: number) => void;
  onSearchChange: (v: string) => void;
  onSelect: (log: HumanizedLog) => void;
}

function ListSection(props: ListSectionProps) {
  const {
    logs, counts, sources, levelFilter, sourceFilter, hours, searchInput,
    loading, error,
    onLevelChange, onSourceChange, onHoursChange, onSearchChange, onSelect,
  } = props;

  const levelTabs: Array<{ key: "all" | Level; label: string; count: number }> = [
    { key: "all", label: "全部", count: Object.values(counts.byLevel).reduce((s, n) => s + n, 0) },
    { key: "error", label: "错误", count: counts.byLevel.error ?? 0 },
    { key: "warn", label: "警告", count: counts.byLevel.warn ?? 0 },
    { key: "info", label: "信息", count: counts.byLevel.info ?? 0 },
  ];

  return (
    <section className="space-y-5">
      {/* Level tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {levelTabs.map((tab) => {
          const active = levelFilter === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onLevelChange(tab.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-medium transition",
                active
                  ? "bg-foreground text-background"
                  : "bg-card text-foreground/70 ring-1 ring-border hover:bg-accent",
              )}
            >
              {tab.label}
              <span className={cn(
                "rounded-full px-1.5 py-px font-mono text-[10px]",
                active ? "bg-background/20" : "bg-muted",
              )}>{tab.count}</span>
            </button>
          );
        })}
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap items-end gap-3">
        <FilterField label="来源">
          <select
            value={sourceFilter}
            onChange={(e) => onSourceChange(e.target.value)}
            className="h-9 rounded-full border border-border bg-card px-3 text-[12px]"
          >
            <option value="all">全部来源</option>
            {sources.map((s) => (
              <option key={s} value={s}>{sourceLabelOf(s)}</option>
            ))}
          </select>
        </FilterField>

        <FilterField label="时间窗口">
          <select
            value={hours}
            onChange={(e) => onHoursChange(Number(e.target.value))}
            className="h-9 rounded-full border border-border bg-card px-3 text-[12px]"
          >
            {HOUR_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </FilterField>

        <FilterField label="搜索">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-foreground/50" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="搜标题 / 描述 / 员工"
              className="h-9 w-[260px] rounded-full border border-border bg-card pl-8 pr-3 text-[12px] placeholder:text-foreground/40"
            />
          </div>
        </FilterField>

        <span className="ml-auto font-mono text-[11px] text-foreground/45">
          {loading ? "加载中…" : `${logs.length} 条`}
        </span>
      </div>

      {/* List */}
      {error ? (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 px-4 py-6 text-center text-[13px] text-rose-700 dark:text-rose-300">
          {error}
        </div>
      ) : logs.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card px-4 py-12 text-center">
          <Inbox className="mx-auto size-6 text-foreground/35" />
          <p className="mt-2 text-[13px] text-foreground/55">没有匹配的日志条目</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {logs.map((log) => (
            <li key={log.id}>
              <LogCard log={log} onClick={() => onSelect(log)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground/50">{label}</span>
      {children}
    </label>
  );
}

function LogCard({ log, onClick }: { log: HumanizedLog; onClick: () => void }) {
  const LevelIcon = log.level === "error" ? XCircle : log.level === "warn" ? AlertTriangle : Info;
  const levelCls = log.level === "error"
    ? "text-rose-600 dark:text-rose-400"
    : log.level === "warn"
    ? "text-amber-600 dark:text-amber-400"
    : "text-sky-600 dark:text-sky-400";

  return (
    <button
      type="button"
      onClick={onClick}
      className="group block w-full rounded-2xl border border-border bg-card px-4 py-3 text-left transition hover:bg-accent hover:border-foreground/20"
    >
      <div className="flex items-start gap-3">
        <LevelIcon className={cn("mt-0.5 size-4 shrink-0", levelCls)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide", levelTone(log.level))}>
                  {log.levelLabel}
                </span>
                <span className="text-[13px] font-medium text-foreground/90 truncate">
                  {log.title}
                </span>
              </div>
              <p className="mt-1 text-[12px] text-foreground/65 line-clamp-2">{log.description}</p>
              <div className="mt-1.5 flex items-center gap-3 text-[10.5px] font-mono text-foreground/45">
                <span>{log.tsLabel}</span>
                <span>·</span>
                <span>{log.sourceLabel}</span>
                <span>·</span>
                <span>{log.actionLabel}</span>
                {log.entityName && <><span>·</span><span>{log.entityName}</span></>}
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] ring-1", impactTone(log.impact))}>
                {impactLabel(log.impact)}
              </span>
              <ChevronRight className="size-4 text-foreground/30 transition group-hover:translate-x-0.5 group-hover:text-foreground/60" />
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// 详情抽屉
// ─────────────────────────────────────────────────────────────

function DetailDrawer({ log, onClose }: { log: HumanizedLog | null; onClose: () => void }) {
  React.useEffect(() => {
    if (!log) return;
    const id = setTimeout(() => {
      const el = document.getElementById("log-drawer");
      el?.classList.remove("translate-x-full");
      el?.classList.add("translate-x-0");
    }, 10);
    return () => clearTimeout(id);
  }, [log]);

  if (!log) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-background/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <aside
        id="log-drawer"
        className="relative h-full w-full max-w-[480px] translate-x-full border-l border-border bg-card shadow-2xl transition-transform duration-200 ease-out overflow-y-auto"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card/95 px-5 py-4 backdrop-blur">
          <div className="flex items-center gap-2">
            <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide", levelTone(log.level))}>
              {log.levelLabel}
            </span>
            <span className="text-[13px] font-semibold">{log.title}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 hover:bg-accent"
            aria-label="关闭"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-6 p-5">
          {/* 基本信息 */}
          <Section title="基本信息">
            <Field label="时间" value={log.tsLabel} mono />
            <Field label="来源" value={log.sourceLabel} />
            <Field label="动作" value={log.actionLabel} />
            <Field label="行为方" value={log.actor} mono />
            <Field label="影响级别" value={impactLabel(log.impact)} />
            <Field label="结果" value={log.result === "failed" ? "失败" : log.result === "success" ? "成功" : "信息"} />
          </Section>

          {/* 描述 */}
          <Section title="人类可读描述">
            <p className="text-[13px] leading-relaxed text-foreground/85">{log.description}</p>
          </Section>

          {/* 修复建议 */}
          {log.fixHint && (
            <Section title="修复建议">
              <div className="rounded-2xl bg-amber-500/10 ring-1 ring-amber-500/30 px-4 py-3">
                <div className="flex items-start gap-2">
                  <Lightbulb className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <p className="text-[12.5px] text-amber-800 dark:text-amber-200">{log.fixHint}</p>
                </div>
              </div>
            </Section>
          )}

          {/* 关联实体 */}
          {log.entityId && (
            <Section title="关联实体">
              <a
                href={log.entityType === "agent"
                  ? (log.entityId.startsWith("bot:") ? `/employees?name=${encodeURIComponent(log.entityName ?? "")}` : `/employees/${log.entityId}`)
                  : "/overview/logs"}
                className="inline-flex items-center gap-1.5 rounded-full bg-foreground/5 px-3 py-1.5 text-[12px] hover:bg-accent"
              >
                <Bot className="size-3.5" />
                {log.entityName ?? log.entityId}
                <ArrowRight className="size-3" />
              </a>
            </Section>
          )}

          {/* 原始数据 */}
          {log.raw && Object.keys(log.raw).length > 0 && (
            <Section title="原始数据(开发调试)">
              <pre className="overflow-x-auto rounded-2xl bg-muted/60 p-3 font-mono text-[10.5px] leading-relaxed text-foreground/75 max-h-[280px]">
                {JSON.stringify(log.raw, null, 2)}
              </pre>
            </Section>
          )}
        </div>
      </aside>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-[10.5px] font-mono uppercase tracking-[0.18em] text-foreground/50">{title}</div>
      <div>{children}</div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/40 py-1.5 last:border-b-0">
      <span className="text-[11.5px] text-foreground/55">{label}</span>
      <span className={cn("text-[12.5px] text-foreground/85 text-right break-all", mono && "font-mono")}>{value}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Shared
// ─────────────────────────────────────────────────────────────

function PanelShell({
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

function SkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-4 rounded bg-muted/60 animate-pulse" style={{ width: `${90 - i * 10}%` }} />
      ))}
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="py-6 text-center">
      <Inbox className="mx-auto size-5 text-foreground/35" />
      <p className="mt-2 text-[12px] text-foreground/50">{text}</p>
    </div>
  );
}
