"use client";

/**
 * Right-rail execution log panel for the task detail page.
 *
 * - Subscribes to `usePipelineProgress(pipelineId)` (WS-driven) for live status.
 * - On mount, fetches historical runs from `/api/v2/admin/pipelines/{id}/runs`
 *   and merges them as an initial timeline.
 * - Renders a vertical timeline; each run entry can be expanded to show
 *   per-node breakdown (R21) via NodeRunDetails (input/output/branch/...).
 */

import * as React from "react";
import {
  CheckCircle2,
  CircleAlert,
  Clock,
  Loader2,
  Radio,
  Play,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

import { usePipelineProgress } from "@/lib/use-pipeline-progress";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";

import type { PipelineRun } from "./types";
import { NodeRunDetails, type NodeRunState } from "./node-run-details";

interface ExecutionLogPanelProps {
  pipelineId: string;
  onTrigger?: () => Promise<void> | void;
}

/** 一条 run 的时间线条目。携带完整 nodeStates 供展开用。 */
interface TimelineEntry {
  id: string;
  ts: string;
  status: PipelineRun["status"] | "running";
  message: string;
  source: "ws" | "history";
  error?: string;
  /** 完成节点数(用于消息文案) */
  completedNodes?: number;
  /** 总节点数 */
  totalNodes?: number;
  /** R21: 每节点执行状态 — key = nodeId */
  nodeStates?: Record<string, NodeRunState>;
  /** R21: 用于把 nodeId 映射成人类可读 label(若后端给了) */
}

const STATUS_LABEL: Record<string, string> = {
  pending: "排队中",
  running: "执行中",
  completed: "已完成",
  failed: "失败",
  timeout: "超时",
  cancelled: "已取消",
  waiting_for_human: "待真人决策",
};

export function ExecutionLogPanel({
  pipelineId,
  onTrigger,
}: ExecutionLogPanelProps) {
  const { state, wsConnected } = usePipelineProgress(pipelineId);
  const [history, setHistory] = React.useState<TimelineEntry[]>([]);
  const [triggering, setTriggering] = React.useState(false);

  // Load run history once.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = (await api(`/api/v2/admin/pipelines/${pipelineId}/runs`)) as {
          // backend may return either data: Run[] or data: { runs: Run[] }
          data?:
            | Array<PipelineRun & { nodeStates?: Record<string, NodeRunState> }>
            | { runs?: Array<PipelineRun & { nodeStates?: Record<string, NodeRunState> }> };
        };
        if (cancelled) return;
        const data = res?.data;
        const runs = Array.isArray(data)
          ? data
          : (data?.runs ?? []);
        setHistory(
          runs.map<TimelineEntry>((r) => ({
            id: r.id ?? `${r.startedAt}-${r.status}`,
            ts: r.startedAt ?? new Date().toISOString(),
            status: r.status ?? "pending",
            message:
              r.status === "completed"
                ? `已完成${r.finishedAt ? ` · 耗时 ${formatDuration(r.startedAt, r.finishedAt)}` : ""}`
                : r.status === "failed"
                  ? `失败 · ${r.error ?? "未知错误"}`
                  : `${STATUS_LABEL[r.status ?? "pending"] ?? "已记录"}`,
            source: "history",
            error: r.error ?? undefined,
            nodeStates: r.nodeStates,
          })),
        );
      } catch {
        // Endpoint may not exist — start with empty timeline.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pipelineId]);

  const wsEntry: TimelineEntry | null = state.lastUpdate
    ? {
        id: state.runId ?? `ws-${state.lastUpdate}`,
        ts: state.lastUpdate,
        status:
          state.status === "completed" || state.status === "failed"
            ? state.status
            : state.status === "running"
              ? "running"
              : "pending",
        message:
          state.status === "completed"
            ? `已完成 · ${state.completedNodes}/${state.totalNodes} 节点`
            : state.status === "failed"
              ? `失败 · ${state.error ?? "未知"}`
              : `运行中 · ${state.completedNodes}/${state.totalNodes}`,
        source: "ws",
        error: state.error ?? undefined,
        completedNodes: state.completedNodes,
        totalNodes: state.totalNodes,
        // R22: WS 直接推 nodeStates(后端 emitPipelineProgress 把 merged 一起广播),
        // 展开节点详情时无需再 GET /runs/:rid,实时刷新。
        nodeStates: state.nodeStates,
      }
    : null;

  const entries = React.useMemo(() => {
    const all = [...(wsEntry ? [wsEntry] : []), ...history];
    return all.sort((a, b) => +new Date(b.ts) - +new Date(a.ts));
  }, [wsEntry, history]);

  const handleTrigger = async () => {
    if (!onTrigger) return;
    setTriggering(true);
    try {
      await onTrigger();
    } finally {
      setTriggering(false);
    }
  };

  return (
    <div className="flex flex-col h-full border-l bg-muted/10">
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">执行日志</div>
          <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1.5">
            <Radio
              className={cn(
                "size-2.5",
                wsConnected ? "text-emerald-500" : "text-amber-500",
              )}
            />
            {wsConnected ? "WS 已连接 · 实时" : "WS 未连接 · 仅历史"}
            <span className="ml-1">· 点击条目展开节点详情</span>
          </div>
        </div>
        {onTrigger && (
          <Button size="xs" variant="outline" onClick={handleTrigger} disabled={triggering}>
            {triggering ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Play className="size-3" />
            )}
            触发一次
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-3 space-y-2">
          {entries.length === 0 && (
            <div className="text-xs text-muted-foreground px-2 py-8 text-center border border-dashed rounded-md">
              暂无执行记录 · 触发一次运行后会在此显示
            </div>
          )}
          {entries.map((e) => (
            <TimelineRow key={e.id} entry={e} />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function TimelineRow({ entry }: { entry: TimelineEntry }) {
  const tone = entryTone(entry.status);
  const Icon =
    entry.status === "failed"
      ? CircleAlert
      : entry.status === "completed"
        ? CheckCircle2
        : entry.status === "running"
          ? Loader2
          : Clock;

  // R21: 展开 = 显示本次 run 的节点级明细
  const [expanded, setExpanded] = React.useState(false);
  const nodeEntries = React.useMemo(() => {
    if (!entry.nodeStates) return [];
    return Object.entries(entry.nodeStates);
  }, [entry.nodeStates]);
  const hasNodes = nodeEntries.length > 0;
  const successCount = nodeEntries.filter(([, s]) => s?.status === "success").length;
  const failedCount = nodeEntries.filter(([, s]) => s?.status === "failed").length;

  return (
    <div className="rounded-md ring-1 ring-foreground/5 bg-card overflow-hidden">
      {/* 头部:状态 + 时间 + 展开按钮 */}
      <button
        type="button"
        onClick={() => hasNodes && setExpanded((v) => !v)}
        disabled={!hasNodes}
        className={cn(
          "w-full flex gap-2 items-start p-2 text-left",
          hasNodes && "hover:bg-muted/40 transition-colors cursor-pointer",
        )}
      >
        <div className="mt-0.5 shrink-0 grid place-items-center size-5 rounded-full ring-1 ring-foreground/10 bg-background">
          <Icon
            className={cn("size-3", tone.icon, entry.status === "running" && "animate-spin")}
            strokeWidth={2}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", tone.badge)}>
              {STATUS_LABEL[entry.status ?? ""] ?? entry.status}
            </Badge>
            {entry.source === "ws" && (
              <span className="text-[10px] text-emerald-600 font-mono">LIVE</span>
            )}
            {hasNodes && (
              <span className="text-[10px] text-muted-foreground font-mono">
                {successCount}/{nodeEntries.length} 节点
                {failedCount > 0 && (
                  <span className="text-rose-600 ml-1">· {failedCount} 失败</span>
                )}
              </span>
            )}
            <span className="text-[10px] text-muted-foreground font-mono ml-auto">
              {formatTs(entry.ts)}
            </span>
            {hasNodes && (
              <span className="text-muted-foreground shrink-0">
                {expanded ? (
                  <ChevronDown className="size-3.5" />
                ) : (
                  <ChevronRight className="size-3.5" />
                )}
              </span>
            )}
          </div>
          <div className="text-xs mt-1 leading-snug">{entry.message}</div>
          {entry.error && (
            <div className="text-[10px] text-rose-600 mt-1 font-mono break-all">
              {entry.error}
            </div>
          )}
          {!hasNodes && (
            <div className="text-[10px] text-muted-foreground/70 mt-0.5">
              无节点明细(可能是早期 run 未保存 node_states)
            </div>
          )}
        </div>
      </button>
      {/* 展开后:每个节点一个 NodeRunDetails */}
      {expanded && hasNodes && (
        <div className="px-3 pb-3 pt-1 border-t border-foreground/5 space-y-2 bg-muted/10">
          {nodeEntries.map(([nodeId, st]) => (
            <div key={nodeId} className="border-l-2 border-foreground/10 pl-2.5">
              <div className="text-[10px] font-mono text-muted-foreground mb-1">
                {nodeId}
              </div>
              <NodeRunDetails state={st} compact />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function entryTone(status: TimelineEntry["status"]): { badge: string; icon: string } {
  if (status === "completed")
    return {
      badge: "bg-emerald-50 text-emerald-700 ring-emerald-200",
      icon: "text-emerald-600",
    };
  if (status === "failed")
    return {
      badge: "bg-rose-50 text-rose-700 ring-rose-200",
      icon: "text-rose-600",
    };
  if (status === "running")
    return {
      badge: "bg-sky-50 text-sky-700 ring-sky-200",
      icon: "text-sky-600",
    };
  return {
    badge: "bg-slate-50 text-slate-700 ring-slate-200",
    icon: "text-slate-500",
  };
}

function formatTs(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return iso;
  }
}

function formatDuration(start?: string, end?: string): string {
  if (!start || !end) return "—";
  const ms = +new Date(end) - +new Date(start);
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${(ms / 60_000).toFixed(1)} min`;
}

// Local cn import — keep self-contained to avoid cross-component imports.
function cn(...args: Array<string | false | null | undefined>) {
  return args.filter(Boolean).join(" ");
}
