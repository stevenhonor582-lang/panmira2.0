// 8 KPI 网格 — 大数字 + sparkline/chip + accent
import * as React from "react";
import {
  Users, Bot, ListChecks, FileText,
  Activity, AlertTriangle, Timer, Target,
  type LucideIcon,
} from "lucide-react";
import { Sparkline } from "./sparkline";

export interface DashboardKpis {
  employees: number;
  employeesActive: number;
  digitalEmployees: number;
  digitalEmployeesActive: number;
  pipelines: number;
  pipelinesActive: number;
  documents: number;
  documentsAddedToday: number;
  calls24h: number;
  errorRate24h: number;
  avgLatencyMs24h: number;
  ragHitRate: number;
}

interface Props {
  kpis: DashboardKpis;
  callsSpark: number[];
  errorSpark: number[];
}

type Accent = "chart-1" | "chart-2" | "chart-3" | "chart-4" | "chart-5";

const ACCENT_VAR: Record<Accent, string> = {
  "chart-1": "var(--chart-1)",
  "chart-2": "var(--chart-2)",
  "chart-3": "var(--chart-3)",
  "chart-4": "var(--chart-4)",
  "chart-5": "var(--chart-5)",
};

function Chip({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "ok" | "warn" | "err" }) {
  const tones: Record<string, string> = {
    muted: "border-border bg-muted/40 text-muted-foreground",
    ok: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    warn: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    err: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium tracking-wide ${tones[tone]}`}>
      {children}
    </span>
  );
}

function KpiCell({
  label, value, hint, icon: Icon, accent, spark, chip,
}: {
  label: string;
  value: string | number;
  hint: React.ReactNode;
  icon: LucideIcon;
  accent: Accent;
  spark?: number[];
  chip?: React.ReactNode;
}) {
  const color = ACCENT_VAR[accent];
  return (
    <div
      className="group relative overflow-hidden rounded-xl border border-border bg-card p-5 transition-all hover:-translate-y-0.5 hover:shadow-md hover:ring-1 hover:ring-border/60"
      style={{ ["--accent" as string]: color }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-6 -top-6 size-20 rounded-full opacity-0 transition-opacity duration-300 group-hover:opacity-[0.08]"
        style={{ background: color }}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.08em] text-muted-foreground font-medium">
            <Icon className="size-3" style={{ color }} />
            <span>{label}</span>
          </div>
          <div className="mt-2 font-heading text-[32px] leading-none font-semibold tracking-tight tabular-nums">
            {value}
          </div>
          <div className="mt-1.5 text-xs text-muted-foreground">{hint}</div>
        </div>
        <div className="flex flex-col items-end gap-2">
          {chip}
          {spark && spark.length > 1 && (
            <Sparkline data={spark} width={72} height={28} stroke={color} fill={color} />
          )}
        </div>
      </div>
    </div>
  );
}

export function DashboardKpis({ kpis, callsSpark, errorSpark }: Props) {
  const latencySec = kpis.avgLatencyMs24h > 0 ? (kpis.avgLatencyMs24h / 1000).toFixed(1) + "s" : "—";
  const latencyHint = kpis.avgLatencyMs24h > 0 ? `${kpis.avgLatencyMs24h.toLocaleString()} ms` : "今日暂无样本";
  const errorChip =
    kpis.errorRate24h === 0
      ? <Chip tone="ok">无错误</Chip>
      : kpis.errorRate24h < 1
      ? <Chip tone="warn">{kpis.errorRate24h}%</Chip>
      : <Chip tone="err">{kpis.errorRate24h}%</Chip>;
  const ragChip =
    kpis.ragHitRate >= 80
      ? <Chip tone="ok">{kpis.ragHitRate}%</Chip>
      : kpis.ragHitRate >= 50
      ? <Chip tone="warn">{kpis.ragHitRate}%</Chip>
      : <Chip tone="err">{kpis.ragHitRate}%</Chip>;

  return (
    <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCell
        label="正式员工"
        value={kpis.employees}
        hint={<span>{kpis.employeesActive} 在职 · {kpis.employees - kpis.employeesActive} 离职</span>}
        icon={Users}
        accent="chart-1"
        chip={<Chip>{kpis.employeesActive}/{kpis.employees}</Chip>}
      />
      <KpiCell
        label="数字员工"
        value={kpis.digitalEmployees}
        hint={<span>{kpis.digitalEmployeesActive} 运行 · {kpis.digitalEmployees - kpis.digitalEmployeesActive} 暂停</span>}
        icon={Bot}
        accent="chart-2"
        chip={<Chip tone="ok">{kpis.digitalEmployeesActive} active</Chip>}
      />
      <KpiCell
        label="流水线任务"
        value={kpis.pipelines}
        hint={<span>{kpis.pipelinesActive} 启用 · {kpis.pipelines - kpis.pipelinesActive} 归档</span>}
        icon={ListChecks}
        accent="chart-3"
      />
      <KpiCell
        label="KB 文档"
        value={kpis.documents.toLocaleString()}
        hint={<span>今日新增 <span className="font-mono">{kpis.documentsAddedToday}</span></span>}
        icon={FileText}
        accent="chart-4"
      />
      <KpiCell
        label="24h 调用"
        value={kpis.calls24h.toLocaleString()}
        hint={<span>近 7 日趋势</span>}
        icon={Activity}
        accent="chart-1"
        spark={callsSpark}
      />
      <KpiCell
        label="24h 错误率"
        value={kpis.calls24h > 0 ? `${kpis.errorRate24h}%` : "—"}
        hint={<span>{kpis.calls24h > 0 ? `${kpis.calls24h} 次调用基线` : "今日暂无调用"}</span>}
        icon={AlertTriangle}
        accent="chart-3"
        spark={errorSpark}
        chip={errorChip}
      />
      <KpiCell
        label="24h 平均响应"
        value={latencySec}
        hint={<span>{latencyHint}</span>}
        icon={Timer}
        accent="chart-5"
      />
      <KpiCell
        label="RAG 命中率"
        value={kpis.ragHitRate > 0 ? `${kpis.ragHitRate}%` : "—"}
        hint={<span>30 天查询基线</span>}
        icon={Target}
        accent="chart-2"
        chip={ragChip}
      />
    </div>
  );
}
