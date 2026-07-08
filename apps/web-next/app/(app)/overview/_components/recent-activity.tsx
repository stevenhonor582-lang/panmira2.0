// R14-A · Dashboard 底部 3 列 (今日待办 / 需要关注 / 最近完成)
//
// 替换 R12 的 (最近流水线 / 最近审计 / 最近会话) —
// 后三者对运营没有直接意义; 新三列直接呈现"今天要做什么 + 哪里有问题 + 刚完成了什么"。
import * as React from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  ListTodo,
  AlertTriangle,
  CheckCircle2,
  Circle,
  PlayCircle,
} from "lucide-react";
import type {
  DashboardTodoItem,
  DashboardAlertItem,
  DashboardCompletedItem,
} from "./data";

interface Props {
  todo: DashboardTodoItem[];
  alerts: DashboardAlertItem[];
  completed: DashboardCompletedItem[];
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const diff = Date.now() - t;
  if (diff < 0) return "刚刚";
  const m = Math.floor(diff / 60000);
  if (m < 1) return "刚刚";
  if (m < 60) return `${m} 分前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 时前`;
  const d = Math.floor(h / 24);
  return `${d} 天前`;
}

function fmtDuration(ms: number | null): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function Column({
  title,
  count,
  icon: Icon,
  accent,
  tone,
  href,
  hrefLabel,
  children,
}: {
  title: string;
  count: React.ReactNode;
  icon: typeof ListTodo;
  accent: string;
  tone?: "default" | "warn" | "ok";
  href?: string;
  hrefLabel?: string;
  children: React.ReactNode;
}) {
  const countCls = {
    default: "text-muted-foreground",
    warn: "text-amber-600 dark:text-amber-400",
    ok: "text-emerald-600 dark:text-emerald-400",
  }[tone ?? "default"];
  return (
    <div className="rounded-xl border border-border bg-card p-5 flex flex-col">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="size-4 shrink-0" style={{ color: accent }} />
          <h3 className="font-heading text-sm font-semibold tracking-tight truncate">
            {title}
          </h3>
          <span className={`text-xs font-mono tabular-nums ${countCls}`}>
            ({count})
          </span>
        </div>
        {href && (
          <Link
            href={href}
            className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {hrefLabel ?? "全部"} <ArrowUpRight className="size-3" />
          </Link>
        )}
      </div>
      <ul className="space-y-1.5 flex-1">{children}</ul>
    </div>
  );
}

const emptyCls = "text-xs text-muted-foreground py-6 text-center";

// ── Todo column ──────────────────────────────────────────────────
function TodoList({ items }: { items: DashboardTodoItem[] }) {
  if (items.length === 0) {
    return <li className={emptyCls}>今天没有待启动或进行中的任务</li>;
  }
  return items.slice(0, 6).map((t) => {
    const Icon = t.kind === "pending" ? Circle : PlayCircle;
    const ownerSuffix = t.ownerName ? ` · ${t.ownerName}` : "";
    return (
      <li key={t.id}>
        <Link
          href={`/tasks/${t.id}`}
          className="flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-muted/40 transition-colors group"
        >
          <Icon className="size-3.5 shrink-0 mt-0.5 text-muted-foreground group-hover:text-foreground" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-xs font-medium">{t.name}</span>
              <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                {t.kind === "pending" ? "待启动" : "进行中"}
              </span>
            </div>
            <div className="mt-0.5 text-[10px] text-muted-foreground truncate">
              {t.triggerType === "schedule" ? "定时" : "手动"}
              {ownerSuffix} · 更新 {timeAgo(t.updatedAt)}
            </div>
          </div>
        </Link>
      </li>
    );
  });
}

// ── Alerts column ────────────────────────────────────────────────
function AlertsList({ items }: { items: DashboardAlertItem[] }) {
  if (items.length === 0) {
    return (
      <li className={emptyCls}>
        <div className="flex flex-col items-center gap-1">
          <CheckCircle2 className="size-5 text-emerald-500/60" />
          <span>24h 内暂无异常</span>
        </div>
      </li>
    );
  }
  return items.slice(0, 6).map((a) => {
    const color =
      a.severity === "error"
        ? "oklch(0.60 0.20 25)"
        : "oklch(0.72 0.15 75)";
    const content = (
      <div className="flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-muted/40 transition-colors group min-w-0">
        <AlertTriangle
          className="size-3.5 shrink-0 mt-0.5"
          style={{ color }}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium">{a.label}</div>
          {a.detail && (
            <div className="mt-0.5 text-[10px] text-muted-foreground truncate">
              {a.detail}
            </div>
          )}
        </div>
      </div>
    );
    return (
      <li key={a.key}>
        {a.href ? (
          <Link href={a.href} className="block">
            {content}
          </Link>
        ) : (
          content
        )}
      </li>
    );
  });
}

// ── Completed column ─────────────────────────────────────────────
function CompletedList({ items }: { items: DashboardCompletedItem[] }) {
  if (items.length === 0) {
    return <li className={emptyCls}>近 24h 暂无完成的任务</li>;
  }
  return items.slice(0, 8).map((c) => {
    const ownerSuffix = c.ownerName ? ` · ${c.ownerName}` : "";
    return (
      <li key={c.id}>
        <Link
          href={c.pipelineId ? `/tasks/${c.pipelineId}` : "/overview/diagnosis"}
          className="flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-muted/40 transition-colors group min-w-0"
        >
          <CheckCircle2 className="size-3.5 shrink-0 mt-0.5 text-emerald-500" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-xs font-medium">{c.name}</span>
              <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                {fmtDuration(c.durationMs)}
              </span>
            </div>
            <div className="mt-0.5 text-[10px] text-muted-foreground truncate">
              完成 {timeAgo(c.finishedAt)}
              {ownerSuffix}
            </div>
          </div>
        </Link>
      </li>
    );
  });
}

export function RecentActivity({ todo, alerts, completed }: Props) {
  const todoCount = todo.length;
  const alertCount = alerts.length;
  const completedCount = completed.length;

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <Column
        title="今日待办"
        count={todoCount}
        icon={ListTodo}
        accent="oklch(0.67 0.15 41.62)"
        tone="default"
        href="/tasks"
        hrefLabel="任务"
      >
        <TodoList items={todo} />
      </Column>

      <Column
        title="需要关注"
        count={
          alertCount > 0 ? (
            <>
              {alertCount} <span className="text-amber-500">⚠</span>
            </>
          ) : (
            <span className="text-emerald-500">0</span>
          )
        }
        icon={AlertTriangle}
        accent="oklch(0.65 0.20 25)"
        tone={alertCount > 0 ? "warn" : "ok"}
        href="/overview/diagnosis"
        hrefLabel="诊断"
      >
        <AlertsList items={alerts} />
      </Column>

      <Column
        title="最近完成"
        count={
          <span className="text-emerald-600 dark:text-emerald-400">
            {completedCount} ✓
          </span>
        }
        icon={CheckCircle2}
        accent="oklch(0.65 0.15 150)"
        tone="ok"
        href="/overview/diagnosis"
        hrefLabel="诊断"
      >
        <CompletedList items={completed} />
      </Column>
    </div>
  );
}
