"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Play, RefreshCw, Trash2, GitBranch, Clock, CheckCircle2, XCircle, AlertCircle, ArrowRight } from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ReactFlow, Background, Controls, MiniMap, type Node as RFNode, type Edge as RFEdge, MarkerType } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

interface DagNode { id: string; label: string; agentTemplateId: string; }
interface DagEdge { from: string; to: string; }

interface Pipeline {
  id: string;
  name: string;
  description: string | null;
  triggerType: string;
  nodes: DagNode[];
  edges: DagEdge[];
  enabled: boolean;
  runCount: number;
  successCount: number;
  avgDurationMs: number | null;
}

interface Run {
  id: string;
  status: string;
  triggeredBy: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  result: unknown;
  error: string | null;
}

const STATUS_TONE: Record<string, string> = {
  running: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  completed: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  failed: "bg-rose-500/15 text-rose-600 border-rose-500/30",
  timeout: "bg-orange-500/15 text-orange-600 border-orange-500/30",
};

const TRIGGER_LABEL: Record<string, string> = {
  bot: "Bot 触发",
  cron: "定时",
  event: "事件",
  manual: "手动",
  api: "API",
};

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return `${Math.floor(diff / 86_400_000)} 天前`;
}

// Calculate node positions in a simple grid layout
function layoutNodes(nodes: DagNode[], edges: DagEdge[]): Map<string, { x: number; y: number; level: number }> {
  const levels = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) adj.get(e.from)?.push(e.to);

  function computeLevel(id: string, visited = new Set<string>()): number {
    if (levels.has(id)) return levels.get(id)!;
    if (visited.has(id)) return 0;
    visited.add(id);
    const preds = edges.filter(e => e.to === id).map(e => e.from);
    if (preds.length === 0) {
      levels.set(id, 0);
      return 0;
    }
    const lvl = Math.max(...preds.map(p => computeLevel(p, visited))) + 1;
    levels.set(id, lvl);
    return lvl;
  }
  for (const n of nodes) computeLevel(n.id);

  const byLevel = new Map<number, DagNode[]>();
  for (const n of nodes) {
    const lvl = levels.get(n.id) ?? 0;
    if (!byLevel.has(lvl)) byLevel.set(lvl, []);
    byLevel.get(lvl)!.push(n);
  }

  const positions = new Map<string, { x: number; y: number; level: number }>();
  const NODE_W = 140, NODE_H = 60, GAP_X = 60, GAP_Y = 30;
  for (const [lvl, list] of byLevel.entries()) {
    list.forEach((n, i) => {
      positions.set(n.id, {
        x: lvl * (NODE_W + GAP_X) + 20,
        y: i * (NODE_H + GAP_Y) + 20,
        level: lvl,
      });
    });
  }
  return positions;
}

function dagToReactFlow(nodes: DagNode[], edges: DagEdge[], positions: Map<string, { x: number; y: number; level: number }>): { nodes: RFNode[]; edges: RFEdge[] } {
  const rfNodes: RFNode[] = nodes.map((n) => {
    const pos = positions.get(n.id) ?? { x: 0, y: 0, level: 0 };
    return {
      id: n.id,
      position: { x: pos.x, y: pos.y },
      data: { label: n.label, agentId: n.agentTemplateId },
      type: "default",
      style: { width: 160, background: "hsl(var(--card))", color: "hsl(var(--foreground))", border: "1px solid hsl(var(--primary))", borderRadius: 8, padding: 8, fontSize: 12 },
    };
  });
  const rfEdges: RFEdge[] = edges.map((e) => ({
    id: e.from + "->" + e.to,
    source: e.from,
    target: e.to,
    markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(var(--primary))" },
    style: { stroke: "hsl(var(--primary))", strokeWidth: 2 },
  }));
  return { nodes: rfNodes, edges: rfEdges };
}

