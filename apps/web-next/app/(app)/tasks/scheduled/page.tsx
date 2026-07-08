"use client";

/**
 * /tasks/scheduled — cron + event-triggered jobs.
 *
 * - Fetches /api/schedule (canonical jobs list).
 * - Each row: name, cron, trigger type, next-run, enable toggle (2-click).
 */

import * as React from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Calendar,
  CircleAlert,
  Loader2,
  Pause,
  Play,
  Plus,
  Zap,
} from "lucide-react";

import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { ScheduledJobCreateModal } from "@/components/tasks/scheduled-job-create-modal";
import type { ScheduledJob } from "@/components/tasks/types";

interface RawJob extends ScheduledJob {
  enabled?: boolean;
  nextRunAt?: string;
  pipelineId?: string;
}

const TRIGGER_LABEL: Record<string, string> = {
  cron: "Cron",
  event: "事件",
  manual: "手动",
};

export default function ScheduledTasksPage() {
  const [jobs, setJobs] = React.useState<RawJob[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [pendingToggle, setPendingToggle] = React.useState<string | null>(null);
  // R16-3: 启用"新建调度" → 从已有任务选 modal (不跳 /tasks/new)
  const [createOpen, setCreateOpen] = React.useState(false);

  const reload = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // R16-3: 优先调规范接口 /api/v2/admin/scheduled-jobs, 失败 fallback /api/schedule
      let list: RawJob[] = [];
      try {
        const res = (await api("/api/v2/admin/scheduled-jobs")) as {
          data?: RawJob[] | { jobs?: RawJob[] };
        };
        const d = res?.data;
        if (Array.isArray(d)) list = d;
        else if (d && Array.isArray((d as { jobs?: RawJob[] }).jobs))
          list = (d as { jobs?: RawJob[] }).jobs ?? [];
      } catch {
        // fallback
      }
      if (list.length === 0) {
        const res = (await api("/api/schedule")) as {
          data?: { jobs?: RawJob[] } | RawJob[];
        };
        list = Array.isArray(res?.data)
          ? (res?.data as RawJob[])
          : ((res?.data as { jobs?: RawJob[] })?.jobs ?? []);
      }
      setJobs(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    reload();
  }, [reload]);

  const handleToggle = async (job: RawJob) => {
    if (!job.id) return;
    if (pendingToggle === job.id) {
      // Second click — confirm.
      setPendingToggle(null);
      try {
        await api(`/api/schedule/${job.id}`, {
          method: "PATCH",
          body: { enabled: !job.enabled },
        });
        // Optimistic update.
        setJobs((prev) =>
          prev.map((j) => (j.id === job.id ? { ...j, enabled: !j.enabled } : j)),
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "更新失败");
      }
    } else {
      setPendingToggle(job.id);
      window.setTimeout(() => setPendingToggle((p) => (p === job.id ? null : p)), 3500);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">定时任务</h1>
          <p className="text-sm text-muted-foreground mt-1">
            cron 调度 · 事件触发 · 失败重试
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          新建调度
        </Button>
      </div>

      {loading ? (
        <div className="grid place-items-center py-16 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin mr-2 inline-block" />
          加载调度中…
        </div>
      ) : error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 text-rose-700 px-4 py-3 text-sm flex items-center gap-2">
          <CircleAlert className="size-4" />
          {error}
        </div>
      ) : jobs.length === 0 ? (
        <EmptyState onCreate={() => setCreateOpen(true)} />
      ) : (
        <div className="rounded-md ring-1 ring-foreground/10 bg-card overflow-hidden">
          <div className="px-4 py-2 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground border-b bg-muted/20 grid grid-cols-12 gap-3">
            <div className="col-span-4">任务</div>
            <div className="col-span-2">触发</div>
            <div className="col-span-3">Cron</div>
            <div className="col-span-2">下次执行</div>
            <div className="col-span-1 text-right">状态</div>
          </div>
          {jobs.map((j) => (
            <ScheduledRow
              key={j.id}
              job={j}
              isPending={pendingToggle === j.id}
              onToggle={() => handleToggle(j)}
            />
          ))}
        </div>
      )}

      <div className="text-[11px] text-muted-foreground">
        共 <strong className="text-foreground font-mono">{jobs.length}</strong> 个调度 ·{" "}
        启用 <strong className="text-emerald-600 font-mono">{jobs.filter((j) => j.enabled !== false).length}</strong> ·{" "}
        暂停 <strong className="text-amber-600 font-mono">{jobs.filter((j) => j.enabled === false).length}</strong>
      </div>

      <ScheduledJobCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={reload}
      />
    </div>
  );
}

