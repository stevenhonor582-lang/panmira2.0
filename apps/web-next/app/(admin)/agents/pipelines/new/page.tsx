"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  addEdge,
  MarkerType,
  type Node as RFNode,
  type Edge as RFEdge,
  type Connection,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import {
  ArrowLeft,
  Save,
  Loader2,
  AlertCircle,
  Plus,
  Trash2,
  GitBranch,
  Bot,
  Search,
} from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Agent {
  id: string;
  displayName: string;
  name: string;
  description: string;
  roleTemplate: string;
  isActive: boolean;
}

interface PipelineNodeData {
  label: string;
  agentId: string;
  agents: Agent[];
  onLabelChange: (id: string, label: string) => void;
  onAgentChange: (id: string, agentId: string) => void;
  onDelete: (id: string) => void;
  [key: string]: unknown;
}

type PipelineRFNode = RFNode<PipelineNodeData>;

function PipelineNode({ id, data, selected }: NodeProps<PipelineRFNode>) {
  const agent = data.agents.find((a) => a.id === data.agentId);
  return (
    <div
      className={
        "rounded-lg border bg-card text-card-foreground shadow-sm w-[220px] " +
        (selected ? "border-primary ring-2 ring-primary/30" : "border-border")
      }
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-primary !w-3 !h-3 !border-2 !border-background"
      />
      <div className="p-3 space-y-2">
        <div className="flex items-center gap-2">
          <GitBranch className="size-3.5 text-primary shrink-0" />
          <Input
            value={data.label}
            onChange={(e) => data.onLabelChange(id, e.target.value)}
            placeholder="节点名称"
            className="h-7 text-xs font-medium px-2"
          />
        </div>
        <select
          value={data.agentId}
          onChange={(e) => data.onAgentChange(id, e.target.value)}
          className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">— 选择 Agent —</option>
          {data.agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.displayName || a.name}
            </option>
          ))}
        </select>
        {agent && (
          <div className="text-[10px] text-muted-foreground truncate" title={agent.description}>
            {agent.roleTemplate || agent.description || "—"}
          </div>
        )}
      </div>
      <div className="flex items-center justify-between px-3 py-1.5 border-t bg-muted/30 rounded-b-lg">
        <span className="text-[10px] font-mono text-muted-foreground">{id}</span>
        <button
          type="button"
          onClick={() => data.onDelete(id)}
          className="text-muted-foreground hover:text-destructive transition-colors"
          aria-label="删除节点"
        >
          <Trash2 className="size-3" />
        </button>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-primary !w-3 !h-3 !border-2 !border-background"
      />
    </div>
  );
}

const nodeTypes = { pipeline: PipelineNode };
/**
 * L9 #C: Edge gating condition union. Stored on react-flow edge data so the
 * canvas preserves it across selection/save. Mirrors the backend
 * `PipelineEdge.condition` (src/services/pipeline-engine.ts).
 */
type EdgeCondition = "always" | "success" | "failure";

const CONDITION_OPTIONS: Array<{ value: EdgeCondition; label: string; hint: string }> = [
  { value: "always",   label: "总是执行 (always)",   hint: "无论上游成功失败都会跑 — 默认值" },
  { value: "success",  label: "上游成功才跑 (success)", hint: "上游 status=success 才执行" },
  { value: "failure",  label: "上游失败才跑 (failure)", hint: "上游 status=failed 才执行 (兜底分支)" },
];

function getEdgeCondition(edge: RFEdge): EdgeCondition {
  const raw = (edge.data as { condition?: unknown } | undefined)?.condition;
  return raw === "success" || raw === "failure" || raw === "always" ? raw : "always";
}

function setEdgesCondition(eds: RFEdge[], ids: Set<string>, condition: EdgeCondition): RFEdge[] {
  return eds.map((e) => (ids.has(e.id) ? { ...e, data: { ...(e.data ?? {}), condition } } : e));
}


function hasCycle(edges: RFEdge[]): boolean {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source)!.push(e.target);
  }
  const WHITE = 0,
    GRAY = 1,
    BLACK = 2;
  const color = new Map<string, number>();
  function dfs(u: string): boolean {
    color.set(u, GRAY);
    for (const v of adj.get(u) ?? []) {
      const c = color.get(v) ?? WHITE;
      if (c === GRAY) return true;
      if (c === WHITE && dfs(v)) return true;
    }
    color.set(u, BLACK);
    return false;
  }
  for (const u of adj.keys()) {
    if ((color.get(u) ?? WHITE) === WHITE && dfs(u)) return true;
  }
  return false;
}

