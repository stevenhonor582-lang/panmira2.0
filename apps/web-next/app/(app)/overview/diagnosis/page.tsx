"use client";

// /overview/diagnosis — R14-E 真实健康度 + 动态刷新 + 优化建议并入
//
// 改造目标(用户原话):
//   - "数字员工 0 / 系统健康度 80% 怎么算出来的" → 现在显示具体子项
//   - "CPU 占用、API 平均延时 是不是动态" → 60s 自动重诊断 + 倒计时
//   - "应该是核心功能健康" → 5 项: 系统服务/AI 大模型/知识库/任务/资源
//   - "诊断是实时动态,还是标注时间" → 顶部显示 "诊断于 HH:MM:SS"
//   - "优化建议应该和诊断放到一起" → 不健康项联动建议,出问题就给方案
//
// 后端契约: GET /api/v2/admin/diagnosis →
//   { overallScore, checks[5], suggestions[], timestamp, nextCheckIn }

import * as React from "react";
import {
  Stethoscope,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Cpu,
  HardDrive,
  Bot,
  Zap,
  RotateCw,
  RefreshCw,
  Lightbulb,
  ArrowRight,
  ServerCog,
  Brain,
  Database,
  Workflow,
  Activity,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
  ResponsiveContainer,
} from "recharts";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
type Status = "ok" | "warn" | "error";

interface HealthCheck {
  name: string;
  status: Status;
  value: string;
  detail: string;
  threshold: string;
}

interface Suggestion {
  impact: "high" | "medium" | "info";
  target: string;
  problem: string;
  suggestion: string;
  action: string | null;
}

interface DiagnosisData {
  overallScore: number;
  checks: HealthCheck[];
  suggestions: Suggestion[];
  timestamp: string;
  nextCheckIn: number;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

const ICON_FOR: Record<string, React.ComponentType<{ className?: string }>> = {
  "系统服务": ServerCog,
  "AI 大模型": Brain,
  "知识库检索": Database,
  "任务执行": Workflow,
  "资源": Cpu,
};

function scoreHue(score: number): string {
  if (score >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 60) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}

function scoreFill(score: number): string {
  if (score >= 80) return "#10b981"; // emerald-500
  if (score >= 60) return "#f59e0b"; // amber-500
  return "#f43f5e"; // rose-500
}

function statusBadge(status: Status): string {
  if (status === "ok")
    return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
  if (status === "warn")
    return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
  return "bg-rose-500/15 text-rose-700 dark:text-rose-300";
}

function StatusIcon({ status, className }: { status: Status; className?: string }) {
  if (status === "ok") return <CheckCircle2 className={cn("size-4 text-emerald-600 dark:text-emerald-400", className)} />;
  if (status === "warn") return <AlertTriangle className={cn("size-4 text-amber-600 dark:text-amber-400", className)} />;
  return <XCircle className={cn("size-4 text-rose-600 dark:text-rose-400", className)} />;
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("zh-CN", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    });
  } catch {
    return iso;
  }
}

// ─────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────

