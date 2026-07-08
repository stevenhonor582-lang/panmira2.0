"use client";

/**
 * R13-D: Run history list with replay support.
 *
 * - Loads pipeline_runs from /api/v2/admin/pipelines/:id/runs
 * - Renders a table (time / status / duration / triggered by / error)
 * - "Replay" button: emits a CustomEvent 'dag:replay' with the run's
 *   node_states, which the editor listens for and highlights nodes in order.
 */

import * as React from "react";
import {
  CheckCircle2,
  CircleAlert,
  Clock,
  Loader2,
  Play,
  RotateCcw,
  XCircle,
} from "lucide-react";

import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import type { PipelineRun } from "./types";

interface Props {
  pipelineId: string;
  /** Auto-refresh interval ms (default 15s while there are running tasks). */
  refreshMs?: number;
}

interface RunRow extends PipelineRun {
  durationMs?: number;
}

export function RunHistoryPanel({ pipelineId, refreshMs = 15000 }: Props) {
  const [runs, setRuns] = React.useState<RunRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [replayRunId, setReplayRunId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const r = (await api(`/api/v2/admin/pipelines/${pipelineId}/runs?limit=50`)) as {
        data?: RunRow[] | { runs?: RunRow[] };
      };
      const list: RunRow[] = Array.isArray(r?.data)
        ? (r.data as RunRow[])
        : ((r?.data as { runs?: RunRow[] })?.runs ?? []);
      setRuns(list);
    } catch {
      setRuns([]);
    } finally {
      setLoading(false);
    }
  }, [pipelineId]);

  React.useEffect(() => {
    load();
  }, [load]);

  // Auto-refresh while any run is pending/running
  React.useEffect(() => {
    const hasActive = runs.some(
      (r) => r.status === "running" || r.status === "pending",
    );
    if (!hasActive) return;
    const t = setInterval(load, refreshMs);
    return () => clearInterval(t);
  }, [runs, refreshMs, load]);

  const handleReplay = React.useCallback((run: RunRow) => {
    const nodeStates = (run as unknown as { nodeStates?: Record<string, { status?: string }> }).nodeStates ?? {};
    setReplayRunId(run.id ?? null);
    window.dispatchEvent(
      new CustomEvent("dag:replay", {
        detail: { runId: run.id, nodeStates, startedAt: run.startedAt },
      }),
    );
  }, []);

  if (loading) {
    return (
      <div className="px-3 py-4 text-xs text-muted-foreground">
        <Loader2 className="size-3 animate-spin mr-1.5 inline-block" />
        加载执行历史…
      </div>
    );
  }

  return (
    <div className="rounded-lg ring-1 ring-foreground/10 bg-card overflow-hidden">
      <div className="px-3 py-2 border-b flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
          执行历史 · {runs.length}
        </div>
        {replayRunId && (
          <span className="text-[10px] text-amber-600 inline-flex items-center gap-1">
            <RotateCcw className="size-2.5" />
            回放中: {replayRunId.slice(0, 8)}
          </span>
        )}
      </div>
      {runs.length === 0 ? (
        <div className="px-3 py-6 text-[11px] text-muted-foreground text-center">
          暂无执行记录 · 点击「测试运行」开始第一次执行
        </div>
      ) : (
        <div className="max-h-[360px] overflow-y-auto">
          {runs.map((r) => {
            const status = r.status ?? "pending";
            return (
              <div
                key={r.id ?? r.startedAt}
                className="px-3 py-2 border-b last:border-b-0 hover:bg-muted/40 text-xs"
              >
                <div className="flex items-center gap-2">
                  <StatusIcon status={status} />
                  <Badge
                    variant="outline"
                    className={cn("text-[10px] px-1.5 py-0 ring-1", statusTone(status))}
                  >
                    {STATUS_LABEL[status] ?? status}
                  </Badge>
                  <span className="font-mono text-[10px] text-muted-foreground ml-auto">
                    {formatTime(r.startedAt)}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleReplay(r)}
                    title="在 DAG 上回放"
                    className="inline-flex items-center gap-0.5 text-[10px] text-primary hover:underline"
                  >
                    <Play className="size-2.5" />
                    回放
                  </button>
                </div>
                <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                  {r.durationMs != null && (
                    <span className="font-mono">{formatDuration(r.durationMs)}</span>
                  )}
                  {r.triggeredBy && (
                    <span className="inline-flex items-center gap-0.5">
                      <Clock className="size-2.5" />
                      {TRIGGER_LABEL[r.triggeredBy as keyof typeof TRIGGER_LABEL] ?? r.triggeredBy}
                    </span>
                  )}
                </div>
                {r.error && (
                  <div className="mt-1 text-[10px] text-rose-600 font-mono break-all line-clamp-2">
                    {r.error}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "completed") return <CheckCircle2 className="size-3 text-emerald-600" />;
  if (status === "failed") return <XCircle className="size-3 text-rose-600" />;
  if (status === "running") return <Loader2 className="size-3 text-sky-600 animate-spin" />;
  if (status === "cancelled") return <CircleAlert className="size-3 text-slate-500" />;
  return <Clock className="size-3 text-muted-foreground" />;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "排队",
  running: "执行中",
  completed: "已完成",
  failed: "失败",
  cancelled: "已取消",
  timeout: "超时",
};

const TRIGGER_LABEL = {
  user: "手动",
  bot: "Bot",
  cron: "定时",
  event: "事件",
  api: "API",
} as const;

function statusTone(status: string): string {
  if (status === "completed") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (status === "failed") return "bg-rose-50 text-rose-700 ring-rose-200";
  if (status === "running") return "bg-sky-50 text-sky-700 ring-sky-200";
  if (status === "timeout") return "bg-amber-50 text-amber-700 ring-amber-200";
  return "bg-slate-50 text-slate-700 ring-slate-200";
}

function formatTime(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatDuration(ms?: number): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${(ms / 60_000).toFixed(1)} min`;
}

export default RunHistoryPanel;
