"use client";

// /overview/logs · R14-F 主页面
//
// 用户原话驱动:
//  1. "底下很多记录,但我不会查看,也不知道意义"   → 每条日志人类可读标题/描述
//  2. "以 bot 方式做的日志记录,我查看不了"          → 中文化 + 派生字段
//  3. "正常应该能查看这些日志,或怎么从里面发现问题" → AI 分析面板 + 建议行动
//  4. "这些日志可以给我用 AI 分析,告诉我哪些有问题" → 规则引擎 analyze 端点
//  5. "尤其是最近失调问题"                          → 7 天错误趋势 + 高频问题
//
// 主页面只负责:state 管理 + ListSection + DetailDrawer
// 面板组件 (Header / AIAnalysisPanel / TrendCard / HeatmapCard) 在 ./_panels.tsx

import * as React from "react";
import {
  Search,
  AlertTriangle,
  XCircle,
  Info,
  Inbox,
  X,
  ChevronRight,
  Lightbulb,
  Bot,
  ArrowRight,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  type HumanizedLog,
  type LogAnalysis,
  type Level,
  levelTone,
  impactTone,
  impactLabel,
  sourceLabelOf,
  Header,
  AIAnalysisPanel,
  TrendCard,
  HeatmapCard,
  PanelShell,
  SkeletonRows,
  EmptyHint,
} from "./_panels";

// ─────────────────────────────────────────────────────────────
// 后端响应类型
// ─────────────────────────────────────────────────────────────

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

const HOUR_OPTIONS = [
  { value: 1, label: "最近 1h" },
  { value: 24, label: "最近 24h" },
  { value: 168, label: "最近 7 天" },
  { value: 720, label: "最近 30 天" },
];

// ─────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────

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
