// R19 (2026-07-09): React Flow (@xyflow/react) DAG editor.
// Replaces the tldraw v5 implementation to remove the license watermark +
// unlock perpetual MIT use. Functional parity preserved:
//   - 6 node kinds (Bot / Human / Skill / Tool / Conditional / Parallel)
//   - ShapeConfigPanel with per-kind forms + IO contract + Human approval
//   - Connection validation (Conditional >=2 out, parallel degree, cycle, dup)
//   - Toolbar: undo / redo / zoom / grid / validate / save / test-run
//   - Read-only viewer mode (variant="viewer" or readOnly=true)
//   - Live execution preview (node.data.status highlights)
//
// Data format (DagDocument):
//   snapshot: { nodes: RFNode[], edges: RFEdge[] }
//   nodes:    derived flat list [{shapeId, meta}] for the server engine
//   edges:    derived flat list [{from, to}]
//   botId:    owning bot id
//
// Back-compat: if an old pipeline ships a tldraw TLStoreSnapshot, we can't
// parse it, so we fall back to the flat nodes/edges lists (re-laid out on
// a grid). The user re-arranges once and saves; from then on RF is the
// source of truth.

"use client";

import * as React from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  Panel,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  BackgroundVariant,
  ConnectionMode,
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
  type EdgeChange,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import {
  Bot,
  CheckCircle2,
  CircleAlert,
  Hammer,
  GitFork,
  ListChecks,
  Loader2,
  Maximize2,
  Grid3x3,
  Play,
  Redo2,
  Save,
  Split,
  Trash2,
  Undo2,
  UserRound,
  Wand2,
  Wrench,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from "lucide-react";

import {
  DAG_SHAPE_W,
  DAG_SHAPE_H,
  NODE_TYPES,
} from "./node-shapes";
import {
  type DagDocument,
  type DagEdgeRecord,
  type DagNodeMeta,
  type DagNodeRecord,
  type DagRfEdge,
  type DagRfNode,
  type NodeKind,
  NODE_KIND_MAP,
} from "./types";
import { ShapeConfigPanel } from "./shape-config-panel";
// R20: AI DAG assistant
import { AiAssistantDialog } from "./ai-assistant-dialog";
import {
  detectCycle,
  isConnectionAllowed,
  validateDag,
  validateEdgeRules,
} from "./dag-validators";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

// ────────────────────────────────────────────────────────────────────────────
// Props
// ────────────────────────────────────────────────────────────────────────────

interface TaskDagEditorProps {
  pipelineId?: string;
  /** Pipeline's DagDocument snapshot (RF format) or legacy tldraw snapshot. */
  initialSnapshot?: unknown;
  /** Alias of initialSnapshot (some pages pass initialValue). */
  initialValue?: unknown;
  initialName?: string;
  initialBotId?: string;
  variant?: "editor" | "viewer";
  onChange?: (value: DagDocument) => void;
  hideToolbar?: boolean;
  readOnly?: boolean;
  /** R18: live execution context — when all 3 are set the panel posts decisions. */
  runId?: string;
}

const PALETTE: Array<{ kind: NodeKind; icon: LucideIcon; hint: string }> = [
  { kind: "bot", icon: Bot, hint: "拉取 8 个数字员工之一" },
  { kind: "human", icon: UserRound, hint: "史德飞 + 团队成员审批/兜底" },
  { kind: "skill", icon: Wrench, hint: "skills/MCP 库中的能力" },
  { kind: "tool", icon: Hammer, hint: "底层工具函数" },
  { kind: "conditional", icon: GitFork, hint: "if/else 条件路由" },
  { kind: "parallel", icon: Split, hint: "并行分支 fan-out/fan-in" },
];

// ────────────────────────────────────────────────────────────────────────────
// Public component (wrapped in ReactFlowProvider)
// ────────────────────────────────────────────────────────────────────────────

export function TaskDagEditor(props: TaskDagEditorProps) {
  return (
    <ReactFlowProvider>
      <TaskDagEditorInner {...props} />
    </ReactFlowProvider>
  );
}

export default TaskDagEditor;

// ────────────────────────────────────────────────────────────────────────────
// Inner component — has access to useReactFlow()
// ────────────────────────────────────────────────────────────────────────────

interface DocState {
  nodes: DagRfNode[];
  edges: DagRfEdge[];
}

function TaskDagEditorInner(props: TaskDagEditorProps) {
  const isViewer = props.variant === "viewer" || props.readOnly === true;
  const reactFlow = useReactFlow();

  // ── Bootstrap: load + normalise initial doc ──────────────────────────────
  const initialDoc = React.useMemo<DocState>(() => {
    return normaliseInitialDoc(
      props.initialSnapshot ?? props.initialValue,
      props.initialBotId,
    );
  }, [props.initialSnapshot, props.initialValue, props.initialBotId]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(initialDoc.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initialDoc.edges);

  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [showGrid, setShowGrid] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [running, setRunning] = React.useState(false);
  const [dragKind, setDragKind] = React.useState<NodeKind | null>(null);
  const [aiOpen, setAiOpen] = React.useState(false);
  const wrapperRef = React.useRef<HTMLDivElement | null>(null);

  // Undo/redo history — snapshot the whole graph on structural changes only.
  const past = React.useRef<DocState[]>([]);
  const future = React.useRef<DocState[]>([]);
  const [historyVer, setHistoryVer] = React.useState(0);

  // Validation (derived)
  const validationMsg = React.useMemo(() => {
    const flat = toFlatLists(nodes, edges);
    const v = validateDag(
      flat.nodes.map((n) => ({ shapeId: n.shapeId, kind: n.meta.kind })),
      flat.edges,
      parallelismFromNodes(nodes),
    );
    return { ok: v.ok, text: v.summary };
  }, [nodes, edges]);

  // ── History helpers ──────────────────────────────────────────────────────
  const snapshotCurrent = React.useCallback((): DocState => {
    // Deep-ish clone — RF nodes carry data which we mutate; clone to avoid
    // later in-place edits corrupting the stored snapshot.
    return {
      nodes: nodes.map((n) => ({ ...n, data: { ...(n.data as object) } })) as DagRfNode[],
      edges: edges.map((e) => ({ ...e })) as DagRfEdge[],
    };
  }, [nodes, edges]);

  const pushHistory = React.useCallback(() => {
    past.current.push(snapshotCurrent());
    if (past.current.length > 50) past.current.shift();
    future.current = [];
    setHistoryVer((v) => v + 1);
  }, [snapshotCurrent]);

  const undo = React.useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(snapshotCurrent());
    setNodes(prev.nodes);
    setEdges(prev.edges);
    setSelectedId(null);
    setHistoryVer((v) => v + 1);
  }, [setNodes, setEdges, snapshotCurrent]);

  const redo = React.useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(snapshotCurrent());
    setNodes(next.nodes);
    setEdges(next.edges);
    setSelectedId(null);
    setHistoryVer((v) => v + 1);
  }, [setNodes, setEdges, snapshotCurrent]);

  // R20: load an AI-generated DAG. Snapshot current graph first so the
  // replacement is undoable (user can ⌘Z back to the empty canvas).
  const handleAiGenerate = React.useCallback(
    (rawNodes: unknown[], rawEdges: unknown[], _explanation: string) => {
      pushHistory();
      setNodes(rawNodes as DagRfNode[]);
      setEdges(rawEdges as DagRfEdge[]);
      setSelectedId(null);
      // Fit the new graph into view on the next tick (RF needs the nodes mounted).
      window.setTimeout(() => {
        try { reactFlow.fitView({ padding: 0.2 }); } catch { /* noop */ }
      }, 60);
    },
    [pushHistory, setNodes, setEdges, reactFlow],
  );

  const canUndo = past.current.length > 0;
  const canRedo = future.current.length > 0;
  // historyVer exists only to make canUndo/canRedo re-render; reference it.
  void historyVer;

  // ── Node operations ──────────────────────────────────────────────────────
  const genId = React.useCallback(() => {
    // Stable-ish unique id without external deps.
    return `n_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  }, []);

  const addNode = React.useCallback(
    (kind: NodeKind, pos?: { x: number; y: number }) => {
      if (isViewer) return;
      pushHistory();
      const meta: DagNodeMeta = {
        kind,
        label: NODE_KIND_MAP[kind].label + " · 新",
      };
      // Default position: near viewport centre. RF's project() takes screen
      // coords; we fall back to a grid based on node count.
      let position = pos;
      if (!position) {
        const wrapper = wrapperRef.current;
        if (wrapper) {
          const rect = wrapper.getBoundingClientRect();
          const projected = reactFlow.screenToFlowPosition({
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
          });
          position = {
            x: projected.x - DAG_SHAPE_W / 2,
            y: projected.y - DAG_SHAPE_H / 2,
          };
        } else {
          position = {
            x: 80 + (nodes.length % 5) * 240,
            y: 80 + Math.floor(nodes.length / 5) * 140,
          };
        }
      }
      const node: DagRfNode = {
        id: genId(),
        type: "dagNode",
        position,
        data: meta,
      };
      setNodes((cur) => [...cur, node]);
      setSelectedId(node.id);
    },
    [isViewer, nodes.length, pushHistory, reactFlow, setNodes, genId],
  );

  const updateSelectedMeta = React.useCallback(
    (patch: Partial<DagNodeMeta>) => {
      if (!selectedId) return;
      setNodes((cur) =>
        cur.map((n) =>
          n.id === selectedId
            ? { ...n, data: { ...(n.data as DagNodeMeta), ...patch } }
            : n,
        ),
      );
    },
    [selectedId, setNodes],
  );

  const deleteSelected = React.useCallback(() => {
    if (isViewer || !selectedId) return;
    pushHistory();
    const id = selectedId;
    setNodes((cur) => cur.filter((n) => n.id !== id));
    setEdges((cur) => cur.filter((e) => e.source !== id && e.target !== id));
    setSelectedId(null);
  }, [isViewer, selectedId, pushHistory, setNodes, setEdges]);

  // ── Connection validation ────────────────────────────────────────────────
  const onConnect = React.useCallback(
    (conn: Connection) => {
      if (isViewer) return;
      const src = nodes.find((n) => n.id === conn.source);
      const tgt = nodes.find((n) => n.id === conn.target);
      if (!src || !tgt) return;
      const srcKind = (src.data as DagNodeMeta).kind;
      const tgtKind = (tgt.data as DagNodeMeta).kind;
      if (!isConnectionAllowed(srcKind, tgtKind)) {
        window.alert(`不允许的连线: ${srcKind} → ${tgtKind}`);
        return;
      }
      // Duplicate edge?
      if (edges.some((e) => e.source === conn.source && e.target === conn.target)) {
        return;
      }
      // Tentatively add, then cycle-check; revert if cyclic.
      const trial: DagEdgeRecord[] = [
        ...toFlatLists(nodes, edges).edges,
        { from: conn.source!, to: conn.target! },
      ];
      const flatNodes = toFlatLists(nodes, edges).nodes.map((n) => ({
        shapeId: n.shapeId,
      }));
      const cycle = detectCycle(flatNodes, trial);
      if (cycle) {
        window.alert(`连线会形成环: ${cycle.join(" → ")}`);
        return;
      }
      pushHistory();
      setEdges((eds) =>
        addEdge(
          {
            ...conn,
            id: `e_${conn.source}_${conn.target}_${Date.now().toString(36)}`,
            type: "smoothstep",
            animated: true,
          } as Edge,
          eds,
        ),
      );
    },
    [isViewer, nodes, edges, pushHistory, setEdges],
  );

  // ── selection ────────────────────────────────────────────────────────────
  const onNodeClick: NodeMouseHandler = React.useCallback((_, node) => {
    setSelectedId(node.id);
  }, []);

  const onPaneClick = React.useCallback(() => setSelectedId(null), []);

  // ── selection visual: mark `selected` on the active node ──────────────────
  React.useEffect(() => {
    setNodes((cur) =>
      cur.map((n) => ({ ...n, selected: n.id === selectedId })),
    );
  }, [selectedId, setNodes]);

  // ── Drag-drop from palette ───────────────────────────────────────────────
  const onDragStart = (kind: NodeKind) => (e: React.DragEvent) => {
    setDragKind(kind);
    e.dataTransfer.setData("application/x-dag-kind", kind);
    e.dataTransfer.effectAllowed = "move";
  };

  const onDrop = React.useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const kind = e.dataTransfer.getData("application/x-dag-kind") as NodeKind;
      if (!kind) return;
      const projected = reactFlow.screenToFlowPosition({
        x: e.clientX,
        y: e.clientY,
      });
      addNode(kind, {
        x: projected.x - DAG_SHAPE_W / 2,
        y: projected.y - DAG_SHAPE_H / 2,
      });
      setDragKind(null);
    },
    [addNode, reactFlow],
  );

  const onDragOver = React.useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  // ── Doc serialisation → onChange ─────────────────────────────────────────
  React.useEffect(() => {
    const flat = toFlatLists(nodes, edges);
    const doc: DagDocument = {
      snapshot: { nodes: nodes as DagRfNode[], edges: edges as DagRfEdge[] },
      nodes: flat.nodes,
      edges: flat.edges,
      botId: props.initialBotId ?? pickFirstBot(flat.nodes),
    };
    props.onChange?.(doc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges]);

  // ── Save / test-run ──────────────────────────────────────────────────────
  const handleSave = React.useCallback(async () => {
    setSaving(true);
    try {
      const flat = toFlatLists(nodes, edges);
      const doc: DagDocument = {
        snapshot: { nodes: nodes as DagRfNode[], edges: edges as DagRfEdge[] },
        nodes: flat.nodes,
        edges: flat.edges,
        botId: props.initialBotId ?? pickFirstBot(flat.nodes),
      };
      props.onChange?.(doc);
      window.dispatchEvent(new CustomEvent("dag:save", { detail: doc }));
    } finally {
      setSaving(false);
    }
  }, [nodes, edges, props]);

  const handleTestRun = React.useCallback(async () => {
    if (!props.pipelineId) {
      window.alert("请先保存任务后再测试运行");
      return;
    }
    if (!validationMsg.ok) {
      window.alert(`DAG 校验未通过: ${validationMsg.text}`);
      return;
    }
    setRunning(true);
    try {
      const r = await api<{
        success?: boolean;
        error?: string;
        data?: { runId?: string; status?: string };
      }>(`/api/v2/admin/pipelines/${props.pipelineId}/trigger?async=true`, {
        method: "POST",
        body: { triggeredBy: "user", initialInput: {} },
      });
      if (r?.error) window.alert(`触发失败: ${r.error}`);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "触发失败");
    } finally {
      setRunning(false);
    }
  }, [props.pipelineId, validationMsg]);

  // ── Derived: selected node meta ──────────────────────────────────────────
  const selectedNode = React.useMemo(
    () => (selectedId ? (nodes.find((n) => n.id === selectedId) ?? null) : null),
    [selectedId, nodes],
  );
  const selectedMeta: DagNodeMeta | null = selectedNode
    ? (selectedNode.data as DagNodeMeta)
    : null;

  // ── Keyboard shortcuts (Delete / Cmd+Z / Shift+Cmd+Z) ────────────────────
  React.useEffect(() => {
    if (isViewer) return;
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      // Don't hijack typing in form fields (the config panel).
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault();
        deleteSelected();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isViewer, selectedId, deleteSelected, undo, redo]);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full min-h-[640px] border rounded-xl overflow-hidden bg-card">
      {!isViewer && (
        <aside
          className="w-[148px] shrink-0 border-r bg-muted/20 p-2 flex flex-col gap-1.5 overflow-y-auto"
          data-testid="dag-palette"
        >
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1 py-1">
            节点
          </div>
          {PALETTE.map((p) => {
            const meta = NODE_KIND_MAP[p.kind];
            const Icon = p.icon;
            return (
              <button
                key={p.kind}
                type="button"
                draggable
                onDragStart={onDragStart(p.kind)}
                onClick={() => addNode(p.kind)}
                title={p.hint}
                className="group flex items-center gap-2 px-2 py-1.5 rounded-md ring-1 ring-transparent hover:ring-foreground/15 hover:bg-card transition-colors text-left cursor-grab active:cursor-grabbing"
              >
                <span
                  className="grid place-items-center size-7 rounded-md shrink-0"
                  style={{ backgroundColor: `${meta.tone}22`, color: meta.tone }}
                >
                  <Icon className="size-3.5" strokeWidth={2} />
                </span>
                <div className="min-w-0">
                  <div className="text-[11px] font-medium leading-tight truncate">
                    {meta.label}
                  </div>
                  <div className="text-[9px] text-muted-foreground truncate">
                    点击 / 拖入
                  </div>
                </div>
              </button>
            );
          })}
          <div className="mt-auto pt-2 border-t text-[9px] text-muted-foreground leading-snug">
            拖拽画布平移 · 滚轮缩放 · 选中后 Delete 删除 · ⌘Z 撤销
          </div>
        </aside>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        {!props.hideToolbar && (
          <div className="flex items-center gap-1 px-3 py-2 border-b bg-muted/10 flex-wrap">
            <div className="flex items-center gap-0.5 mr-2">
              <ToolBtn
                title="撤销 (⌘Z)"
                onClick={undo}
                disabled={isViewer || !canUndo}
              >
                <Undo2 className="size-3.5" />
              </ToolBtn>
              <ToolBtn
                title="重做 (⇧⌘Z)"
                onClick={redo}
                disabled={isViewer || !canRedo}
              >
                <Redo2 className="size-3.5" />
              </ToolBtn>
            </div>
            <div className="w-px h-5 bg-foreground/10 mx-1" />
            <ToolBtn title="缩小" onClick={() => reactFlow.zoomOut()}>
              <ZoomOut className="size-3.5" />
            </ToolBtn>
            <ToolBtn title="放大" onClick={() => reactFlow.zoomIn()}>
              <ZoomIn className="size-3.5" />
            </ToolBtn>
            <ToolBtn
              title="对齐网格"
              active={showGrid}
              onClick={() => setShowGrid((s) => !s)}
            >
              <Grid3x3 className="size-3.5" />
            </ToolBtn>
            <ToolBtn title="适应内容" onClick={() => reactFlow.fitView({ padding: 0.2 })}>
              <Maximize2 className="size-3.5" />
            </ToolBtn>
            <div className="w-px h-5 bg-foreground/10 mx-1" />
            <div
              className={cn(
                "flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ring-1",
                validationMsg.ok
                  ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                  : "bg-rose-50 text-rose-700 ring-rose-200",
              )}
              title={validationMsg.text}
            >
              {validationMsg.ok ? (
                <CheckCircle2 className="size-3" />
              ) : (
                <CircleAlert className="size-3" />
              )}
              <span className="truncate max-w-[160px]">{validationMsg.text}</span>
            </div>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 ring-1 ring-amber-200">
              模拟执行
            </span>

            <div className="ml-auto flex items-center gap-1">
              {!isViewer && (
                <>
                  <button
                    type="button"
                    onClick={() => setAiOpen(true)}
                    title="用自然语言生成编排"
                    className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-xs bg-violet-50 text-violet-700 ring-1 ring-violet-200 hover:bg-violet-100 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-900"
                  >
                    <Wand2 className="size-3" />
                    AI 助手
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-xs bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {saving ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Save className="size-3" />
                    )}
                    保存
                  </button>
                  {props.pipelineId && (
                    <button
                      type="button"
                      onClick={handleTestRun}
                      disabled={running}
                      className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-xs ring-1 ring-foreground/15 hover:bg-muted disabled:opacity-50"
                    >
                      {running ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Play className="size-3" />
                      )}
                      测试运行
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        <div
          className="flex-1 min-h-0 relative"
          ref={wrapperRef}
          onDrop={onDrop}
          onDragOver={onDragOver}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={NODE_TYPES}
            nodesDraggable={!isViewer}
            nodesConnectable={!isViewer}
            elementsSelectable
            deleteKeyCode={null}
            multiSelectionKeyCode={["Meta", "Control"]}
            connectionMode={ConnectionMode.loose}
            fitView
            minZoom={0.2}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
          >
            {showGrid && (
              <Background
                variant={BackgroundVariant.Dots}
                gap={16}
                size={1}
                color="hsl(var(--foreground) / 0.1)"
              />
            )}
            <Controls
              showInteractive={!isViewer}
              className="!bg-card !border !border-foreground/10 !rounded-md !shadow-sm"
            />
            <MiniMap
              pannable
              zoomable
              className="!bg-card !border !border-foreground/10 !rounded-md"
              nodeColor={(n) => {
                const kind = (n.data as DagNodeMeta | undefined)?.kind;
                return kind ? NODE_KIND_MAP[kind].tone : "#94a3b8";
              }}
            />
          </ReactFlow>

          {!isViewer && selectedMeta && (
            <div className="absolute right-3 top-3 bottom-3 w-[260px] z-10">
              <ShapeConfigPanel
                meta={selectedMeta}
                onChange={updateSelectedMeta}
                onDelete={deleteSelected}
                runId={props.runId}
                pipelineId={props.pipelineId}
                nodeId={selectedId ?? undefined}
              />
            </div>
          )}

          {nodes.length === 0 && !isViewer && (
            <Panel position="top-center" className="!m-0 !pointer-events-none">
              <div className="text-center text-xs text-muted-foreground bg-card/80 backdrop-blur-sm rounded-lg px-4 py-3 ring-1 ring-foreground/10 mt-4">
                <ListChecks className="size-5 mx-auto mb-1.5 opacity-50" />
                从左侧点击或拖入节点开始编排
              </div>
            </Panel>
          )}

          {isViewer && nodes.length === 0 && (
            <Panel position="top-center" className="!m-0 !pointer-events-none">
              <div className="text-center text-xs text-muted-foreground bg-card/80 backdrop-blur-sm rounded-lg px-4 py-3 ring-1 ring-foreground/10 mt-4">
                <ListChecks className="size-5 mx-auto mb-1.5 opacity-50" />
                画布为空 · 此任务尚未编排
              </div>
            </Panel>
          )}
        </div>
      </div>
      {/* R20: AI DAG assistant — fixed-position overlay */}
      <AiAssistantDialog
        open={aiOpen}
        onOpenChange={setAiOpen}
        onGenerate={handleAiGenerate}
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function pickFirstBot(nodes: DagNodeRecord[]): string | undefined {
  for (const n of nodes)
    if (n.meta.kind === "bot" && n.meta.refId) return n.meta.refId;
  return undefined;
}

function toFlatLists(
  nodes: Node[],
  edges: Edge[],
): { nodes: DagNodeRecord[]; edges: DagEdgeRecord[] } {
  const out: {
    nodes: DagNodeRecord[];
    edges: DagEdgeRecord[];
  } = { nodes: [], edges: [] };
  for (const n of nodes) {
    const meta = n.data as DagNodeMeta | undefined;
    if (!meta) continue;
    // Strip runtime-only status/approvalActor/approvalNote from the persisted
    // meta? Keep them for now — the engine treats them as idempotent state.
    out.nodes.push({ shapeId: n.id, meta });
  }
  for (const e of edges) {
    if (!e.source || !e.target) continue;
    out.edges.push({ from: e.source, to: e.target });
  }
  return out;
}

function parallelismFromNodes(nodes: Node[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const n of nodes) {
    const meta = n.data as DagNodeMeta | undefined;
    if (meta?.kind === "parallel" && typeof meta.config?.degree === "number") {
      out[n.id] = meta.config.degree as number;
    }
  }
  return out;
}

/**
 * Normalise the incoming snapshot into RF nodes/edges.
 * Three branches:
 *  1. null / undefined        → empty canvas
 *  2. RF format {nodes, edges} → use directly
 *  3. DagDocument {snapshot: {nodes, edges}, nodes, edges}
 *  4. Legacy tldraw snapshot   → fall back to derived flat nodes/edges with
 *                                grid layout (positions are unrecoverable)
 */
function normaliseInitialDoc(
  snapshot: unknown,
  _botId?: string,
): DocState {
  if (!snapshot) return { nodes: [], edges: [] };

  // Branch: DagDocument wrapper (this is what /tasks/[id] passes via
  // initialSnapshot = pipeline.config.snapshot which is itself an RF doc now).
  const asDoc = snapshot as Partial<{
    snapshot: { nodes: unknown[]; edges: unknown[] };
    nodes: unknown[];
    edges: unknown[];
  }>;

  // If snapshot is a DagDocument with embedded RF doc
  if (asDoc.snapshot && typeof asDoc.snapshot === "object") {
    const inner = asDoc.snapshot as { nodes?: unknown[]; edges?: unknown[] };
    if (Array.isArray(inner.nodes) && Array.isArray(inner.edges)) {
      const nodes = inner.nodes
        .filter(isRfNodeLike)
        .map(cloneRfNode) as DagRfNode[];
      const edges = inner.edges
        .filter(isRfEdgeLike)
        .map(cloneRfEdge) as DagRfEdge[];
      if (nodes.length || edges.length) return { nodes, edges };
    }
  }

  // Direct RF document { nodes, edges } (no wrapper)
  const asRf = snapshot as { nodes?: unknown[]; edges?: unknown[] };
  if (
    Array.isArray(asRf.nodes) &&
    Array.isArray(asRf.edges) &&
    !asDoc.nodes // not the flat-list DagDocument shape
  ) {
    const nodes = asRf.nodes!.filter(isRfNodeLike).map(cloneRfNode) as DagRfNode[];
    const edges = asRf.edges!.filter(isRfEdgeLike).map(cloneRfEdge) as DagRfEdge[];
    if (nodes.length || edges.length) return { nodes, edges };
  }

  // Branch 4: legacy fallback — rebuild from flat nodes/edges lists.
  // Positions are laid out on a simple grid.
  const flatNodes = (asDoc.nodes ?? []) as Array<{
    shapeId: string;
    meta: DagNodeMeta;
  }>;
  const flatEdges = (asDoc.edges ?? []) as DagEdgeRecord[];
  if (flatNodes.length > 0) {
    const nodes: DagRfNode[] = flatNodes.map((n, i) => ({
      id: n.shapeId,
      type: "dagNode",
      position: {
        x: 80 + (i % 5) * 240,
        y: 80 + Math.floor(i / 5) * 140,
      },
      data: { ...n.meta },
    }));
    const nodesById = new Set(nodes.map((n) => n.id));
    const edges: DagRfEdge[] = flatEdges
      .filter((e) => nodesById.has(e.from) && nodesById.has(e.to))
      .map((e, i) => ({
        id: `e_${e.from}_${e.to}_${i}`,
        source: e.from,
        target: e.to,
        type: "smoothstep",
        animated: false,
      }));
    return { nodes, edges };
  }

  // Legacy tldraw TLStoreSnapshot — we can't parse it; render empty canvas.
  // The user re-creates the graph. (Panmira is pre-production; no real data
  // was ever persisted in the tldraw format from a customer pipeline.)
  return { nodes: [], edges: [] };
}

function isRfNodeLike(v: unknown): v is Node {
  if (!v || typeof v !== "object") return false;
  const n = v as Record<string, unknown>;
  return (
    typeof n.id === "string" &&
    typeof n.position === "object" &&
    typeof n.data === "object"
  );
}

function isRfEdgeLike(v: unknown): v is Edge {
  if (!v || typeof v !== "object") return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.id === "string" &&
    typeof e.source === "string" &&
    typeof e.target === "string"
  );
}

function cloneRfNode(n: Node): DagRfNode {
  return {
    ...n,
    type: "dagNode",
    // RF sometimes stores undefined for selected; normalise.
    selected: false,
    data: { ...(n.data as object) },
  } as DagRfNode;
}

function cloneRfEdge(e: Edge): DagRfEdge {
  return { ...e, selected: false };
}

// ────────────────────────────────────────────────────────────────────────────
// Toolbar button
// ────────────────────────────────────────────────────────────────────────────

function ToolBtn({
  children,
  onClick,
  title,
  active,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  title?: string;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "grid place-items-center size-7 rounded-md transition-colors",
        active
          ? "bg-muted text-foreground ring-1 ring-foreground/15"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
        disabled && "opacity-40 cursor-not-allowed hover:bg-transparent",
      )}
    >
      {children}
    </button>
  );
}

// Silence unused-import warnings for type-only / future imports.
void validateEdgeRules;
void Trash2;