export default function PipelineDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [triggering, setTriggering] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, r] = await Promise.all([
        api<{ success: boolean; data: Pipeline }>(`/api/v2/admin/pipelines/${params.id}`),
        api<{ success: boolean; data: Run[] }>(`/api/v2/admin/pipelines/${params.id}/runs?limit=20`),
      ]);
      setPipeline(p.data);
      setRuns(r.data ?? []);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => { load(); }, [load]);

  async function handleTrigger() {
    setTriggering(true);
    setToast(null);
    try {
      const r = await api<{ success: boolean; data: { status: string; durationMs: number; runId: string; error?: string } }>(
        `/api/v2/admin/pipelines/${params.id}/trigger`,
        { method: "POST", body: { triggeredBy: "user", initialInput: { startedBy: "ui" } } }
      );
      if (r.data.error) {
        setToast({ kind: "err", text: `失败: ${r.data.error}` });
      } else {
        setToast({ kind: "ok", text: `完成 · ${r.data.durationMs}ms · status=${r.data.status}` });
      }
      await load();
    } catch (e: unknown) {
      setToast({ kind: "err", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setTriggering(false);
      setTimeout(() => setToast(null), 4000);
    }
  }

  async function handleDelete() {
    if (!confirm("确认删除 Pipeline?")) return;
    await api(`/api/v2/admin/pipelines/${params.id}`, { method: "DELETE" });
    router.push("/agents/pipelines");
  }

  if (loading || !pipeline) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  const positions = layoutNodes(pipeline.nodes, pipeline.edges);
  const maxX = Math.max(...Array.from(positions.values()).map(p => p.x)) + 160;
  const maxY = Math.max(...Array.from(positions.values()).map(p => p.y)) + 80;
  const { nodes: rfNodes, edges: rfEdges } = dagToReactFlow(pipeline.nodes, pipeline.edges, positions);

  return (
    <div className="space-y-6 p-6">
      <Link href="/agents/pipelines" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" />
        返回 Pipeline 列表
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <GitBranch className="size-6 text-primary" />
            {pipeline.name}
          </h1>
          {pipeline.description && <p className="text-sm text-muted-foreground mt-1">{pipeline.description}</p>}
          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
            <Badge variant="outline">{TRIGGER_LABEL[pipeline.triggerType] ?? pipeline.triggerType}</Badge>
            <span>{pipeline.nodes.length} 节点</span>
            <span>·</span>
            <span>{pipeline.edges.length} 连线</span>
            <span>·</span>
            <span>运行 {pipeline.runCount} 次</span>
            <span>·</span>
            <span>成功 {pipeline.successCount}</span>
            {pipeline.avgDurationMs !== null && (
              <>
                <span>·</span>
                <span>平均 {pipeline.avgDurationMs}ms</span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={handleTrigger} disabled={triggering}>
            {triggering ? <RefreshCw className="size-4 mr-2 animate-spin" /> : <Play className="size-4 mr-2" />}
            运行
          </Button>
          <Button variant="outline" size="sm" onClick={handleDelete}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      {/* DAG 可视化 */}
      <Card>
        <CardHeader>
          <CardTitle>DAG 拓扑视图</CardTitle>
          <CardDescription>
            节点从左到右按依赖关系排列。实线箭头 = 数据流。
            点击节点卡片可看节点的 agentTemplateId。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg bg-muted/20 overflow-hidden" style={{ height: Math.max(360, maxY + 40) }}>
            <ReactFlow
              nodes={rfNodes}
              edges={rfEdges}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              minZoom={0.3}
              maxZoom={2}
              proOptions={{ hideAttribution: true }}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable
            >
              <Background gap={20} size={1} />
              <Controls showInteractive={false} />
              <MiniMap pannable zoomable className="!bg-card" />
            </ReactFlow>
          </div>
        </CardContent>
      </Card>

      {/* DAG JSON */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">DAG 定义 (JSON)</CardTitle>
          <CardDescription>完整的 Pipeline 定义,用于复制/修改</CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="font-mono text-xs bg-muted/50 p-4 rounded overflow-auto">
            {JSON.stringify({ nodes: pipeline.nodes, edges: pipeline.edges }, null, 2)}
          </pre>
        </CardContent>
      </Card>

      {/* 运行历史 */}
      <Card>
        <CardHeader>
          <CardTitle>运行历史</CardTitle>
          <CardDescription>最近 20 次运行的记录。点击进入查看节点时间线。</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {runs.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground text-sm">尚未运行过</div>
          ) : (
            <div className="divide-y">
              {runs.map((r) => (
                <Link key={r.id} href={`/agents/pipelines/${params.id}/runs/${r.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className={STATUS_TONE[r.status] ?? ""}>
                      {r.status}
                    </Badge>
                    <div className="font-mono text-xs">{r.id.slice(0, 8)}…</div>
                    <Badge variant="secondary" className="text-xs">{r.triggeredBy}</Badge>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    {r.durationMs !== null && <span><Clock className="inline size-3" /> {r.durationMs}ms</span>}
                    <span>{fmtTime(r.startedAt)}</span>
                    <ArrowRight className="size-3.5" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {toast && (
        <div className={"fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium " +
          (toast.kind === "ok" ? "bg-emerald-600 text-white" : "bg-rose-600 text-white")}>
          {toast.text}
        </div>
      )}
    </div>
  );
}
