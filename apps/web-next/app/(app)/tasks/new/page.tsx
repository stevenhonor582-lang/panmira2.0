"use client";

/**
 * /tasks/new — DAG editor page (P7-B1).
 *
 * Layout:
 *   ┌──────────────── 100% ────────────────┐
 *   │ Header: title + back link             │
 *   ├───────────────────────────────────────┤
 *   │  TaskDagEditor (dynamic, ssr:false)   │
 *   │  onSave → POST /api/v2/admin/pipelines│
 *   └───────────────────────────────────────┘
 */

import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Save } from "lucide-react";

import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const TaskDagEditor = dynamic(
  () =>
    import("@/components/tasks/task-dag-editor").then((m) => m.TaskDagEditor),
  {
    ssr: false,
    loading: () => (
      <div className="h-[640px] grid place-items-center text-sm text-muted-foreground border border-dashed border-border rounded-xl bg-muted/20">
        <Loader2 className="size-4 animate-spin mr-2 inline-block" />
        DAG 编辑器加载中…
      </div>
    ),
  },
);

export default function NewTaskPage() {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [snapshot, setSnapshot] = React.useState<unknown>(null);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // R22: 第一次测试运行会触发自动保存,把生成的 pipelineId 记在这里。
  // 之后画布上的"测试运行"复用这个 id(避免每次测试都新建草稿)。
  const [savedPipelineId, setSavedPipelineId] = React.useState<string | undefined>();

  /**
   * R22 saveDraft — 创建草稿 pipeline,返回 id (不跳转)。
   * - 给"测试运行"用:TaskDagEditor 没 pipelineId 时通过 onSaveDraft 调用它。
   * - 给"保存草稿"按钮用:handleSave 先 saveDraft 拿 id,再 router.push 详情页。
   * 失败时返回 undefined,调用方自己决定如何提示。
   */
  const saveDraft = React.useCallback(async (): Promise<string | undefined> => {
    if (!name.trim()) {
      setError("请先填写任务名称");
      return undefined;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || undefined,
        status: "draft" as const,
        ...((): Record<string, unknown> => {
          // R22: 从 RF snapshot 抽 nodes/edges 填顶层(后端 trigger 读 rows[0].nodes)
          const doc = snapshot as { snapshot?: { nodes?: unknown[]; edges?: unknown[] } } | null;
          const rfNodes = (doc?.snapshot?.nodes ?? []) as Array<{ id?: string; position?: { x: number; y: number }; data?: Record<string, unknown> }>;
          const rfEdges = (doc?.snapshot?.edges ?? []) as Array<{ source?: string; target?: string; label?: string }>;
          const backendNodes = rfNodes.map((n) => ({
            id: String(n.id ?? ""),
            label: String(n.data?.label ?? n.data?.kind ?? "节点"),
            agentTemplateId: String(n.data?.refId ?? ""),
            type: "dagNode",
            position: n.position ?? { x: 0, y: 0 },
            config: { kind: n.data?.kind, meta: n.data ?? {} },
          }));
          const backendEdges = rfEdges.map((e) => ({
            from: String(e.source ?? ""),
            to: String(e.target ?? ""),
            ...(e.label ? { label: e.label } : {}),
          }));
          return {
            config: { snapshot: snapshot ?? null, nodes: backendNodes, edges: backendEdges },
            nodes: backendNodes,
            edges: backendEdges,
          };
        })(),
      };
      const r = await api<{ success: boolean; data: { id: string } }>(
        "/api/v2/admin/pipelines",
        { method: "POST", body: payload },
      );
      const id = r?.data?.id;
      if (!id) throw new Error("服务端未返回任务 ID");
      setSavedPipelineId(id);
      return id;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      return undefined;
    } finally {
      setSaving(false);
    }
  }, [name, description, snapshot]);

  const handleSave = React.useCallback(async () => {
    const id = await saveDraft();
    if (!id) {
      // saveDraft 已经把 error 写进 state;额外弹窗兜底
      window.alert(`保存失败: ${error ?? "未知错误"}`);
      return;
    }
    router.push(`/tasks/${id}/`);
  }, [saveDraft, router, error]);

  return (
    <div className="-m-6 h-[calc(100dvh-49px)] flex flex-col">
      <div className="flex flex-wrap items-start justify-between gap-3 px-6 pt-5 pb-3 border-b">
        <div>
          <Link
            href="/tasks"
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <ArrowLeft className="size-3" />
            返回任务列表
          </Link>
          <h1 className="text-xl font-semibold tracking-tight mt-1">
            新建任务
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            填写任务元信息,然后用 DAG 画布编排节点 / 触发器 / 调度。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => router.push("/tasks")}
            disabled={saving}
          >
            取消
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Save className="size-3.5" />
            )}
            保存草稿
          </Button>
        </div>
      </div>

      <div className="grid gap-4 px-6 py-4 lg:grid-cols-[280px_1fr] flex-1 min-h-0">
        <aside className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="task-name" className="text-xs">
              任务名称
            </Label>
            <Input
              id="task-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如 · 客户意向分类"
              className="h-9"
              maxLength={120}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-desc" className="text-xs">
              描述
            </Label>
            <textarea
              id="task-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="这个任务做什么 / 触发条件 / 期望产出"
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              rows={4}
            />
          </div>
          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 text-rose-700 px-3 py-2 text-xs">
              {error}
            </div>
          )}
          <div className="rounded-lg bg-muted/30 px-3 py-2 text-[11px] font-mono text-muted-foreground">
            保存后将跳转到 /tasks/{`{id}`}/
          </div>
        </aside>

        <section className="min-h-0 min-w-0">
          <TaskDagEditor
            readOnly={false}
            onChange={(value) => setSnapshot(value)}
            initialValue={null}
            pipelineId={savedPipelineId}
            onSaveDraft={saveDraft}
          />
        </section>
      </div>
    </div>
  );
}
