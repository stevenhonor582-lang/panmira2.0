"use client";

/**
 * /tasks/[id] — task detail page.
 *
 * Layout (two-column, 70/30):
 *   ┌──────────────────────── 70% ─────────────────────┬── 30% ──┐
 *   │ Title · status · meta row                          │         │
 *   │ Read-only DAG viewer (tldraw)                      │  Log    │
 *   │                                                    │  panel  │
 *   └────────────────────────────────────────────────────┴─────────┘
 *
 * - Fetches /api/v2/admin/pipelines/{id} for metadata + snapshot.
 * - Falls back to a "未找到" empty state on 404.
 */

import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Bot,
  Calendar,
  ChevronLeft,
  CircleAlert,
  Edit3,
  Loader2,
  UserRound,
} from "lucide-react";

import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { ExecutionLogPanel } from "@/components/tasks/execution-log-panel";
import {
  TASK_STATUS_LABEL,
  TASK_STATUS_TONE,
  type TaskStatus,
} from "@/components/tasks/types";
import { triggerPipelineAsync } from "@/lib/pipeline-trigger";

const TaskDagEditor = dynamic(
  () => import("@/components/tasks/task-dag-editor").then((m) => m.TaskDagEditor),
  {
    ssr: false,
    loading: () => (
      <div className="h-[640px] grid place-items-center text-sm text-muted-foreground border rounded-xl">
        DAG 加载中…
      </div>
    ),
  },
);

interface RawPipeline {
  id: string;
  name?: string;
  description?: string;
  status?: string;
  triggerType?: string;
  nodes?: unknown[];
  edges?: unknown[];
  ownerId?: string;
  ownerName?: string;
  updatedAt?: string;
  createdAt?: string;
  config?: {
    snapshot?: unknown;
    botId?: string;
    nodes?: Array<{ shapeId: string; meta?: { label?: string } }>;
    edges?: unknown[];
  } | null;
}

export default function TaskDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;

  const [pipeline, setPipeline] = React.useState<RawPipeline | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const res = (await api(`/api/v2/admin/pipelines/${id}`)) as {
          data?: RawPipeline;
        };
        if (cancelled) return;
        setPipeline(res?.data ?? null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "加载失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleTrigger = React.useCallback(async () => {
    if (!id) return;
    try {
      const r = await triggerPipelineAsync(
        { pipelineId: id, triggeredBy: "user" },
        fetch,
      );
      // Best-effort toast via window.alert (no toast lib yet).
      if (r.kind === "accepted") {
        // WS will pick up the progress.
      } else if (r.kind === "failed") {
        window.alert(`运行失败: ${r.error}`);
      }
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "触发失败");
    }
  }, [id]);

  if (loading) {
    return (
      <div className="grid place-items-center py-24 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin mr-2 inline-block" />
        加载任务中…
      </div>
    );
  }

  if (error || !pipeline) {
    return (
      <div className="space-y-4">
        <Link
          href="/tasks"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ChevronLeft className="size-3" />
          返回任务列表
        </Link>
        <div className="rounded-lg border border-rose-200 bg-rose-50 text-rose-700 px-4 py-6 text-sm flex items-center gap-2">
          <CircleAlert className="size-4" />
          {error ? `加载失败 · ${error}` : "任务不存在或已被删除"}
        </div>
      </div>
    );
  }

  const status = normalizeStatus(pipeline.status);
  const cfg = pipeline.config ?? null;
  const nodeCount = (cfg?.nodes ?? pipeline.nodes ?? []) as unknown[];
  const edgeCount = (cfg?.edges ?? pipeline.edges ?? []) as unknown[];

  return (
    <div className="-m-6 h-[calc(100dvh-49px)] flex flex-col">
      <div className="flex flex-wrap items-start justify-between gap-3 px-6 pt-5 pb-3 border-b">
        <div>
          <Link
            href="/tasks"
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <ChevronLeft className="size-3" />
            返回任务列表
          </Link>
          <h1 className="text-xl font-semibold tracking-tight mt-1 flex items-center gap-2">
            {pipeline.name ?? "未命名任务"}
            <Badge
              variant="outline"
              className={cn("text-[10px] px-1.5 py-0 ring-1", TASK_STATUS_TONE[status])}
            >
              {TASK_STATUS_LABEL[status]}
            </Badge>
          </h1>
          <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
            {cfg?.botId && (
              <span className="flex items-center gap-1">
                <Bot className="size-3" />
                {cfg.botId}
              </span>
            )}
            {pipeline.ownerName && (
              <span className="flex items-center gap-1">
                <UserRound className="size-3" />
                {pipeline.ownerName}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Calendar className="size-3" />
              {formatDate(pipeline.updatedAt ?? pipeline.createdAt)}
            </span>
            <span className="font-mono">
              {Array.isArray(nodeCount) ? nodeCount.length : 0} 节点 ·{" "}
              {Array.isArray(edgeCount) ? edgeCount.length : 0} 边
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => router.push(`/tasks/${id}/edit`)}
          >
            <Edit3 className="size-3.5" />
            编辑
          </Button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="flex-1 min-w-0 p-4">
          <TaskDagEditor
            variant="viewer"
            initialName={pipeline.name}
            initialSnapshot={cfg?.snapshot ?? null}
            initialBotId={cfg?.botId}
            hideToolbar
          />
        </div>
        <div className="w-[340px] shrink-0">
          {id && <ExecutionLogPanel pipelineId={id} onTrigger={handleTrigger} />}
        </div>
      </div>
    </div>
  );
}

function normalizeStatus(s?: string): TaskStatus {
  switch (s) {
    case "active":
      return "ready";
    case "running":
      return "running";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "paused":
    case "archived":
      return "paused";
    default:
      return "ready";
  }
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}