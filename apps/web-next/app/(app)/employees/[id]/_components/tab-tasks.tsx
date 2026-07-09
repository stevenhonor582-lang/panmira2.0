"use client";

import * as React from "react";
import { useAgent } from "../../_lib/data";
import { api } from "@/lib/api";
import { ResourcePicker, type ResourceItem } from "@/components/resource-picker/resource-picker";
import { ListChecks, LinkIcon, UnlinkIcon, Loader2, X, Plus } from "lucide-react";

/**
 * R26-B: 任务 tab — 已绑定列表 + ResourcePicker 添加(搜索+选择)。
 *
 * 用户反馈:"可绑定/已绑定在屏幕上操作,任务过多难发现。
 *           应该单独走流程:搜索+呈现+选择。"
 *
 * 改动:
 * - 已绑定:列表 + 解绑按钮(保留)
 * - 可绑定:**不在屏幕内堆**;点"添加任务" → 弹 ResourcePicker,搜索过滤后批量绑定
 * - 数据源不变:
 *   - GET /api/v2/admin/pipelines
 *   - PATCH /api/v2/admin/pipelines/:id (改 nodes 数组 → 绑定/解绑)
 */

interface PipelineNode {
  id: string;
  label: string;
  agentTemplateId: string;
  [key: string]: unknown;
}

interface Pipeline {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  nodes: PipelineNode[];
  createdAt: string;
  updatedAt: string;
}

export function TabTasks({ id }: { id: string }) {
  const { agent, loading } = useAgent(id);
  const [pipelines, setPipelines] = React.useState<Pipeline[]>([]);
  const [loadingPipelines, setLoadingPipelines] = React.useState(true);
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [batchPending, setBatchPending] = React.useState(false);

  const loadPipelines = React.useCallback(async () => {
    setLoadingPipelines(true);
    try {
      const res = await api<{ data?: Pipeline[] } | Pipeline[]>(
        "/api/v2/admin/pipelines",
      );
      const items = (res as any)?.data ?? (Array.isArray(res) ? res : []);
      setPipelines(items);
    } catch {
      setPipelines([]);
    } finally {
      setLoadingPipelines(false);
    }
  }, []);

  React.useEffect(() => {
    void loadPipelines();
  }, [loadPipelines]);

  if (loading) return <div className="h-48 rounded-2xl bg-muted/40 animate-pulse" />;
  if (!agent) return null;

  const isBound = (p: Pipeline): boolean =>
    Array.isArray(p.nodes) && p.nodes.some((n) => n.agentTemplateId === agent.id);

  const bound = pipelines.filter(isBound);
  const available = pipelines.filter((p) => !isBound(p));

  /** 解绑:从 pipeline 删掉引用本 agent 的 node */
  const handleUnbind = async (pipeline: Pipeline) => {
    setPendingId(pipeline.id);
    try {
      const nextNodes = (pipeline.nodes || []).filter(
        (n) => n.agentTemplateId !== agent.id,
      );
      await api(`/api/v2/admin/pipelines/${pipeline.id}`, {
        method: "PATCH",
        body: { nodes: nextNodes },
      });
      await loadPipelines();
    } catch (e) {
      console.error("[tasks] unbind failed:", e);
    } finally {
      setPendingId(null);
    }
  };

  /** 批量绑定:ResourcePicker onConfirm */
  const handleBatchBind = async (selected: ResourceItem[]) => {
    if (selected.length === 0) return;
    setBatchPending(true);
    try {
      const newNode: PipelineNode = {
        id: `n-${agent.id.slice(0, 8)}-${Date.now().toString(36)}`,
        label: agent.displayName,
        agentTemplateId: agent.id,
      };
      // 串行 PATCH 每个 pipeline,任一失败 console.error 但不打断其余
      await Promise.all(
        selected.map(async (s) => {
          const pipeline = pipelines.find((p) => p.id === s.id);
          if (!pipeline) return;
          const nextNodes = [...(pipeline.nodes || []), newNode];
          try {
            await api(`/api/v2/admin/pipelines/${pipeline.id}`, {
              method: "PATCH",
              body: { nodes: nextNodes },
            });
          } catch (e) {
            console.error(`[tasks] bind ${pipeline.id} failed:`, e);
          }
        }),
      );
      await loadPipelines();
    } finally {
      setBatchPending(false);
    }
  };

  // ResourcePicker items:只把可绑定的 pipelines 喂给选择器(屏蔽已绑定)
  const pickerItems: ResourceItem[] = available.map((p) => ({
    id: p.id,
    label: p.name,
    description: p.description || `${Array.isArray(p.nodes) ? p.nodes.length : 0} 个节点`,
  }));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-4">
        <div>
          <h3 className="flex items-center gap-2 text-[13px] font-medium tracking-tight text-foreground/65">
            <ListChecks className="size-4 text-foreground/45" />
            任务绑定 · Pipelines
          </h3>
          <p className="mt-1 text-[13px] text-foreground/55 max-w-[60ch]">
            这位员工被哪些 pipeline 雇佣。点"添加任务"从库里搜索后批量绑定。
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] text-foreground/40">
            {bound.length} 条已绑定 · {available.length} 条可绑定
          </span>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            disabled={available.length === 0 || loadingPipelines}
            data-testid="tasks-add-open-picker"
            className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground ring-1 ring-primary/30 transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="size-3.5" />
            添加任务
          </button>
        </div>
      </header>

      {loadingPipelines ? (
        <div className="rounded-2xl bg-muted/40 p-8 text-center text-[13px] text-foreground/50">
          <Loader2 className="mx-auto mb-2 size-4 animate-spin" />
          加载 pipelines…
        </div>
      ) : (
        <section>
          <h4 className="mb-3 flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-[0.18em] text-foreground/55">
            <LinkIcon className="size-3.5" /> 已绑定
          </h4>
          <BoundTable
            rows={bound}
            pendingId={pendingId}
            onUnbind={handleUnbind}
            onAddMore={() => setPickerOpen(true)}
          />
        </section>
      )}

      <ResourcePicker
        open={pickerOpen}
        onOpenChange={(v) => !batchPending && setPickerOpen(v)}
        title={`添加任务到「${agent.displayName}」`}
        items={pickerItems}
        selectedIds={[]}
        onConfirm={(sel) => void handleBatchBind(sel)}
        loading={batchPending}
        multi
        confirmText={`绑定 ${pickerItems.length > 0 ? "(选中的)" : ""}`}
        placeholder="搜索任务名或描述…"
      />
    </div>
  );
}