export default function DiagnosisPage() {
  const [data, setData] = React.useState<DiagnosisData | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [countdown, setCountdown] = React.useState(60);

  const load = React.useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setRefreshing(true);
    try {
      const r = await api<DiagnosisData>("/api/v2/admin/diagnosis");
      setData(r);
      setError(null);
      setCountdown(r.nextCheckIn ?? 60);
    } catch (e) {
      setError(e instanceof Error ? e.message : "诊断失败");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // 初次加载
  React.useEffect(() => {
    void load();
  }, [load]);

  // 倒计时 + 自动刷新
  React.useEffect(() => {
    if (!data) return;
    const id = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          // 触发静默重诊断
          void load({ silent: true });
          return data.nextCheckIn ?? 60;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [data, load]);

  return (
    <div className="space-y-8">
      {/* ─────── 顶部:标题 + 时间戳 + 手动刷新 ─────── */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-[18px] font-semibold tracking-tight">
            <Stethoscope className="size-5 text-foreground/70" />
            系统诊断
          </h1>
          <p className="mt-1 text-[12px] text-foreground/55">
            {data ? (
              <>
                诊断于 <span className="font-mono">{formatTimestamp(data.timestamp)}</span>
                <span className="mx-2 text-foreground/30">·</span>
                下次自动诊断 <span className="font-mono">{countdown}s</span>
              </>
            ) : (
              <>正在采集系统健康数据…</>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={refreshing || loading}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-[12px] font-medium transition",
            "hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed",
          )}
        >
          <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
          {refreshing ? "诊断中…" : "立即诊断"}
        </button>
      </header>

      {loading ? (
        <SkeletonDiagnosis />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : data ? (
        <>
          {/* ─────── 综合健康分(圆环) ─────── */}
          <OverallScoreCard
            score={data.overallScore}
            timestamp={data.timestamp}
            okCount={data.checks.filter((c) => c.status === "ok").length}
            warnCount={data.checks.filter((c) => c.status === "warn").length}
            errCount={data.checks.filter((c) => c.status === "error").length}
          />

          {/* ─────── 5 项核心健康(横向 meter) ─────── */}
          <section className="space-y-3">
            <h2 className="text-[13px] font-semibold tracking-tight text-foreground/80">
              核心功能健康度 · {data.checks.length} 项
            </h2>
            <div className="overflow-hidden rounded-3xl ring-1 ring-border">
              <ul className="divide-y divide-border bg-card">
                {data.checks.map((c) => {
                  const Icon = ICON_FOR[c.name] ?? Activity;
                  return (
                    <li key={c.name} className="px-5 py-3.5">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <Icon className="size-4 text-foreground/55 shrink-0" />
                          <div className="min-w-0">
                            <div className="text-[13.5px] font-medium">{c.name}</div>
                            <div className="font-mono text-[11px] text-foreground/55 truncate">
                              {c.detail}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="font-mono text-[12px] text-foreground/80">{c.value}</span>
                          <StatusIcon status={c.status} />
                          <span
                            className={cn(
                              "rounded-sm px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide",
                              statusBadge(c.status),
                            )}
                          >
                            {c.status}
                          </span>
                        </div>
                      </div>
                      <div className="mt-2 ml-7 font-mono text-[10.5px] text-foreground/40">
                        阈值 {c.threshold}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>

          {/* ─────── 优化建议(并入自 /optimization) ─────── */}
          <OptimizationSection suggestions={data.suggestions} />
        </>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

function OverallScoreCard({
  score,
  timestamp,
  okCount,
  warnCount,
  errCount,
}: {
  score: number;
  timestamp: string;
  okCount: number;
  warnCount: number;
  errCount: number;
}) {
  const data = [
    {
      name: "score",
      value: score,
      fill: scoreFill(score),
    },
  ];
  return (
    <section className="relative overflow-hidden rounded-3xl ring-1 ring-border bg-card">
      <div className="grid gap-6 p-6 md:grid-cols-[260px_1fr] md:items-center">
        {/* 圆环 */}
        <div className="relative mx-auto h-[200px] w-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <RadialBarChart
              innerRadius="76%"
              outerRadius="100%"
              data={data}
              startAngle={90}
              endAngle={90 - 360 * (score / 100)}
            >
              <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
              <RadialBar
                background={{ fill: "var(--border, #e5e7eb)" }}
                dataKey="value"
                cornerRadius={12}
              />
            </RadialBarChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <div className={cn("text-[44px] font-bold leading-none tabular-nums", scoreHue(score))}>
              {score}
            </div>
            <div className="mt-1 text-[11px] uppercase tracking-wider text-foreground/50">
              / 100
            </div>
          </div>
        </div>

        {/* 状态摘要 */}
        <div className="space-y-4">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-foreground/50">
              综合健康分
            </div>
            <div className={cn("mt-0.5 text-[20px] font-semibold", scoreHue(score))}>
              {score >= 80 ? "系统运行健康" : score >= 60 ? "存在需要关注的项" : "存在严重问题"}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <StatPill label="正常" value={okCount} tone="emerald" />
            <StatPill label="警告" value={warnCount} tone="amber" />
            <StatPill label="异常" value={errCount} tone="rose" />
          </div>

          <div className="text-[11.5px] text-foreground/55">
            加权: 系统 25% · AI 30% · 知识库 20% · 任务 20% · 资源 5%
          </div>
        </div>
      </div>
    </section>
  );
}

function StatPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "emerald" | "amber" | "rose";
}) {
  const tones = {
    emerald: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-500/20",
    amber: "bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-amber-500/20",
    rose: "bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-rose-500/20",
  };
  return (
    <div className={cn("rounded-xl px-3 py-2 ring-1", tones[tone])}>
      <div className="text-[18px] font-bold tabular-nums leading-none">{value}</div>
      <div className="mt-1 text-[10.5px] uppercase tracking-wider opacity-80">{label}</div>
    </div>
  );
}

function OptimizationSection({ suggestions }: { suggestions: Suggestion[] }) {
  const hasIssue = suggestions.some((s) => s.impact !== "info");
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-semibold tracking-tight text-foreground/80">
          优化建议 · {suggestions.length} 条 {hasIssue ? "" : "(全健康)"}
        </h2>
        {!hasIssue && (
          <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] text-emerald-700 dark:text-emerald-300">
            所有系统运行正常
          </span>
        )}
      </div>
      <ul className="space-y-2.5">
        {suggestions.map((s, i) => {
          const tone =
            s.impact === "high" ? "rose" :
            s.impact === "medium" ? "amber" : "emerald";
          const ring =
            s.impact === "high" ? "ring-rose-500/20 bg-rose-500/[0.04]" :
            s.impact === "medium" ? "ring-amber-500/20 bg-amber-500/[0.04]" :
            "ring-emerald-500/20 bg-emerald-500/[0.04]";
          const label =
            s.impact === "high" ? "高影响" :
            s.impact === "medium" ? "中影响" : "信息";
          const labelColor =
            s.impact === "high" ? "bg-rose-500/15 text-rose-700 dark:text-rose-300" :
            s.impact === "medium" ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" :
            "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
          return (
            <li
              key={`${s.target}-${i}`}
              className={cn("rounded-2xl p-4 ring-1", ring)}
            >
              <div className="flex items-start gap-3">
                <Lightbulb
                  className={cn(
                    "size-4 mt-0.5 shrink-0",
                    tone === "rose" && "text-rose-600 dark:text-rose-400",
                    tone === "amber" && "text-amber-600 dark:text-amber-400",
                    tone === "emerald" && "text-emerald-600 dark:text-emerald-400",
                  )}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13.5px] font-medium">{s.target}</span>
                    <span className={cn("rounded-sm px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide", labelColor)}>
                      {label}
                    </span>
                  </div>
                  {s.problem && (
                    <div className="mt-1 font-mono text-[11px] text-foreground/55">
                      问题: {s.problem}
                    </div>
                  )}
                  <div className="mt-1.5 text-[12.5px] text-foreground/80">
                    {s.suggestion}
                  </div>
                  {s.action && (
                    <a
                      href={s.action}
                      className="mt-2 inline-flex items-center gap-1 text-[11.5px] font-medium text-foreground/70 hover:text-foreground hover:underline"
                    >
                      去修复 <ArrowRight className="size-3" />
                    </a>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function SkeletonDiagnosis() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-[260px] rounded-3xl bg-muted/40" />
      <div className="h-[200px] rounded-3xl bg-muted/40" />
      <div className="h-[120px] rounded-3xl bg-muted/40" />
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-3xl ring-1 ring-rose-500/20 bg-rose-500/[0.04] p-8 text-center">
      <AlertTriangle className="mx-auto size-6 text-rose-600 dark:text-rose-400" />
      <div className="mt-2 text-[14px] font-medium">诊断失败</div>
      <div className="mt-1 font-mono text-[11.5px] text-foreground/55">{message}</div>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-[12px] font-medium hover:bg-accent"
      >
        <RotateCw className="size-3.5" />
        重试
      </button>
    </div>
  );
}
