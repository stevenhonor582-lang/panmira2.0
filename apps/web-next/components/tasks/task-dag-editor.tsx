// R13-D: Real tldraw-based DAG editor (replaces P3.4 placeholder).
// 6-shape palette + canvas + config panel + toolbar (validate/save/test-run).
"use client";

import * as React from "react";
import type { Editor } from "@tldraw/editor";
import type { TLStoreSnapshot } from "@tldraw/editor";
import { createShapeId, type TLShapeId } from "@tldraw/tlschema";
import "tldraw/tldraw.css";

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
  Undo2,
  UserRound,
  Wrench,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from "lucide-react";

import { DAG_SHAPE_UTILS, DAG_SHAPE_H, DAG_SHAPE_W, type DagNodeShape } from "./node-shapes";
import {
  DagEdgeRecord,
  DagNodeMeta,
  DagNodeRecord,
  NodeKind,
  NODE_KIND_MAP,
} from "./types";
import { ShapeConfigPanel } from "./shape-config-panel";
import { validateDag } from "./dag-validators";
import { triggerPipelineAsync } from "@/lib/pipeline-trigger";
import { cn } from "@/lib/utils";

interface TaskDagEditorProps {
  pipelineId?: string;
  initialSnapshot?: unknown;
  initialValue?: unknown;
  initialName?: string;
  initialBotId?: string;
  variant?: "editor" | "viewer";
  onChange?: (value: unknown) => void;
  hideToolbar?: boolean;
  readOnly?: boolean;
}

const PALETTE: Array<{ kind: NodeKind; icon: LucideIcon; hint: string }> = [
  { kind: "bot", icon: Bot, hint: "拉取 8 个数字员工之一" },
  { kind: "human", icon: UserRound, hint: "史德飞 + 团队成员审批/兜底" },
  { kind: "skill", icon: Wrench, hint: "skills/MCP 库中的能力" },
  { kind: "tool", icon: Hammer, hint: "底层工具函数" },
  { kind: "conditional", icon: GitFork, hint: "if/else 条件路由" },
  { kind: "parallel", icon: Split, hint: "并行分支 fan-out/fan-in" },
];