function BoundTable({
  rows,
  pendingId,
  onUnbind,
  onAddMore,
}: {
  rows: Pipeline[];
  pendingId: string | null;
  onUnbind: (p: Pipeline) => Promise<void>;
  onAddMore: () => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-8 text-center">
        <UnlinkIcon className="mx-auto mb-3 size-5 text-foreground/35" />
        <p className="text-[13px] text-foreground/55">尚未绑定任何任务</p>
        <p className="mt-1 text-[12px] text-foreground/40">点右上方"添加任务"从库里搜索后绑定。</p>
        <button
          type="button"
          onClick={onAddMore}
          className="mt-4 inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          data-testid="tasks-empty-add"
        >
          <Plus className="size-3.5" /> 添加任务
        </button>
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-2xl ring-1 ring-border">
      <table className="w-full table-fixed text-[13.5px]">
        <colgroup>
          <col className="w-[5%]" />
          <col />
          <col className="w-[12%]" />
          <col className="w-[20%]" />
          <col className="w-[10%]" />
        </colgroup>
        <thead className="bg-muted/40 text-left text-[10.5px] font-mono uppercase tracking-[0.18em] text-foreground/45">
          <tr>
            <th className="px-4 py-3">#</th>
            <th className="px-4 py-3">名称</th>
            <th className="px-4 py-3">节点</th>
            <th className="px-4 py-3">最近更新</th>
            <th className="px-4 py-3 text-right">操作</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p, i) => {
            const isPending = pendingId === p.id;
            const nodeCount = Array.isArray(p.nodes) ? p.nodes.length : 0;
            return (
              <tr key={p.id} className="border-t border-border hover:bg-muted/30">
                <td className="px-4 py-3 font-mono text-foreground/40 tabular-nums">
                  {(i + 1).toString().padStart(2, "0")}
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium">{p.name}</div>
                  {p.description && (
                    <div className="mt-0.5 text-[11.5px] text-foreground/45 line-clamp-1">
                      {p.description}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className="font-mono text-[12px] tabular-nums text-foreground/65">
                    {nodeCount} 节点
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-[12px] text-foreground/65">
                  {p.updatedAt
                    ? new Date(p.updatedAt).toLocaleString("zh-CN", { hour12: false })
                    : "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => void onUnbind(p)}
                    data-testid={`unbind-${p.id.slice(0, 8)}`}
                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[12px] font-medium ring-1 ring-destructive/30 text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                  >
                    {isPending ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <X className="size-3" />
                    )}
                    解绑
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
