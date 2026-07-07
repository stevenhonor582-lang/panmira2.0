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

  const handleSave = React.useCallback(async () => {
    if (!name.trim()) {
      setError("请先填写任务名称");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || undefined,
        status: "draft",
        config: {
          snapshot: snapshot ?? null,
          nodes: [],
          edges: [],
        },
      };
      const r = await api<{ success: boolean; data: { id: string } }>(
        "/api/v2/admin/pipelines",
        { method: "POST", body: payload },
      );
      const id = r?.data?.id;
      if (!id) throw new Error("服务端未返回任务 ID");
      router.push(`/tasks/${id}/`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      window.alert(`保存失败: ${msg}`);
    } finally {
      setSaving(false);
    }
  }, [name, description, snapshot, router]);

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
          />
        </section>
      </div>
    </div>
  );
}