function validate(
  name: string,
  nodes: PipelineRFNode[],
  edges: RFEdge[],
): string[] {
  const errors: string[] = [];
  if (!name.trim()) errors.push("Pipeline 名称不能为空");
  if (nodes.length === 0) {
    errors.push("至少添加一个节点");
    return errors;
  }
  const ids = new Set<string>();
  for (const n of nodes) {
    if (!n.id) errors.push("节点缺少 ID");
    if (ids.has(n.id)) errors.push(`节点 ID 重复: ${n.id}`);
    ids.add(n.id);
    if (!n.data.label.trim()) errors.push(`节点 ${n.id} 缺少 label`);
    if (!n.data.agentId) errors.push(`节点 ${n.data.label || n.id} 未选择 Agent`);
  }
  for (const e of edges) {
    if (!ids.has(e.source)) errors.push(`连线 source 不存在: ${e.source}`);
    if (!ids.has(e.target)) errors.push(`连线 target 不存在: ${e.target}`);
    if (e.source === e.target) errors.push(`节点 ${e.source} 自连接`);
  }
  const connected = new Set<string>();
  for (const e of edges) {
    connected.add(e.source);
    connected.add(e.target);
  }
  for (const n of nodes) {
    if (!connected.has(n.id)) errors.push(`节点 ${n.data.label || n.id} 孤立 (没有连线)`);
  }
  if (hasCycle(edges)) errors.push("DAG 检测到环 (循环依赖)");
  return errors;
}

