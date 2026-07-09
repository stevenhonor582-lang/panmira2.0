"use client";

import * as React from "react";
import { useAgent } from "../../_lib/data";
import { api } from "@/lib/api";
import { ListChecks, LinkIcon, UnlinkIcon, Loader2, Check, X } from "lucide-react";

/**
 * R24: 任务 tab — 真实 pipeline 绑定/解绑。
 * 数据来源:
 *   - GET /api/v2/admin/pipelines               (全量 pipeline)
 *   - PATCH /api/v2/admin/pipelines/:id          (改 nodes 数组 → 绑定/解绑)
 *
 * 绑定判断:pipeline.nodes 里是否有 node.agentTemplateId === agent.id。
 * 绑定 = 加 node;解绑 = 删 node。
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

  /** 绑定:给 pipeline 加一个 node 引用本 agent */
  const handleBind = async (pipeline: Pipeline) => {
    setPendingId(pipeline.id);
    try {
      const newNode: PipelineNode = {
        id: `n-${agent.id.slice(0, 8)}-${Date.now().toString(36)}`,
        label: agent.displayName,
        agentTemplateId: agent.id,
      };
      const nextNodes = [...(pipeline.nodes || []), newNode];
      await api(`/api/v2/admin/pipelines/${pipeline.id}`, {
        method: "PATCH",
        body: { nodes: nextNodes },
      });
      await loadPipelines();
    } catch (e) {
      console.error("[tasks] bind failed:", e);
    } finally {
      setPendingId(null);
    }
  };

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

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-4">
        <div>
          <h3 className="flex items-center gap-2 text-[13px] font-medium tracking-tight text-foreground/65">
            <ListChecks className="size-4 text-foreground/45" />
            任务绑定 · Pipelines
          </h3>
          <p className="mt-1 text-[13px] text-foreground/55 max-w-[60ch]">
            这位员工被哪些 pipeline 雇佣。在这里直接绑定 / 解绑,不需要跳到 tasks 模块。
          </p>
        </div>
        <span className="font-mono text-[11px] text-foreground/40">
          {bound.length} 条已绑定 · {available.length} 条可绑定
        </span>
      </header>

      {loadingPipelines ? (
        <div className="rounded-2xl bg-muted/40 p-8 text-center text-[13px] text-foreground/50">
          <Loader2 className="mx-auto mb-2 size-4 animate-spin" />
          加载 pipelines…
        </div>
      ) : (
        <>
          <section>
            <h4 className="mb-3 flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-[0.18em] text-foreground/55">
              <LinkIcon className="size-3.5" /> 已绑定
            </h4>
            <PipelineTable
              rows={bound}
              kind="bound"
              agentId={agent.id}
              pendingId={pendingId}
              onAction={handleUnbind}
            />
          </section>

          <section>
            <h4 className="mb-3 flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-[0.18em] text-foreground/55">
              <UnlinkIcon className="size-3.5" /> 可绑定
            </h4>
            <PipelineTable
              rows={available}
              kind="available"
              agentId={agent.id}
              pendingId={pendingId}
              onAction={handleBind}
            />
          </section>
        </>
      )}
    </div>
  );
}

function PipelineTable({
  rows,
  kind,
  agentId,
  pendingId,
  onAction,
}: {
  rows: Pipeline[];
  kind: "bound" | "available";
  agentId: string;
  pendingId: string | null;
  onAction: (p: Pipeline) => Promise<void>;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-6 text-center text-[13px] text-foreground/50">
        {kind === "bound"
          ? "尚未绑定任何 pipeline(在下方「可绑定」里点绑定)"
          : "没有可绑定的 pipeline(全部已绑定,或系统还没有 pipeline)"}
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
                    onClick={() => void onAction(p)}
                    data-testid={`${kind === "bound" ? "unbind" : "bind"}-${p.id.slice(0, 8)}`}
                    className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[12px] font-medium ring-1 transition-colors disabled:opacity-50 ${
                      kind === "bound"
                        ? "ring-destructive/30 text-destructive hover:bg-destructive/10"
                        : "ring-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
                    }`}
                  >
                    {isPending ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : kind === "bound" ? (
                      <X className="size-3" />
                    ) : (
                      <Check className="size-3" />
                    )}
                    {kind === "bound" ? "解绑" : "绑定"}
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
