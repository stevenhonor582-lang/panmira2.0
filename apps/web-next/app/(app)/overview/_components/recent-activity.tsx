// 最近活动 — 3 列 (pipelines / audit / sessions)
import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, GitBranch, ScrollText, MessagesSquare } from "lucide-react";

export interface RecentPipeline {
  id: string;
  pipelineId: string | null;
  name: string;
  status: string;
  triggeredBy: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  error: string | null;
}
export interface RecentAudit {
  id: string;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  createdAt: string | null;
  details: unknown;
}
export interface RecentSession {
  id: string;
  botName: string | null;
  title: string | null;
  platform: string | null;
  updatedAt: string | null;
  messageCount: number;
}

interface Props {
  pipelines: RecentPipeline[];
  audit: RecentAudit[];
  sessions: RecentSession[];
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const diff = Date.now() - t;
  if (diff < 0) return "未来";
  const m = Math.floor(diff / 60000);
  if (m < 1) return "刚刚";
  if (m < 60) return `${m} 分前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 时前`;
  const d = Math.floor(h / 24);
  return `${d} 天前`;
}

const STATUS_TONE: Record<string, string> = {
  completed: "ok",
  success: "ok",
  running: "warn",
  failed: "err",
  error: "err",
  cancelled: "muted",
};

function StatusPill({ status }: { status: string }) {
  const tone = STATUS_TONE[status] ?? "muted";
  const cls = {
    ok: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    warn: "bg-amber-500/12 text-amber-700 dark:text-amber-300 border-amber-500/30",
    err: "bg-rose-500/12 text-rose-700 dark:text-rose-300 border-rose-500/30",
    muted: "bg-muted text-muted-foreground border-border",
  }[tone];
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>
      {status}
    </span>
  );
}

function fmtDuration(ms: number | null): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function Column({ title, href, hrefLabel, icon: Icon, accent, children }: {
  title: string;
  href?: string;
  hrefLabel?: string;
  icon: typeof GitBranch;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 flex flex-col">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <div className="flex items-center gap-1.5 min-w-0">
          <Icon className="size-3.5" style={{ color: accent }} />
          <h3 className="font-heading text-sm font-semibold tracking-tight">{title}</h3>
        </div>
        {href && (
          <Link href={href} className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
            {hrefLabel ?? "全部"} <ArrowUpRight className="size-3" />
          </Link>
        )}
      </div>
      <ul className="space-y-2 flex-1">{children}</ul>
    </div>
  );
}

export function RecentActivity({ pipelines, audit, sessions }: Props) {
  const empty = "text-xs text-muted-foreground py-4 text-center";
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <Column title="最近流水线" href="/overview/diagnosis" hrefLabel="诊断" icon={GitBranch} accent="oklch(0.67 0.15 41.62)">
        {pipelines.length === 0 ? (
          <li className={empty}>暂无执行记录</li>
        ) : pipelines.slice(0, 10).map((p) => (
          <li key={p.id} className="rounded-md px-2 py-1.5 hover:bg-muted/30 transition-colors">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-xs font-medium">{p.name}</span>
              <StatusPill status={p.status} />
            </div>
            <div className="mt-0.5 flex items-center justify-between gap-2 text-[10px] text-muted-foreground font-mono">
              <span>{timeAgo(p.startedAt)}</span>
              <span>{fmtDuration(p.durationMs)}</span>
            </div>
          </li>
        ))}
      </Column>

      <Column title="最近审计" href="/overview/logs" hrefLabel="日志" icon={ScrollText} accent="oklch(0.67 0.15 248.92)">
        {audit.length === 0 ? (
          <li className={empty}>暂无审计事件</li>
        ) : audit.slice(0, 10).map((a) => (
          <li key={a.id} className="rounded-md px-2 py-1.5 hover:bg-muted/30 transition-colors">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-xs font-mono">{a.action}</span>
              <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(a.createdAt)}</span>
            </div>
            {a.resourceType && (
              <div className="mt-0.5 text-[10px] text-muted-foreground truncate">
                {a.resourceType}{a.resourceId ? ` · ${a.resourceId.slice(0, 8)}` : ""}
              </div>
            )}
          </li>
        ))}
      </Column>

      <Column title="最近会话" href="/overview/diagnosis" hrefLabel="诊断" icon={MessagesSquare} accent="oklch(0.79 0.13 83.70)">
        {sessions.length === 0 ? (
          <li className={empty}>暂无会话</li>
        ) : sessions.slice(0, 5).map((s) => (
          <li key={s.id} className="rounded-md px-2 py-1.5 hover:bg-muted/30 transition-colors">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-xs font-medium">{s.title ?? s.botName ?? "(未命名)"}</span>
              <span className="font-mono text-[10px] text-muted-foreground shrink-0">{s.messageCount} msg</span>
            </div>
            <div className="mt-0.5 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
              <span>{s.platform ?? s.botName ?? "—"}</span>
              <span className="font-mono">{timeAgo(s.updatedAt)}</span>
            </div>
          </li>
        ))}
      </Column>
    </div>
  );
}