interface RowProps {
  job: RawJob;
  isPending: boolean;
  onToggle: () => void;
}

function ScheduledRow({ job, isPending, onToggle }: RowProps) {
  const enabled = job.enabled !== false;
  const nextRun = job.nextRunAt;
  return (
    <div className="px-4 py-2.5 border-b last:border-b-0 hover:bg-muted/30 transition-colors grid grid-cols-12 gap-3 items-center">
      <div className="col-span-4 min-w-0">
        <Link
          href={job.pipelineId ? `/tasks/${job.pipelineId}` : "/tasks"}
          className="text-sm font-medium hover:underline flex items-center gap-1.5"
        >
          {job.name ?? "未命名调度"}
          {job.pipelineId && <ArrowUpRight className="size-3 opacity-50" />}
        </Link>
        {job.description && (
          <div className="text-[11px] text-muted-foreground truncate mt-0.5">
            {job.description}
          </div>
        )}
      </div>
      <div className="col-span-2">
        <Badge variant="outline" className="text-[10px] gap-1">
          {job.triggerType === "cron" ? (
            <Calendar className="size-3" />
          ) : (
            <Zap className="size-3" />
          )}
          {TRIGGER_LABEL[job.triggerType ?? "manual"] ?? job.triggerType}
        </Badge>
      </div>
      <div className="col-span-3 font-mono text-xs text-foreground/80 truncate">
        {job.cronExpression ?? <span className="text-foreground/30">—</span>}
      </div>
      <div className="col-span-2 text-[11px] text-muted-foreground font-mono">
        {nextRun ? formatNext(nextRun) : "—"}
      </div>
      <div className="col-span-1 flex justify-end">
        <button
          type="button"
          onClick={onToggle}
          className={`inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-md ring-1 transition-all active:translate-y-px ${
            enabled
              ? "bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-emerald-100"
              : "bg-amber-50 text-amber-700 ring-amber-200 hover:bg-amber-100"
          } ${isPending ? "ring-2 ring-foreground/40" : ""}`}
          title={isPending ? "再次点击确认" : enabled ? "点击暂停" : "点击启用"}
        >
          {enabled ? (
            <>
              <Play className="size-3" />
              启用
            </>
          ) : (
            <>
              <Pause className="size-3" />
              暂停
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="grid place-items-center py-20 border border-dashed rounded-lg bg-muted/10">
      <div className="text-center space-y-3 max-w-sm">
        <div className="grid place-items-center mx-auto size-12 rounded-full bg-muted">
          <Calendar className="size-5 text-muted-foreground" />
        </div>
        <div className="text-sm font-medium">暂无定时任务</div>
        <div className="text-xs text-muted-foreground">
          从已有的 DAG 任务中选一个,绑定 cron 或事件触发器,即可在指定时间自动执行。
        </div>
        <button
          type="button"
          onClick={onCreate}
          className={cn(
            "inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg text-sm font-medium",
            "border border-border bg-background hover:bg-muted hover:text-foreground transition-all active:translate-y-px",
          )}
        >
          <Plus className="size-3.5" />
          新建定时任务
        </button>
      </div>
    </div>
  );
}

function formatNext(iso: string): string {
  try {
    const diff = +new Date(iso) - Date.now();
    if (diff < 0) return "已过期";
    if (diff < 60_000) return `${Math.floor(diff / 1000)} 秒`;
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时`;
    return new Date(iso).toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}