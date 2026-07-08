"use client";

/**
 * /tasks/[id] — task detail page (R13-D deepening).
 *
 * Layout:
 *   ┌────────────────────── 70% ──────────────────┬──── 30% ────┐
 *   │ Title · status · meta                          │ Bindings   │
 *   │ Real tldraw DAG editor (viewer + replay)       │ Run history│
 *   │                                                │ Live log   │
 *   └────────────────────────────────────────────────┴────────────┘
 */

import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ChevronLeft,
  CircleAlert,
  Edit3,
  Loader2,
  Save,
} from "lucide-react";

import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { ExecutionLogPanel } from "@/components/tasks/execution-log-panel";
import { TaskBindingPanel } from "@/components/tasks/task-binding-panel";
import { RunHistoryPanel } from "@/components/tasks/run-history-panel";
import {
  TASK_STATUS_LABEL,
  TASK_STATUS_TONE,
  type TaskStatus,
} from "@/components/tasks/types";

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
  triggerConfig?: { snapshot?: unknown; botId?: string } | null;
}

export default function TaskDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;

  const [pipeline, setPipeline] = React.useState<RawPipeline | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [draftDoc, setDraftDoc] = React.useState<unknown>(null);

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

  const handleSave = React.useCallback(async () => {
    if (!id || !draftDoc) return;
    setSaving(true);
    try {
      const doc = draftDoc as {
        snapshot?: unknown;
        nodes?: unknown[];
        edges?: unknown[];
        botId?: string;
      };
      await api(`/api/v2/admin/pipelines/${id}`, {
        method: "PATCH",
        body: {
          nodes: doc.nodes ?? [],
          edges: doc.edges ?? [],
          triggerConfig: {
            snapshot: doc.snapshot,
            botId: doc.botId,
            schema: "r13d-dag-v1",
          },
        },
      });
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }, [id, draftDoc]);

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
  const snapshot = cfg?.snapshot ?? pipeline.triggerConfig?.snapshot ?? null;

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
          <div className="text-[11px] text-muted-foreground mt-1 font-mono">
            {Array.isArray(nodeCount) ? nodeCount.length : 0} 节点 ·{" "}
            {Array.isArray(edgeCount) ? edgeCount.length : 0} 边 ·{" "}
            {formatDate(pipeline.updatedAt ?? pipeline.createdAt)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Save className="size-3.5" />
            )}
            保存
          </Button>
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
            variant="editor"
            pipelineId={id}
            initialSnapshot={snapshot}
            initialName={pipeline.name}
            onChange={(doc) => setDraftDoc(doc)}
          />
        </div>

        <div className="w-[360px] shrink-0 overflow-y-auto border-l bg-muted/10 p-3 space-y-3">
          <TaskBindingPanel pipelineId={id} embedded />
          <RunHistoryPanel pipelineId={id} />
          <div className="rounded-lg ring-1 ring-foreground/10 bg-card overflow-hidden">
            <div className="h-[280px]">
              <ExecutionLogPanel pipelineId={id} />
            </div>
          </div>
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