export function TaskDagEditor(props: TaskDagEditorProps) {
  const isViewer = props.variant === "viewer" || props.readOnly === true;
  const [editor, setEditor] = React.useState<Editor | null>(null);
  const [selectedShapeId, setSelectedShapeId] = React.useState<string | null>(null);
  const [validationMsg, setValidationMsg] = React.useState<{ ok: boolean; text: string }>({
    ok: true,
    text: "校验: 待编辑",
  });
  const [saving, setSaving] = React.useState(false);
  const [running, setRunning] = React.useState(false);
  const [showGrid, setShowGrid] = React.useState(true);
  const [snapshotVersion, setSnapshotVersion] = React.useState(0);

  const initialSnapshot = (props.initialSnapshot ?? props.initialValue ?? null) as TLStoreSnapshot | null;

  const docRef = React.useRef<{
    snapshot: unknown;
    nodes: DagNodeRecord[];
    edges: DagEdgeRecord[];
    botId?: string;
  }>({
    snapshot: initialSnapshot as unknown,
    nodes: [],
    edges: [],
    botId: props.initialBotId,
  });

  const handleMount = React.useCallback(
    (e: Editor) => {
      setEditor(e);
      e.updateInstanceState({ isGridMode: showGrid });
    },
    [showGrid],
  );

  React.useEffect(() => {
    if (!editor) return;
    const unsub = editor.store.listen(
      () => {
        const only = editor.getSelectedShapeIds();
        setSelectedShapeId(only.length === 1 ? (only[0] as string) : null);
        setSnapshotVersion((v) => v + 1);
      },
      { scope: "session", source: "user" },
    );
    return () => unsub();
  }, [editor]);

  const derived = React.useMemo(() => {
    if (!editor) return { nodes: [] as DagNodeRecord[], edges: [] as DagEdgeRecord[] };
    return deriveDoc(editor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, snapshotVersion]);

  React.useEffect(() => {
    docRef.current = {
      snapshot: editor ? (editor.store.serialize() as unknown) : initialSnapshot,
      nodes: derived.nodes,
      edges: derived.edges,
      botId: props.initialBotId ?? pickFirstBot(derived.nodes),
    };
    props.onChange?.(docRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [derived, editor]);

  React.useEffect(() => {
    const v = validateDag(
      derived.nodes.map((n) => ({ shapeId: n.shapeId, kind: n.meta.kind })),
      derived.edges,
    );
    setValidationMsg({ ok: v.ok, text: v.summary });
  }, [derived]);

  const addNode = React.useCallback(
    (kind: NodeKind) => {
      if (!editor || isViewer) return;
      const meta: DagNodeMeta = { kind, label: NODE_KIND_MAP[kind].label + " · 新" };
      const id = createShapeId() as TLShapeId;
      const vp = editor.getViewportPageBounds();
      const cx = vp.center.x - DAG_SHAPE_W / 2;
      const cy = vp.center.y - DAG_SHAPE_H / 2;
      editor.createShape<any>({
        id,
        type: "dag-node",
        x: cx,
        y: cy,
        props: { w: DAG_SHAPE_W, h: DAG_SHAPE_H, meta },
      });
    },
    [editor, isViewer],
  );

  const updateSelectedMeta = React.useCallback(
    (patch: Partial<DagNodeMeta>) => {
      if (!editor || !selectedShapeId) return;
      const shape = editor.getShape(selectedShapeId as TLShapeId) as unknown as
        | { id: TLShapeId; props: { w: number; h: number; meta: DagNodeMeta } }
        | undefined;
      if (!shape) return;
      const nextMeta = { ...shape.props.meta, ...patch } as DagNodeMeta;
      editor.updateShape<any>({
        id: shape.id,
        type: "dag-node",
        props: { w: shape.props.w, h: shape.props.h, meta: nextMeta },
      });
    },
    [editor, selectedShapeId],
  );

  const deleteSelected = React.useCallback(() => {
    if (!editor || isViewer) return;
    editor.deleteShapes(editor.getSelectedShapeIds());
  }, [editor, isViewer]);

  const handleSave = React.useCallback(async () => {
    if (!editor) return;
    setSaving(true);
    try {
      const doc = {
        snapshot: editor.store.serialize() as unknown,
        nodes: derived.nodes,
        edges: derived.edges,
        botId: docRef.current.botId,
      };
      props.onChange?.(doc);
      window.dispatchEvent(new CustomEvent("dag:save", { detail: doc }));
    } finally {
      setSaving(false);
    }
  }, [editor, derived, props]);

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
      const r = await triggerPipelineAsync(
        { pipelineId: props.pipelineId, triggeredBy: "user" },
        fetch,
      );
      if (r.kind === "failed") window.alert(`触发失败: ${r.error}`);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "触发失败");
    } finally {
      setRunning(false);
    }
  }, [props.pipelineId, validationMsg]);

  const selectedMeta: DagNodeMeta | null = React.useMemo(() => {
    if (!editor || !selectedShapeId) return null;
    const s = editor.getShape(selectedShapeId as TLShapeId) as unknown as
      | { props?: { meta?: DagNodeMeta } }
      | undefined;
    return s?.props?.meta ?? null;
  }, [editor, selectedShapeId, snapshotVersion]);

  const tg = React.useCallback(
    (fn: (e: Editor) => void) => () => {
      if (editor) fn(editor);
    },
    [editor],
  );

  return (
    <div className="flex h-full min-h-[640px] border rounded-xl overflow-hidden bg-card">
      {!isViewer && (
        <aside className="w-[148px] shrink-0 border-r bg-muted/20 p-2 flex flex-col gap-1.5 overflow-y-auto">
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
                onClick={() => addNode(p.kind)}
                title={p.hint}
                className="group flex items-center gap-2 px-2 py-1.5 rounded-md ring-1 ring-transparent hover:ring-foreground/15 hover:bg-card transition-colors text-left"
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
                  <div className="text-[9px] text-muted-foreground truncate">点击添加</div>
                </div>
              </button>
            );
          })}
          <div className="mt-auto pt-2 border-t text-[9px] text-muted-foreground leading-snug">
            拖拽画布平移 · 滚轮缩放 · 选中后 Delete 删除
          </div>
        </aside>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        {!props.hideToolbar && (
          <div className="flex items-center gap-1 px-3 py-2 border-b bg-muted/10 flex-wrap">
            <div className="flex items-center gap-0.5 mr-2">
              <ToolBtn title="撤销" onClick={tg((e) => e.undo())} disabled={isViewer}>
                <Undo2 className="size-3.5" />
              </ToolBtn>
              <ToolBtn title="重做" onClick={tg((e) => e.redo())} disabled={isViewer}>
                <Redo2 className="size-3.5" />
              </ToolBtn>
            </div>
            <div className="w-px h-5 bg-foreground/10 mx-1" />
            <ToolBtn title="缩小" onClick={tg((e) => e.zoomOut())}>
              <ZoomOut className="size-3.5" />
            </ToolBtn>
            <ToolBtn title="放大" onClick={tg((e) => e.zoomIn())}>
              <ZoomIn className="size-3.5" />
            </ToolBtn>
            <ToolBtn
              title="对齐网格"
              active={showGrid}
              onClick={() => {
                const next = !showGrid;
                setShowGrid(next);
                editor?.updateInstanceState({ isGridMode: next });
              }}
            >
              <Grid3x3 className="size-3.5" />
            </ToolBtn>
            <ToolBtn title="适应内容" onClick={tg((e) => e.zoomToFit())}>
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
                    onClick={handleSave}
                    disabled={saving}
                    className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-xs bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="size-3 animate-spin" /> : <Save className="size-3" />}
                    保存
                  </button>
                  {props.pipelineId && (
                    <button
                      type="button"
                      onClick={handleTestRun}
                      disabled={running}
                      className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-xs ring-1 ring-foreground/15 hover:bg-muted disabled:opacity-50"
                    >
                      {running ? <Loader2 className="size-3 animate-spin" /> : <Play className="size-3" />}
                      测试运行
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        <div className="flex-1 min-h-0 relative">
          <TldrawLazy
            onMount={handleMount}
            shapeUtils={DAG_SHAPE_UTILS}
            initialState={initialSnapshot as never}
            hideUi={isViewer}
          />
          {!isViewer && selectedMeta && (
            <div className="absolute right-3 top-3 bottom-3 w-[260px] z-10">
              <ShapeConfigPanel
                meta={selectedMeta}
                onChange={updateSelectedMeta}
                onDelete={deleteSelected}
              />
            </div>
          )}
          {derived.nodes.length === 0 && !isViewer && (
            <div className="absolute inset-0 grid place-items-center pointer-events-none">
              <div className="text-center text-xs text-muted-foreground bg-card/80 backdrop-blur-sm rounded-lg px-4 py-3 ring-1 ring-foreground/10">
                <ListChecks className="size-5 mx-auto mb-1.5 opacity-50" />
                从左侧点击添加节点开始编排
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default TaskDagEditor;

function pickFirstBot(nodes: DagNodeRecord[]): string | undefined {
  for (const n of nodes) if (n.meta.kind === "bot" && n.meta.refId) return n.meta.refId;
  return undefined;
}

function deriveDoc(editor: Editor): { nodes: DagNodeRecord[]; edges: DagEdgeRecord[] } {
  const nodes: DagNodeRecord[] = [];
  const edges: DagEdgeRecord[] = [];
  for (const s of editor.getCurrentPageShapes()) {
    const shapeAny = s as unknown as {
      id: string;
      type: string;
      props: {
        meta?: DagNodeMeta;
        start?: { type?: string; boundShapeId?: string };
        end?: { type?: string; boundShapeId?: string };
      };
    };
    if (shapeAny.type === "dag-node") {
      if (shapeAny.props?.meta) {
        nodes.push({ shapeId: shapeAny.id, meta: shapeAny.props.meta });
      }
    } else if (shapeAny.type === "arrow") {
      const from = shapeAny.props.start?.boundShapeId;
      const to = shapeAny.props.end?.boundShapeId;
      if (from && to) edges.push({ from, to });
    }
  }
  return { nodes, edges };
}

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

interface TldrawLazyProps {
  onMount: (editor: Editor) => void;
  shapeUtils: typeof DAG_SHAPE_UTILS;
  initialState?: unknown;
  hideUi?: boolean;
}

const TldrawLazy: React.FC<TldrawLazyProps> = (props) => {
  const TldrawMod = React.useRef<React.ComponentType<Record<string, unknown>> | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  React.useEffect(() => {
    import("tldraw")
      .then((m) => {
        TldrawMod.current = m.Tldraw as React.ComponentType<Record<string, unknown>>;
        setErr(null);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);
  if (err) {
    return (
      <div className="absolute inset-0 grid place-items-center text-xs text-rose-600">
        tldraw 加载失败: {err}
      </div>
    );
  }
  const Comp = TldrawMod.current;
  if (!Comp) {
    return (
      <div className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">
        <Loader2 className="size-3 animate-spin mr-2 inline-block" />
        加载画布…
      </div>
    );
  }
  return (
    <div className="absolute inset-0">
      <Comp
        onMount={props.onMount as never}
        shapeUtils={props.shapeUtils as never}
        hideUi={props.hideUi}
        snapshot={props.initialState as never}
      />
    </div>
  );
};
