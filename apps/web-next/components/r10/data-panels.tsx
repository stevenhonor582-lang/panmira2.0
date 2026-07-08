/**
 * R10 — 真实数据接入面板 (2026-07-08)
 *
 * 5 个独立的 client-side 面板组件,接入 R10 新端点:
 *   - SessionsPanel      → /api/v2/admin/sessions (feedback 页)
 *   - RagStatsPanel      → /api/v2/admin/rag-query-stats (diagnosis 页)
 *   - UsageReportsPanel  → /api/v2/admin/usage-reports (billing 页)
 *   - PipelineRunsPanel  → /api/v2/admin/pipeline-runs (tasks 页)
 *   - BotHistoryPanel    → /api/v2/admin/bot-history + /api/v2/admin/sync-outbox (logs 页)
 *
 * 每个面板:useFetch + 紧凑表格 + graceful empty/error state.
 * 在已有页面的尾部 append 一个 section 即可,不替换原内容。
 */
"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  RefreshCcw, Loader2, AlertCircle, ChevronDown, ChevronRight,
  MessageSquare, Activity, Coins, GitBranch, History, Database,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

// ───────────────────────────────────────────────────────────────
// Shared hooks
// ───────────────────────────────────────────────────────────────
function useR10<T>(endpoint: string | null) {
  const [data, setData] = React.useState<T | null>(null);
  const [loading, setLoading] = React.useState<boolean>(!!endpoint);
  const [error, setError] = React.useState<string | null>(null);
  const [tick, setTick] = React.useState(0);

  const refresh = React.useCallback(() => setTick((t) => t + 1), []);

  React.useEffect(() => {
    if (!endpoint) {
      setData(null);
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    setError(null);
    api<T>(endpoint)
      .then((d) => { if (alive) setData(d); })
      .catch((e: any) => {
        if (alive) setError(String(e?.message ?? e));
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [endpoint, tick]);

  return { data, loading, error, refresh };
}

function PanelShell({
  title, icon: Icon, count, loading, error, onRefresh, children, accent = "text-emerald-500",
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  count?: number | string;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  children: React.ReactNode;
  accent?: string;
}) {
  return (
    <section className="rounded-lg border border-border bg-background overflow-hidden">
      <header className="px-4 py-2.5 border-b border-border bg-muted/30 flex items-center gap-2">
        <Icon className={cn("size-3.5", accent)} />
        <h3 className="text-xs font-semibold tracking-tight">{title}</h3>
        {count !== undefined && (
          <span className="text-[10px] font-mono text-muted-foreground">{count}</span>
        )}
        <Button variant="ghost" size="sm" className="h-6 ml-auto text-[10px] gap-1" onClick={onRefresh}>
          <RefreshCcw className={cn("size-3", loading && "animate-spin")} />
          刷新
        </Button>
      </header>
      <div className="p-3">
        {error ? (
          <div className="rounded-md border border-rose-500/30 bg-rose-500/5 p-2.5 text-[11px] text-rose-700 dark:text-rose-300 flex items-start gap-2">
            <AlertCircle className="size-3 mt-0.5 shrink-0" />
            <div className="font-mono">{error}</div>
          </div>
        ) : loading && !count ? (
          <div className="grid place-items-center py-6 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

const tableTh = "px-2 py-1.5 text-left text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70 border-b border-border";
const tableTd = "px-2 py-1.5 text-[11px] border-b border-border/50 align-top";
const mono = "font-mono";

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "completed" || status === "done" || status === "ok" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
    : status === "failed" || status === "error" ? "bg-rose-500/15 text-rose-700 dark:text-rose-300"
    : status === "running" || status === "pending" ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
    : "bg-muted text-muted-foreground";
  return (
    <span className={cn("inline-block px-1.5 py-0.5 rounded-sm text-[10px] font-mono uppercase tracking-wider", tone)}>
      {status}
    </span>
  );
}

function toISO(v: unknown): string {
  if (!v) return "—";
  if (typeof v === "number") {
    return new Date(v < 1e12 ? v * 1000 : v).toISOString().replace("T", " ").slice(0, 19);
  }
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.replace("T", " ").slice(0, 19);
  return s;
}

// ───────────────────────────────────────────────────────────────
// 1. Sessions panel — feedback 页
// ───────────────────────────────────────────────────────────────
interface SessionsResponse {
  sessions: Array<{
    id: string; botName: string | null; title: string | null;
    platform: string | null; messageCount: number;
    createdAt: string | null; updatedAt: string | null;
    claudeSessionId: string | null; workingDirectory: string | null;
  }>;
  chatSessions: Array<{
    botName: string; chatId: string; model: string | null;
    engine: string | null; cumulativeTokens: number;
    cumulativeCostUsd: number; lastUsed: string | null;
  }>;
}

export function SessionsPanel() {
  const { data, loading, error, refresh } = useR10<SessionsResponse>("/api/v2/admin/sessions");
  const [tab, setTab] = React.useState<"engine" | "channel">("engine");
  const sessions = data?.sessions ?? [];
  const chats = data?.chatSessions ?? [];

  return (
    <PanelShell
      title="真实会话 (sessions + chat_sessions)"
      icon={MessageSquare}
      count={`${sessions.length} engine · ${chats.length} channel`}
      loading={loading}
      error={error}
      onRefresh={refresh}
      accent="text-sky-500"
    >
      <div className="flex items-center gap-1 mb-2">
        {(["engine", "channel"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "px-2 py-0.5 rounded-sm text-[10px] font-mono uppercase tracking-wide",
              tab === t ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t === "engine" ? `engine (${sessions.length})` : `channel (${chats.length})`}
          </button>
        ))}
      </div>
      <div className="max-h-[360px] overflow-auto rounded-md border border-border">
        <table className="w-full">
          <thead className="sticky top-0 bg-background">
            <tr>
              {tab === "engine" ? (
                <>
                  <th className={tableTh}>title / bot</th>
                  <th className={tableTh}>platform</th>
                  <th className={tableTh}>msgs</th>
                  <th className={tableTh}>updated</th>
                </>
              ) : (
                <>
                  <th className={tableTh}>bot / chat</th>
                  <th className={tableTh}>model</th>
                  <th className={tableTh}>tokens</th>
                  <th className={tableTh}>cost</th>
                  <th className={tableTh}>last used</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {tab === "engine" ? (
              sessions.length === 0 ? (
                <tr><td colSpan={4} className={cn(tableTd, "text-center text-muted-foreground")}>no engine sessions</td></tr>
              ) : sessions.map((s) => (
                <tr key={s.id}>
                  <td className={tableTd}>
                    <div className={mono}>{s.title ?? "(no title)"}</div>
                    <div className="text-[10px] text-muted-foreground">{s.botName ?? "—"}</div>
                  </td>
                  <td className={cn(tableTd, mono)}>{s.platform ?? "—"}</td>
                  <td className={cn(tableTd, mono)}>{s.messageCount}</td>
                  <td className={cn(tableTd, mono, "text-muted-foreground")}>{toISO(s.updatedAt ?? s.createdAt)}</td>
                </tr>
              ))
            ) : (
              chats.length === 0 ? (
                <tr><td colSpan={5} className={cn(tableTd, "text-center text-muted-foreground")}>no channel chat_sessions</td></tr>
              ) : chats.map((c, i) => (
                <tr key={`${c.botName}-${c.chatId}-${i}`}>
                  <td className={tableTd}>
                    <div className={mono}>{c.botName}</div>
                    <div className="text-[10px] text-muted-foreground truncate max-w-[24ch]">{c.chatId}</div>
                  </td>
                  <td className={cn(tableTd, mono)}>
                    {c.model ?? "—"}
                    {c.engine && <div className="text-[10px] text-muted-foreground">{c.engine}</div>}
                  </td>
                  <td className={cn(tableTd, mono)}>{c.cumulativeTokens.toLocaleString()}</td>
                  <td className={cn(tableTd, mono)}>${c.cumulativeCostUsd.toFixed(4)}</td>
                  <td className={cn(tableTd, mono, "text-muted-foreground")}>{toISO(c.lastUsed)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </PanelShell>
  );
}

// ───────────────────────────────────────────────────────────────
// 2. RAG query stats — diagnosis 页
// ───────────────────────────────────────────────────────────────
interface RagStatsResponse {
  window: string;
  totals: { total: number; hits: number; missRate: number; avgLatencyMs: number };
  daily: Array<{ day: string; total: number; hits: number; misses: number; avgResults: number | null; avgLatencyMs: number; avgTopScore: number | null }>;
  byBot: Array<{ botName: string; total: number; hits: number; avgLatencyMs: number }>;
}

export function RagStatsPanel() {
  const { data, loading, error, refresh } = useR10<RagStatsResponse>("/api/v2/admin/rag-query-stats");
  const totals = data?.totals;
  const maxTotal = Math.max(1, ...(data?.daily ?? []).map((d) => d.total));

  return (
    <PanelShell
      title="RAG 查询日志 (rag_query_log · 30d)"
      icon={Activity}
      count={totals ? `${totals.total} queries · ${totals.missRate}% miss · ${totals.avgLatencyMs}ms avg` : undefined}
      loading={loading}
      error={error}
      onRefresh={refresh}
      accent="text-violet-500"
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono mb-1.5">daily</div>
          <div className="rounded-md border border-border p-2 space-y-1 max-h-[260px] overflow-auto">
            {(data?.daily ?? []).map((d) => (
              <div key={d.day} className="flex items-center gap-2 text-[11px]">
                <span className="font-mono text-muted-foreground w-[90px] shrink-0">{toISO(d.day).slice(0, 10)}</span>
                <div className="flex-1 h-3 bg-muted rounded-sm overflow-hidden flex">
                  <div className="bg-emerald-500/60" style={{ width: `${(d.hits / maxTotal) * 100}%` }} />
                  <div className="bg-rose-500/40" style={{ width: `${(d.misses / maxTotal) * 100}%` }} />
                </div>
                <span className="font-mono text-muted-foreground w-[60px] text-right">{d.total} ({d.avgLatencyMs}ms)</span>
              </div>
            ))}
            {(data?.daily ?? []).length === 0 && (
              <div className="text-[11px] text-muted-foreground text-center py-4">无数据</div>
            )}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono mb-1.5">by bot</div>
          <div className="rounded-md border border-border max-h-[260px] overflow-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-background">
                <tr>
                  <th className={tableTh}>bot</th>
                  <th className={tableTh}>queries</th>
                  <th className={tableTh}>hits</th>
                  <th className={tableTh}>latency</th>
                </tr>
              </thead>
              <tbody>
                {(data?.byBot ?? []).map((b) => (
                  <tr key={b.botName}>
                    <td className={cn(tableTd, mono)}>{b.botName}</td>
                    <td className={cn(tableTd, mono)}>{b.total}</td>
                    <td className={cn(tableTd, mono)}>{b.hits}</td>
                    <td className={cn(tableTd, mono)}>{b.avgLatencyMs}ms</td>
                  </tr>
                ))}
                {(data?.byBot ?? []).length === 0 && (
                  <tr><td colSpan={4} className={cn(tableTd, "text-center text-muted-foreground")}>无数据</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </PanelShell>
  );
}

// ───────────────────────────────────────────────────────────────
// 3. Usage reports — billing 页
// ───────────────────────────────────────────────────────────────
interface UsageReportsResponse {
  reports: Array<{
    id: string; date: string | null; dimension: string | null;
    dimensionKey: string | null; count: number; costUsd: number;
  }>;
  byDimension: Array<{ dimension: string; rows: number; totalCount: number; totalCostUsd: number }>;
}

export function UsageReportsPanel() {
  const { data, loading, error, refresh } = useR10<UsageReportsResponse>("/api/v2/admin/usage-reports");

  return (
    <PanelShell
      title="资源使用 (usage_reports)"
      icon={Coins}
      count={data ? `${data.reports.length} rows · ${data.byDimension.length} dimensions` : undefined}
      loading={loading}
      error={error}
      onRefresh={refresh}
      accent="text-amber-500"
    >
      <div className="grid grid-cols-3 gap-2 mb-3">
        {(data?.byDimension ?? []).map((d) => (
          <div key={d.dimension} className="rounded-md border border-border p-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono">{d.dimension}</div>
            <div className="text-sm font-mono mt-0.5">{d.totalCount.toLocaleString()}</div>
            <div className="text-[10px] font-mono text-muted-foreground">${d.totalCostUsd.toFixed(2)} · {d.rows} rows</div>
          </div>
        ))}
        {(data?.byDimension ?? []).length === 0 && !loading && (
          <div className="col-span-3 text-[11px] text-muted-foreground text-center py-4">无数据</div>
        )}
      </div>
      <div className="max-h-[260px] overflow-auto rounded-md border border-border">
        <table className="w-full">
          <thead className="sticky top-0 bg-background">
            <tr>
              <th className={tableTh}>date</th>
              <th className={tableTh}>dimension</th>
              <th className={tableTh}>key</th>
              <th className={tableTh}>count</th>
              <th className={tableTh}>cost</th>
            </tr>
          </thead>
          <tbody>
            {(data?.reports ?? []).map((r) => (
              <tr key={r.id}>
                <td className={cn(tableTd, mono)}>{r.date ?? "—"}</td>
                <td className={cn(tableTd, mono)}>{r.dimension ?? "—"}</td>
                <td className={cn(tableTd, mono, "text-muted-foreground")}>{r.dimensionKey ?? "—"}</td>
                <td className={cn(tableTd, mono)}>{r.count.toLocaleString()}</td>
                <td className={cn(tableTd, mono)}>${r.costUsd.toFixed(2)}</td>
              </tr>
            ))}
            {(data?.reports ?? []).length === 0 && (
              <tr><td colSpan={5} className={cn(tableTd, "text-center text-muted-foreground")}>无 usage_reports</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </PanelShell>
  );
}

// ───────────────────────────────────────────────────────────────
// 4. Pipeline runs — tasks 页
// ───────────────────────────────────────────────────────────────
interface PipelineRunsResponse {
  runs: Array<{
    id: string; status: string; triggeredBy: string | null;
    startedAt: string | null; finishedAt: string | null;
    durationMs: number | null; error: string | null;
  }>;
  summary: Array<{ status: string; count: number }>;
}

export function PipelineRunsPanel() {
  const { data, loading, error, refresh } = useR10<PipelineRunsResponse>("/api/v2/admin/pipeline-runs?limit=20");

  return (
    <PanelShell
      title="最近 Pipeline 执行 (pipeline_runs)"
      icon={GitBranch}
      count={data ? `${data.runs.length} runs` : undefined}
      loading={loading}
      error={error}
      onRefresh={refresh}
      accent="text-indigo-500"
    >
      <div className="flex flex-wrap gap-1.5 mb-3">
        {(data?.summary ?? []).map((s) => (
          <StatusPill key={s.status} status={s.status} />
        ))}
        <span className="ml-auto text-[10px] font-mono text-muted-foreground">
          {(data?.summary ?? []).reduce((a, b) => a + b.count, 0)} total
        </span>
      </div>
      <div className="max-h-[320px] overflow-auto rounded-md border border-border">
        <table className="w-full">
          <thead className="sticky top-0 bg-background">
            <tr>
              <th className={tableTh}>status</th>
              <th className={tableTh}>started</th>
              <th className={tableTh}>duration</th>
              <th className={tableTh}>by</th>
              <th className={tableTh}>error</th>
            </tr>
          </thead>
          <tbody>
            {(data?.runs ?? []).map((r) => (
              <tr key={r.id}>
                <td className={tableTd}><StatusPill status={r.status} /></td>
                <td className={cn(tableTd, mono)}>{toISO(r.startedAt)}</td>
                <td className={cn(tableTd, mono)}>
                  {r.durationMs !== null ? `${(r.durationMs / 1000).toFixed(2)}s` : "—"}
                </td>
                <td className={cn(tableTd, mono)}>{r.triggeredBy ?? "—"}</td>
                <td className={cn(tableTd, "text-rose-600 dark:text-rose-400 text-[10px]")}>
                  {r.error ? r.error.slice(0, 60) : "—"}
                </td>
              </tr>
            ))}
            {(data?.runs ?? []).length === 0 && (
              <tr><td colSpan={5} className={cn(tableTd, "text-center text-muted-foreground")}>no pipeline_runs</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </PanelShell>
  );
}

// ───────────────────────────────────────────────────────────────
// 5. Bot history + sync outbox — logs 页
// ───────────────────────────────────────────────────────────────
interface BotHistoryResponse {
  history: Array<{
    id: string | null; botName: string | null; agentName: string | null;
    action: string | null; boundAt: string | null; unboundAt: string | null;
    boundBy: string | null; changedAt: string | null; changedBy: string | null;
  }>;
}
interface SyncOutboxResponse {
  items: Array<{
    id: number; status: string; attempts: number; lastError: string | null;
    createdAt: string | null; updatedAt: string | null;
    payload: unknown;
  }>;
  summary: Array<{ status: string; count: number; maxAttempts: number; latestUpdate: string }>;
}

export function BotHistoryPanel() {
  const { data: histData, loading: histLoading, error: histError, refresh: histRefresh } =
    useR10<BotHistoryResponse>("/api/v2/admin/bot-history");
  const { data: outboxData, loading: outboxLoading, error: outboxError, refresh: outboxRefresh } =
    useR10<SyncOutboxResponse>("/api/v2/admin/sync-outbox");
  const [tab, setTab] = React.useState<"history" | "outbox">("history");

  return (
    <PanelShell
      title="审计追踪 (bot_agent_history + nextcrm_sync_outbox)"
      icon={History}
      count={tab === "history"
        ? `${histData?.history.length ?? 0} events`
        : `${outboxData?.items.length ?? 0} items`}
      loading={tab === "history" ? histLoading : outboxLoading}
      error={tab === "history" ? histError : outboxError}
      onRefresh={tab === "history" ? histRefresh : outboxRefresh}
      accent="text-rose-500"
    >
      <div className="flex items-center gap-1 mb-2">
        {(["history", "outbox"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "px-2 py-0.5 rounded-sm text-[10px] font-mono uppercase tracking-wide",
              tab === t ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t === "history" ? `bot history (${histData?.history.length ?? 0})` : `sync outbox (${outboxData?.items.length ?? 0})`}
          </button>
        ))}
      </div>
      {tab === "history" ? (
        <div className="max-h-[300px] overflow-auto rounded-md border border-border">
          <table className="w-full">
            <thead className="sticky top-0 bg-background">
              <tr>
                <th className={tableTh}>bot</th>
                <th className={tableTh}>agent</th>
                <th className={tableTh}>action</th>
                <th className={tableTh}>at</th>
                <th className={tableTh}>by</th>
              </tr>
            </thead>
            <tbody>
              {(histData?.history ?? []).map((h, i) => (
                <tr key={h.id ?? i}>
                  <td className={cn(tableTd, mono)}>{h.botName ?? "—"}</td>
                  <td className={cn(tableTd, mono)}>{h.agentName ?? "—"}</td>
                  <td className={tableTd}><StatusPill status={h.action ?? "—"} /></td>
                  <td className={cn(tableTd, mono, "text-muted-foreground")}>{toISO(h.changedAt ?? h.boundAt)}</td>
                  <td className={cn(tableTd, mono)}>{h.changedBy ?? h.boundBy ?? "—"}</td>
                </tr>
              ))}
              {(histData?.history ?? []).length === 0 && (
                <tr><td colSpan={5} className={cn(tableTd, "text-center text-muted-foreground")}>no history</td></tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {(outboxData?.summary ?? []).map((s) => (
              <span key={s.status} className="inline-flex items-center gap-1">
                <StatusPill status={s.status} />
                <span className="text-[10px] font-mono text-muted-foreground">{s.count}</span>
              </span>
            ))}
          </div>
          <div className="max-h-[280px] overflow-auto rounded-md border border-border">
            <table className="w-full">
              <thead className="sticky top-0 bg-background">
                <tr>
                  <th className={tableTh}>id</th>
                  <th className={tableTh}>status</th>
                  <th className={tableTh}>attempts</th>
                  <th className={tableTh}>created</th>
                  <th className={tableTh}>error</th>
                </tr>
              </thead>
              <tbody>
                {(outboxData?.items ?? []).map((it) => (
                  <tr key={it.id}>
                    <td className={cn(tableTd, mono)}>{it.id}</td>
                    <td className={tableTd}><StatusPill status={it.status} /></td>
                    <td className={cn(tableTd, mono)}>{it.attempts}</td>
                    <td className={cn(tableTd, mono, "text-muted-foreground")}>{toISO(it.createdAt)}</td>
                    <td className={cn(tableTd, "text-rose-600 dark:text-rose-400 text-[10px]")}>
                      {it.lastError ? it.lastError.slice(0, 60) : "—"}
                    </td>
                  </tr>
                ))}
                {(outboxData?.items ?? []).length === 0 && (
                  <tr><td colSpan={5} className={cn(tableTd, "text-center text-muted-foreground")}>empty outbox</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </PanelShell>
  );
}
