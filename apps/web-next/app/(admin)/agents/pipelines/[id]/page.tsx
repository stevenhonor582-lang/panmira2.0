"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Play, RefreshCw, Trash2, GitBranch, Clock, ArrowRight, Plus, Minus, Pencil, Info } from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

interface NodeState {
  status: string;
  input?: unknown;
  output?: unknown;
  error?: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  tokensUsed?: number;
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
  nodeStates?: Record<string, NodeState>;
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

function fmtAbs(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("zh-CN", { hour12: false });
}

function layoutNodes(nodes: DagNode[], edges: DagEdge[]): Map<string, { x: number; y: number; level: number }> {
  const levels = new Map<string, number>();
  function computeLevel(id: string, visited = new Set<string>()): number {
    if (levels.has(id)) return levels.get(id)!;
    if (visited.has(id)) return 0;
    visited.add(id);
    const preds = edges.filter(e => e.to === id).map(e => e.from);
    if (preds.length === 0) { levels.set(id, 0); return 0; }
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

function dagToReactFlow(
  nodes: DagNode[],
  edges: DagEdge[],
  positions: Map<string, { x: number; y: number; level: number }>,
  diffOverlay?: Map<string, "added" | "removed" | "unchanged">,
  edgeOverlay?: Map<string, "added" | "removed" | "changed" | "unchanged">,
): { nodes: RFNode[]; edges: RFEdge[] } {
  const rfNodes: RFNode[] = nodes.map((n) => {
    const pos = positions.get(n.id) ?? { x: 0, y: 0, level: 0 };
    const state = diffOverlay?.get(n.id) ?? "unchanged";
    const styleByState: Record<string, React.CSSProperties> = {
      added: { width: 160, background: "rgba(16, 185, 129, 0.18)", color: "hsl(var(--foreground))", border: "2px solid rgb(16, 185, 129)", borderRadius: 8, padding: 8, fontSize: 12 },
      removed: { width: 160, background: "rgba(244, 63, 94, 0.18)", color: "hsl(var(--foreground))", border: "2px dashed rgb(244, 63, 94)", borderRadius: 8, padding: 8, fontSize: 12, textDecoration: "line-through", opacity: 0.85 },
      unchanged: { width: 160, background: "hsl(var(--card))", color: "hsl(var(--foreground))", border: "1px solid hsl(var(--primary))", borderRadius: 8, padding: 8, fontSize: 12 },
    };
    const badge = state === "added" ? " ＋ 新增" : state === "removed" ? " － 已删除" : "";
    return {
      id: n.id,
      position: { x: pos.x, y: pos.y },
      data: { label: `${n.label}${badge}` },
      type: "default",
      style: styleByState[state],
    };
  });
  const rfEdges: RFEdge[] = edges.map((e) => {
    const key = `${e.from}->${e.to}`;
    const state = edgeOverlay?.get(key) ?? "unchanged";
    const strokeByState: Record<string, { stroke: string; strokeWidth: number; dashed: boolean }> = {
      added: { stroke: "rgb(16, 185, 129)", strokeWidth: 2.5, dashed: false },
      removed: { stroke: "rgb(244, 63, 94)", strokeWidth: 2.5, dashed: true },
      changed: { stroke: "rgb(234, 179, 8)", strokeWidth: 2.5, dashed: false },
      unchanged: { stroke: "hsl(var(--primary))", strokeWidth: 2, dashed: false },
    };
    const v = strokeByState[state];
    return {
      id: key,
      source: e.from,
      target: e.to,
      markerEnd: { type: MarkerType.ArrowClosed, color: v.stroke },
      style: { stroke: v.stroke, strokeWidth: v.strokeWidth, strokeDasharray: v.dashed ? "6 4" : undefined },
    };
  });
  return { nodes: rfNodes, edges: rfEdges };
}

type DiffKind = "added" | "removed" | "unchanged";
type EdgeDiffKind = "added" | "removed" | "changed" | "unchanged";

function computeDiff(
  current: Pipeline,
  latestRun: Run | null,
): {
  nodeDiff: Map<string, DiffKind>;
  edgeDiff: Map<string, EdgeDiffKind>;
  extraGhostNodes: DagNode[];
  stats: { added: number; removed: number; edgesAdded: number; edgesRemoved: number; edgesChanged: number };
  hasBaseline: boolean;
} {
  const nodeDiff = new Map<string, DiffKind>();
  const edgeDiff = new Map<string, EdgeDiffKind>();
  const extraGhostNodes: DagNode[] = [];

  const lastNodeIds = new Set<string>(latestRun ? Object.keys(latestRun.nodeStates ?? {}) : []);

  for (const n of current.nodes) {
    if (!latestRun) nodeDiff.set(n.id, "unchanged");
    else if (!lastNodeIds.has(n.id)) nodeDiff.set(n.id, "added");
    else nodeDiff.set(n.id, "unchanged");
  }

  for (const id of lastNodeIds) {
    if (!current.nodes.some(n => n.id === id)) {
      extraGhostNodes.push({ id, label: "(已删除)", agentTemplateId: "?" });
      nodeDiff.set(id, "removed");
    }
  }

  for (const e of current.edges) {
    const key = `${e.from}->${e.to}`;
    if (!latestRun) { edgeDiff.set(key, "unchanged"); continue; }
    const fromKind = nodeDiff.get(e.from);
    const toKind = nodeDiff.get(e.to);
    if (fromKind === "removed" || toKind === "removed") edgeDiff.set(key, "removed");
    else if (fromKind === "added" || toKind === "added") edgeDiff.set(key, "added");
    else edgeDiff.set(key, "unchanged");
  }

  const stats = {
    added: Array.from(nodeDiff.values()).filter(v => v === "added").length,
    removed: Array.from(nodeDiff.values()).filter(v => v === "removed").length,
    edgesAdded: Array.from(edgeDiff.values()).filter(v => v === "added").length,
    edgesRemoved: Array.from(edgeDiff.values()).filter(v => v === "removed").length,
    edgesChanged: Array.from(edgeDiff.values()).filter(v => v === "changed").length,
  };

  return { nodeDiff, edgeDiff, extraGhostNodes, stats, hasBaseline: !!latestRun };
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
      if (r.data.error) setToast({ kind: "err", text: `失败: ${r.data.error}` });
      else setToast({ kind: "ok", text: `完成 · ${r.data.durationMs}ms · status=${r.data.status}` });
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

  const diff = useMemo(() => {
    if (!pipeline) return null;
    const baseline = runs.find(r => r.status !== "running") ?? null;
    return computeDiff(pipeline, baseline);
  }, [pipeline, runs]);

  if (loading || !pipeline || !diff) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  const positions = layoutNodes(pipeline.nodes, pipeline.edges);
  const maxY = Math.max(...Array.from(positions.values()).map(p => p.y)) + 80;
  const { nodes: rfNodes, edges: rfEdges } = dagToReactFlow(pipeline.nodes, pipeline.edges, positions);

  const diffNodes = [...pipeline.nodes, ...diff.extraGhostNodes];
  const diffPositions = layoutNodes(diffNodes, diff.extraGhostNodes.length > 0 ? [] : pipeline.edges);
  const diffMaxY = Math.max(...Array.from(diffPositions.values()).map(p => p.y)) + 80;
  const diffRf = dagToReactFlow(diffNodes, pipeline.edges, diffPositions, diff.nodeDiff, diff.edgeDiff);

  const baseline = runs.find(r => r.status !== "running") ?? null;

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

      <Tabs defaultValue="dag" className="space-y-4">
        <TabsList>
          <TabsTrigger value="dag">DAG 视图</TabsTrigger>
          <TabsTrigger value="diff">Diff</TabsTrigger>
          <TabsTrigger value="runs">Run 历史</TabsTrigger>
        </TabsList>

        <TabsContent value="dag" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>DAG 拓扑视图</CardTitle>
              <CardDescription>节点从左到右按依赖关系排列。实线箭头 = 数据流。</CardDescription>
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
        </TabsContent>

        <TabsContent value="diff" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>对比基线</CardTitle>
              <CardDescription>
                {diff.hasBaseline && baseline ? (
                  <div className="flex flex-wrap items-center gap-2">
                    上次运行 <span className="font-mono">{baseline.id.slice(0, 8)}…</span>
                    <Badge variant="outline" className={STATUS_TONE[baseline.status] ?? ""}>{baseline.status}</Badge>
                    <span className="text-muted-foreground">{fmtAbs(baseline.startedAt)}</span>
                    <span>→</span>
                    <span>当前 {fmtAbs(new Date().toISOString())}</span>
                  </div>
                ) : (
                  <span>暂无已完成的运行。Diff 需要至少 1 个已完成/失败的 run 作为基线。先点击 "运行" 按钮。</span>
                )}
              </CardDescription>
            </CardHeader>
            {diff.hasBaseline && (
              <CardContent className="pt-0">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge variant="outline" className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30">
                    <Plus className="inline size-3 mr-1" /> {diff.stats.added} 新增节点
                  </Badge>
                  <Badge variant="outline" className="bg-rose-500/15 text-rose-600 border-rose-500/30">
                    <Minus className="inline size-3 mr-1" /> {diff.stats.removed} 删除节点
                  </Badge>
                  <Badge variant="outline" className="bg-yellow-500/15 text-yellow-700 border-yellow-500/30">
                    <Pencil className="inline size-3 mr-1" /> {diff.stats.edgesChanged} 改动连线
                  </Badge>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-muted-foreground">新增连线 +{diff.stats.edgesAdded} · 删除连线 -{diff.stats.edgesRemoved}</span>
                </div>
              </CardContent>
            )}
          </Card>

          {diff.hasBaseline && (
            <div className="flex items-start gap-2 text-xs text-muted-foreground border rounded-md px-3 py-2 bg-muted/30">
              <Info className="size-3.5 mt-0.5 shrink-0" />
              <div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block size-3 rounded-sm" style={{ background: "rgba(16, 185, 129, 0.4)", border: "2px solid rgb(16, 185, 129)" }} />
                    新增节点 (绿)
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block size-3 rounded-sm" style={{ background: "rgba(244, 63, 94, 0.4)", border: "2px dashed rgb(244, 63, 94)" }} />
                    删除节点 (红,虚线)
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block w-6 h-0.5" style={{ background: "rgb(234, 179, 8)" }} />
                    改动连线 (黄)
                  </span>
                </div>
                <div className="mt-1 text-[11px]">
                  基线 = 最新一次 completed/failed run 的 nodeStates(包含实际跑过的节点 id);label 改动无法检测(nodeStates 不存历史 label)。
                </div>
              </div>
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle>差异可视化</CardTitle>
              <CardDescription>当前 Pipeline 拓扑 vs 上次运行的节点快照。删除节点以虚线幽灵渲染(label 不可知)。</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg bg-muted/20 overflow-hidden" style={{ height: Math.max(360, diffMaxY + 40) }}>
                <ReactFlow
                  nodes={diffRf.nodes}
                  edges={diffRf.edges}
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

          {diff.hasBaseline && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Plus className="size-4 text-emerald-600" />
                    新增节点 ({diff.stats.added})
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 text-xs space-y-1">
                  {Array.from(diff.nodeDiff.entries()).filter(([, v]) => v === "added").length === 0 ? (
                    <div className="text-muted-foreground">无</div>
                  ) : (
                    Array.from(diff.nodeDiff.entries()).filter(([, v]) => v === "added").map(([id]) => {
                      const n = pipeline.nodes.find(x => x.id === id);
                      return (
                        <div key={id} className="flex items-center gap-2 font-mono">
                          <span className="text-emerald-600">+</span>
                          <span>{n?.label ?? id}</span>
                          <span className="text-muted-foreground">({id})</span>
                        </div>
                      );
                    })
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Minus className="size-4 text-rose-600" />
                    删除节点 ({diff.stats.removed})
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 text-xs space-y-1">
                  {Array.from(diff.nodeDiff.entries()).filter(([, v]) => v === "removed").length === 0 ? (
                    <div className="text-muted-foreground">无</div>
                  ) : (
                    Array.from(diff.nodeDiff.entries()).filter(([, v]) => v === "removed").map(([id]) => (
                      <div key={id} className="flex items-center gap-2 font-mono line-through opacity-70">
                        <span className="text-rose-600">-</span>
                        <span>{id}</span>
                        <span className="text-muted-foreground not-italic">(label 未知)</span>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="runs">
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
        </TabsContent>
      </Tabs>

      {toast && (
        <div className={"fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium " +
          (toast.kind === "ok" ? "bg-emerald-600 text-white" : "bg-rose-600 text-white")}>
          {toast.text}
        </div>
      )}
    </div>
  );
}