function Editor() {
  const router = useRouter();
  const [name, setName] = useState("新建 Pipeline");
  const [description, setDescription] = useState("");
  const [triggerType, setTriggerType] = useState("manual");
  const [retryMaxAttempts, setRetryMaxAttempts] = useState(1);
  const [retryBackoffMs, setRetryBackoffMs] = useState(1000);

  const [agents, setAgents] = useState<Agent[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [agentSearch, setAgentSearch] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<PipelineRFNode>([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<RFEdge>([]);
  // L9 #C: track selected edges so the right-side panel can edit their condition.
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<string[]>([]);

  const selectedEdges = useMemo(
    () => rfEdges.filter((e) => selectedEdgeIds.includes(e.id)),
    [rfEdges, selectedEdgeIds],
  );

  const setEdgeConditionBulk = useCallback(
    (cond: EdgeCondition) => {
      setRfEdges((eds) => setEdgesCondition(eds, new Set(selectedEdgeIds), cond));
    },
    [selectedEdgeIds, setRfEdges],
  );

  const counterRef = useRef(0);
  const nextNodeId = useCallback(() => {
    counterRef.current += 1;
    return `n${counterRef.current}`;
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const r = await api<{ success?: boolean; agents?: Agent[] } | Agent[]>(
          "/api/v2/admin/agents",
        );
        const list = Array.isArray(r) ? r : (r.agents ?? []);
        setAgents(list);
      } catch {
        setAgents([]);
      } finally {
        setLoadingAgents(false);
      }
    })();
  }, []);

  useEffect(() => {
    setRfNodes((nds) =>
      nds.map((n) => ({ ...n, data: { ...n.data, agents } })),
    );
  }, [agents, setRfNodes]);

  const onLabelChange = useCallback(
    (id: string, label: string) => {
      setRfNodes((nds) =>
        nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, label } } : n)),
      );
    },
    [setRfNodes],
  );

  const onAgentChange = useCallback(
    (id: string, agentId: string) => {
      setRfNodes((nds) =>
        nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, agentId } } : n)),
      );
    },
    [setRfNodes],
  );

  const onDelete = useCallback(
    (id: string) => {
      setRfNodes((nds) => nds.filter((n) => n.id !== id));
      setRfEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
    },
    [setRfNodes, setRfEdges],
  );

  const addNode = useCallback(
    (agent?: Agent) => {
      const id = nextNodeId();
      const existing = rfNodes.length;
      const col = existing % 4;
      const row = Math.floor(existing / 4);
      const x = 80 + col * 260;
      const y = 80 + row * 140;
      const newNode: PipelineRFNode = {
        id,
        type: "pipeline",
        position: { x, y },
        data: {
          label: agent?.displayName || agent?.name || `节点 ${id}`,
          agentId: agent?.id ?? "",
          agents,
          onLabelChange,
          onAgentChange,
          onDelete,
        },
      };
      setRfNodes((nds) => [...nds, newNode]);
    },
    [agents, nextNodeId, onAgentChange, onDelete, onLabelChange, rfNodes.length, setRfNodes],
  );

  const onConnect = useCallback(
    (params: Connection) => {
      setRfEdges((eds) =>
        addEdge(
          {
            ...params,
            markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(var(--primary))" },
            style: { stroke: "hsl(var(--primary))", strokeWidth: 2 },
          },
          eds,
        ),
      );
    },
    [setRfEdges],
  );

  const validationErrors = useMemo(
    () => validate(name, rfNodes, rfEdges),
    [name, rfNodes, rfEdges],
  );

  async function handleSave() {
    if (validationErrors.length > 0) {
      setError(validationErrors[0]);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || undefined,
        triggerType,
        retryPolicy: { maxAttempts: retryMaxAttempts, backoffMs: retryBackoffMs },
        nodes: rfNodes.map((n) => ({
          id: n.id,
          label: n.data.label.trim(),
          agentTemplateId: n.data.agentId,
        })),
        edges: rfEdges.map((e) => ({ from: e.source, to: e.target })),
      };
      const r = await api<{ success: boolean; data: { id: string } }>(
        "/api/v2/admin/pipelines",
        { method: "POST", body: payload },
      );
      router.push(`/agents/pipelines/${r.data.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const filteredAgents = useMemo(() => {
    const q = agentSearch.trim().toLowerCase();
    if (!q) return agents;
    return agents.filter(
      (a) =>
        a.displayName.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        (a.roleTemplate || "").toLowerCase().includes(q),
    );
  }, [agents, agentSearch]);

  return (
    <div className="space-y-4 p-6">
      <Link
        href="/agents/pipelines"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        返回 Pipeline 列表
      </Link>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[240px] space-y-1.5">
              <Label htmlFor="pl-name">Pipeline 名称</Label>
              <Input
                id="pl-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例: 内容生产流水线"
              />
            </div>
            <div className="flex-1 min-w-[240px] space-y-1.5">
              <Label htmlFor="pl-desc">描述 (可选)</Label>
              <Input
                id="pl-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="一句话说明用途"
              />
            </div>
            <div className="w-[160px] space-y-1.5">
              <Label htmlFor="pl-trigger">触发方式</Label>
              <select
                id="pl-trigger"
                value={triggerType}
                onChange={(e) => setTriggerType(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="manual">手动</option>
                <option value="bot">Bot 触发</option>
                <option value="cron">定时</option>
                <option value="event">事件</option>
              </select>
            </div>
            <div className="w-[110px] space-y-1.5">
              <Label htmlFor="pl-retry-attempts" title="LLM 调用失败时,每个节点最多重试次数">重试次数</Label>
              <Input
                id="pl-retry-attempts"
                type="number"
                min={1}
                max={10}
                value={retryMaxAttempts}
                onChange={(e) => setRetryMaxAttempts(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
              />
            </div>
            <div className="w-[130px] space-y-1.5">
              <Label htmlFor="pl-retry-backoff" title="每次重试前的等待毫秒数 (退避)">退避 (ms)</Label>
              <Input
                id="pl-retry-backoff"
                type="number"
                min={0}
                max={60000}
                step={100}
                value={retryBackoffMs}
                onChange={(e) => setRetryBackoffMs(Math.max(0, Math.min(60000, Number(e.target.value) || 0)))}
              />
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={handleSave} disabled={saving || validationErrors.length > 0}>
                {saving ? (
                  <Loader2 className="size-4 mr-2 animate-spin" />
                ) : (
                  <Save className="size-4 mr-2" />
                )}
                保存
              </Button>
              <Link href="/agents/pipelines">
                <Button variant="outline">取消</Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>

      {validationErrors.length > 0 && (
        <div className="border border-amber-500/40 bg-amber-500/10 rounded-lg p-3 flex items-start gap-2">
          <AlertCircle className="size-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="text-sm text-amber-700 dark:text-amber-300">
            <div className="font-medium mb-1">无法保存 (有 {validationErrors.length} 个问题):</div>
            <ul className="list-disc pl-5 space-y-0.5">
              {validationErrors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {error && (
        <div className="border border-destructive/50 bg-destructive/5 rounded-lg p-3 flex items-start gap-2">
          <AlertCircle className="size-4 text-destructive mt-0.5 shrink-0" />
          <div className="text-sm text-destructive">{error}</div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">DAG 编辑器</CardTitle>
            <CardDescription>
              从右侧拖入 Agent 作为节点;在节点间连线定义执行顺序;保存前会自动校验。
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div
              className="border-t bg-muted/10"
              style={{ height: "calc(100vh - 420px)", minHeight: 480 }}
            >
              <ReactFlow
                nodes={rfNodes}
                edges={rfEdges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                nodeTypes={nodeTypes}
                fitView
                fitViewOptions={{ padding: 0.2 }}
                minZoom={0.3}
                maxZoom={2}
                proOptions={{ hideAttribution: true }}
                deleteKeyCode={["Backspace", "Delete"]}
                defaultEdgeOptions={{
                  markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(var(--primary))" },
                  style: { stroke: "hsl(var(--primary))", strokeWidth: 2 },
                }}
              >
                <Background gap={20} size={1} />
                <Controls showInteractive={false} />
                <MiniMap pannable zoomable className="!bg-card" />
              </ReactFlow>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">添加节点</CardTitle>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => addNode()}
                disabled={loadingAgents}
              >
                <Plus className="size-3.5 mr-1.5" />
                添加空白节点
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-1.5">
                <Bot className="size-3.5" />
                Agent 列表
                <Badge variant="secondary" className="ml-auto text-[10px]">
                  {agents.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="relative">
                <Search className="size-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <Input
                  value={agentSearch}
                  onChange={(e) => setAgentSearch(e.target.value)}
                  placeholder="搜索 Agent…"
                  className="h-7 pl-7 text-xs"
                />
              </div>
              <ScrollArea className="h-[280px] pr-2">
                {loadingAgents ? (
                  <div className="text-xs text-muted-foreground py-4 text-center">加载中…</div>
                ) : filteredAgents.length === 0 ? (
                  <div className="text-xs text-muted-foreground py-4 text-center">
                    {agents.length === 0 ? "暂无可用 Agent" : "无匹配结果"}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {filteredAgents.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => addNode(a)}
                        disabled={!a.isActive}
                        className="w-full text-left px-2.5 py-1.5 rounded-md border border-border bg-card hover:bg-accent hover:border-primary/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="text-xs font-medium truncate">
                            {a.displayName || a.name}
                          </span>
                          {!a.isActive && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0">
                              停用
                            </Badge>
                          )}
                        </div>
                        {a.roleTemplate && (
                          <div className="text-[10px] text-muted-foreground truncate mt-0.5">
                            {a.roleTemplate}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
              <p className="text-[10px] text-muted-foreground">
                点击 Agent 即添加到画布
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">
                当前节点
                <Badge variant="secondary" className="ml-2 text-[10px]">
                  {rfNodes.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {rfNodes.length === 0 ? (
                <div className="text-xs text-muted-foreground py-3 text-center">尚未添加节点</div>
              ) : (
                <ScrollArea className="h-[200px] pr-2">
                  <div className="space-y-1">
                    {rfNodes.map((n) => {
                      const agent = agents.find((a) => a.id === n.data.agentId);
                      return (
                        <div
                          key={n.id}
                          className="flex items-center justify-between gap-2 px-2 py-1.5 rounded border border-border bg-muted/30"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium truncate">{n.data.label}</div>
                            <div className="text-[10px] text-muted-foreground truncate">
                              {agent ? agent.displayName || agent.name : "未选 Agent"}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => onDelete(n.id)}
                            className="text-muted-foreground hover:text-destructive shrink-0"
                            aria-label="删除"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>

          {/* L9 #C: edge condition editor — applied to the currently selected edge(s). */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-1.5">
                <GitBranch className="size-3.5" />
                边条件
                <Badge variant="secondary" className="ml-auto text-[10px]">
                  选中 {selectedEdges.length}
                </Badge>
              </CardTitle>
              <CardDescription>
                选中画布上的一条或多条边,然后选择触发条件。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {selectedEdges.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  尚未选中边。点击画布上的连线即可在此编辑其 condition。
                </p>
              ) : (
                <>
                  <p className="text-[10px] font-mono text-muted-foreground">
                    {selectedEdges
                      .slice(0, 3)
                      .map((e) => `${e.source} → ${e.target}`)
                      .join(" · ")}
                    {selectedEdges.length > 3 ? ` (+${selectedEdges.length - 3})` : ""}
                  </p>
                  <div className="space-y-1.5">
                    {CONDITION_OPTIONS.map((opt) => {
                      // mixed = selected edges don't all share the same condition
                      const allMatch = selectedEdges.every(
                        (e) => getEdgeCondition(e) === opt.value,
                      );
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setEdgeConditionBulk(opt.value)}
                          className={
                            "w-full text-left rounded-md border px-2.5 py-1.5 transition-colors " +
                            (allMatch && selectedEdges.length > 0
                              ? "border-primary bg-primary/10"
                              : "border-border hover:bg-accent")
                          }
                          aria-pressed={allMatch && selectedEdges.length > 0}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium">{opt.label}</span>
                            {allMatch && selectedEdges.length > 0 && (
                              <Badge variant="default" className="text-[9px] px-1 py-0">
                                当前
                              </Badge>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{opt.hint}</p>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function NewPipelinePage() {
  return (
    <ReactFlowProvider>
      <Editor />
    </ReactFlowProvider>
  );
}
