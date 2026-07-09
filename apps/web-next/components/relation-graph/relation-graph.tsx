"use client";

/**
 * R33-B: 通用只读关系图组件(React Flow)。
 *
 * R33-B 改动(用户原话 ④⑭):
 *   - 新增 `person` kind(真人本体,琥珀色,大节点居中)。
 *   - 防御性过滤:丢弃 source/target 不对应任何 node 的无效 edge
 *     (这是"连线不显示"的根本原因之一,ReactFlow 会静默丢弃悬空 edge)。
 *   - 自检重绘:nodes 有但 edges=0 → console.warn + 触发 onEmptyEdges 回调,
 *     父组件据此重算或强制补边。
 *   - fitView 保障:nodes/edges 变化后强制 fitView({padding:0.22,duration:200}),
 *     杜绝"节点画在视口外看不见"。
 *   - edge 默认样式强制可见:opacity 0.85, strokeWidth 1.8, 灰蓝色
 *     (杜绝"透明/0 宽度"导致的隐形边)。
 *
 * 用法:
 *   <RelationGraph nodes={nodes} edges={edges} onEmptyEdges={() => rebuild()} />
 *
 * 节点类型(由 data.kind 决定样式):
 *   - entry        入口(网页/bot),绿色
 *   - person       真人本体(中心琥珀色高亮,大节点)— R33-B 新增
 *   - agent        数字员工,蓝色
 *   - self         当前 Agent(中心紫色高亮,大节点)
 *   - related      关联 Agent(外链),蓝色虚线
 *   - resource     资源(KB/技能/工具/MCP/任务),灰色
 *   - shared       共享资源(被多 Agent 引用),红色高亮
 *
 * 只读模式:nodesDraggable=false, nodesConnectable=false。
 * 边可分样式:default / dashed(外链) / danger(共享资源) / strong(紫) / person(琥珀)。
 */

import * as React from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  Handle,
  Position,
  useReactFlow,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

// ────────────────────────────────────────────────────────────
// 节点数据契约
// ────────────────────────────────────────────────────────────

export type RelationNodeKind =
  | "entry"
  | "person" // R33-B 新增:真人本体
  | "agent"
  | "self"
  | "related"
  | "resource"
  | "shared";

export interface RelationNodeData {
  kind: RelationNodeKind;
  label: string;
  sublabel?: string;
  /** lucide icon 名称(组件侧用 ICONS 映射渲染) */
  icon?: string;
  /** 右上角徽章,如 "共享" / "×3" / "本人" */
  badge?: string;
  /** 资源类型(仅 resource/shared 节点用),用于色块分组 */
  category?: "kb" | "skill" | "tool" | "mcp" | "task";
  /** 节点尺寸:self/person/cluster 用 lg(更大、更突出) */
  size?: "default" | "lg";
  /** 簇节点明细(同类资源聚合时,前几项预览 + hover title 看全部) */
  items?: string[];
  [key: string]: unknown;
}

export type RelationNode = Node<RelationNodeData>;
export type RelationEdge = Edge;

// ────────────────────────────────────────────────────────────
// 图标映射(避免把 React 组件塞进 node.data)
// ────────────────────────────────────────────────────────────

import {
  Bot,
  Globe,
  MessageSquare,
  Database,
  Workflow,
  Wrench,
  Radio,
  Plug,
  Users,
  Network,
  User2,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  bot: Bot,
  globe: Globe,
  message: MessageSquare,
  database: Database,
  workflow: Workflow,
  wrench: Wrench,
  radio: Radio,
  plug: Plug,
  users: Users,
  network: Network,
  user: User2,
};

// ────────────────────────────────────────────────────────────
// 节点组件
// ────────────────────────────────────────────────────────────

const KIND_STYLES: Record<
  RelationNodeKind,
  { ring: string; bg: string; iconWrap: string; iconColor: string }
> = {
  entry: {
    ring: "ring-emerald-500/40 hover:ring-emerald-500/70",
    bg: "bg-emerald-500/[0.07]",
    iconWrap: "bg-emerald-500/15",
    iconColor: "text-emerald-600 dark:text-emerald-400",
  },
  person: {
    ring: "ring-amber-500/70 hover:ring-amber-500 shadow-[0_0_0_3px_rgba(245,158,11,0.20)]",
    bg: "bg-amber-500/[0.10]",
    iconWrap: "bg-amber-500/20",
    iconColor: "text-amber-600 dark:text-amber-300",
  },
  agent: {
    ring: "ring-sky-500/40 hover:ring-sky-500/70",
    bg: "bg-sky-500/[0.06]",
    iconWrap: "bg-sky-500/15",
    iconColor: "text-sky-600 dark:text-sky-400",
  },
  self: {
    ring: "ring-violet-500/70 hover:ring-violet-500 shadow-[0_0_0_3px_rgba(139,92,246,0.18)]",
    bg: "bg-violet-500/[0.10]",
    iconWrap: "bg-violet-500/20",
    iconColor: "text-violet-600 dark:text-violet-300",
  },
  related: {
    ring: "ring-sky-500/30 hover:ring-sky-500/50 ring-dashed",
    bg: "bg-sky-500/[0.04]",
    iconWrap: "bg-sky-500/10",
    iconColor: "text-sky-600/80 dark:text-sky-400/80",
  },
  resource: {
    ring: "ring-border hover:ring-foreground/30",
    bg: "bg-card",
    iconWrap: "bg-muted",
    iconColor: "text-foreground/70",
  },
  shared: {
    ring: "ring-rose-500/60 hover:ring-rose-500 shadow-[0_0_0_2px_rgba(244,63,94,0.20)]",
    bg: "bg-rose-500/[0.08]",
    iconWrap: "bg-rose-500/15",
    iconColor: "text-rose-600 dark:text-rose-400",
  },
};

const CATEGORY_COLOR: Record<NonNullable<RelationNodeData["category"]>, string> = {
  kb: "text-emerald-600 dark:text-emerald-400",
  skill: "text-amber-600 dark:text-amber-400",
  tool: "text-rose-600 dark:text-rose-400",
  mcp: "text-indigo-600 dark:text-indigo-400",
  task: "text-sky-600 dark:text-sky-400",
};

function RelationNodeView({ data, selected }: NodeProps) {
  const d = data as RelationNodeData;
  const s = KIND_STYLES[d.kind];
  const fallbackIcon = d.kind === "person" ? User2 : Bot;
  const Icon = (d.icon && ICONS[d.icon]) || fallbackIcon;
  const iconColor =
    d.kind === "resource" && d.category ? CATEGORY_COLOR[d.category] : s.iconColor;

  const badgeBg =
    d.kind === "shared"
      ? "bg-rose-500 text-white"
      : d.kind === "person"
        ? "bg-amber-500 text-white"
        : d.kind === "self"
          ? "bg-violet-500 text-white"
          : "bg-foreground text-background";

  return (
    <div
      className={[
        "group relative flex items-center gap-2.5 rounded-xl px-3 py-2.5 ring-1 transition-all",
        d.size === "lg" ? "w-[224px] px-3.5 py-3 ring-1.5" : "w-[180px]",
        s.bg,
        s.ring,
        selected ? "ring-2 ring-offset-1 ring-offset-background ring-foreground/60" : "",
      ].join(" ")}
      title={d.items && d.items.length > 0 ? d.items.join("、") : undefined}
    >
      {/* R33-B 关键修复:ReactFlow v16 渲染 edge 依赖节点的 Handle 计算连线锚点。
          节点没有 Handle → ReactFlow 不知道 edge 连到节点哪个位置 → 静默不渲染 edge。
          这是"连线不显示"顽固 bug 的根本原因。
          Handle 视觉上隐藏(透明、零尺寸),但 ReactFlow 仍用它定位 edge 端点。 */}
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={false}
        style={{ opacity: 0, width: 1, height: 1, minWidth: 1, minHeight: 1 }}
      />
      <span className={["shrink-0 rounded-lg p-1.5", s.iconWrap].join(" ")}>
        <Icon className={["size-4", iconColor].join(" ")} />
      </span>
      <div className="min-w-0 flex-1">
        <div
          className={[
            "truncate font-medium leading-tight text-foreground/90",
            d.size === "lg" ? "text-[13.5px]" : "text-[12.5px]",
          ].join(" ")}
        >
          {d.label}
        </div>
        {d.sublabel && (
          <div className="mt-0.5 truncate font-mono text-[10px] text-foreground/55">
            {d.sublabel}
          </div>
        )}
      </div>
      {d.badge && (
        <span
          className={[
            "absolute -right-1.5 -top-1.5 inline-flex items-center rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold leading-none",
            badgeBg,
          ].join(" ")}
        >
          {d.badge}
        </span>
      )}
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={false}
        style={{ opacity: 0, width: 1, height: 1, minWidth: 1, minHeight: 1 }}
      />
    </div>
  );
}

const NODE_TYPES = {
  relation: RelationNodeView,
};

// ────────────────────────────────────────────────────────────
// 边样式:按 edge.data.style 分类返回;全部强制 opacity ≥ 0.85
// ────────────────────────────────────────────────────────────

function edgeStyle(edge: RelationEdge): React.CSSProperties {
  const styleKind = (edge.data as { style?: string } | undefined)?.style;
  const OPACITY = 0.88;
  if (styleKind === "dashed") {
    return { stroke: "rgb(14 165 233)", strokeDasharray: "6 4", strokeWidth: 1.8, opacity: OPACITY };
  }
  if (styleKind === "danger") {
    return { stroke: "rgb(244 63 94)", strokeWidth: 2.1, opacity: 0.95 };
  }
  if (styleKind === "strong") {
    return { stroke: "rgb(139 92 246)", strokeWidth: 2.2, opacity: 0.95 };
  }
  if (styleKind === "person") {
    return { stroke: "rgb(245 158 11)", strokeWidth: 2.2, opacity: 0.95 };
  }
  // 默认:强制可见(灰蓝,绝不透明 / 0 宽度)
  return { stroke: "rgb(148 163 184)", strokeWidth: 1.8, opacity: OPACITY };
}

// ────────────────────────────────────────────────────────────
// 主组件
// ────────────────────────────────────────────────────────────

interface RelationGraphProps {
  nodes: RelationNode[];
  edges: RelationEdge[];
  height?: number;
  /** 空数据时提示文案 */
  emptyHint?: string;
  /** 是否显示小地图(默认显示) */
  showMiniMap?: boolean;
  /**
   * R33-B 自检回调:nodes 有数据但 edges=0(关系异常)时触发。
   * 父组件应据此重算或强制补边,避免出现"孤点画布"。
   */
  onEmptyEdges?: () => void;
}

function GraphInner({
  nodes: inNodes,
  edges: inEdges,
  height = 480,
  emptyHint,
  showMiniMap = true,
  onEmptyEdges,
}: RelationGraphProps) {
  const { fitView } = useReactFlow();

  // R33-B 防御性过滤:丢弃 source/target 不对应任何 node 的无效 edge。
  // ReactFlow 对悬空 edge 的处理是静默不渲染,这是"连线不显示"顽固 bug 的根因之一。
  const nodeIds = React.useMemo(() => new Set(inNodes.map((n) => n.id)), [inNodes]);

  // R33-B 关键修复:节点尺寸预设。
  // ReactFlow v16 渲染 edge 时需要 source/target 节点的 width/height 来计算路径锚点。
  // 若节点是 custom HTML 节点,首次渲染时 ResizeObserver 还没完成 measure,
  // 导致 `.react-flow__edges` 容器渲染为空(edge 拿不到坐标 → 静默不画)。
  // 修复:根据 data.size 预设 width/height,跳过 measure 等待,edge 立即渲染。
  const NODE_SIZE_DEFAULT = { width: 180, height: 60 };
  const NODE_SIZE_LG = { width: 224, height: 72 };

  const { nodes, edges, dropped } = React.useMemo(() => {
    // 1) 给每个 node 注入 width/height(基于 data.size)
    const sizedNodes = inNodes.map((n) => {
      const data = n.data as RelationNodeData | undefined;
      const size = data?.size === "lg" ? NODE_SIZE_LG : NODE_SIZE_DEFAULT;
      return {
        ...n,
        width: n.width ?? size.width,
        height: n.height ?? size.height,
      };
    });

    // 2) 过滤无效 edge + 注入 style(让 edgeStyle 函数真正生效到 DOM)
    const valid: RelationEdge[] = [];
    const invalid: RelationEdge[] = [];
    for (const e of inEdges) {
      if (e && e.source && e.target && nodeIds.has(e.source) && nodeIds.has(e.target)) {
        valid.push({ ...e, style: e.style ?? edgeStyle(e) });
      } else {
        invalid.push(e);
      }
    }
    return { nodes: sizedNodes, edges: valid, dropped: invalid };
  }, [inNodes, inEdges, nodeIds]);

  React.useEffect(() => {
    if (dropped.length > 0) {
      console.warn(
        `[RelationGraph] 丢弃 ${dropped.length} 条无效 edge(source/target 不匹配 node)`,
      );
    }
  }, [dropped]);

  // R33-B 自检重绘:nodes > 0 但 edges === 0 → 关系数据异常,通知父组件。
  React.useEffect(() => {
    if (nodes.length > 0 && edges.length === 0) {
      console.warn(
        `[RelationGraph] ${nodes.length} 个节点但 0 条连线,关系数据可能异常,触发 onEmptyEdges`,
      );
      onEmptyEdges?.();
    }
  }, [nodes.length, edges.length, onEmptyEdges]);

  // R33-B fitView 保障:nodes/edges 变化后强制重新适配视口,避免节点在视口外不可见。
  React.useEffect(() => {
    if (nodes.length === 0) return;
    const t = setTimeout(() => {
      try {
        fitView({ padding: 0.22, minZoom: 0.4, maxZoom: 1.3, duration: 200 });
      } catch (err) {
        console.warn("[RelationGraph] fitView 失败", err);
      }
    }, 80);
    return () => clearTimeout(t);
  }, [nodes, edges, fitView]);

  if (nodes.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-2xl border border-dashed border-border bg-muted/20 text-[13px] text-muted-foreground"
        style={{ height }}
      >
        {emptyHint ?? "暂无关系数据"}
      </div>
    );
  }
  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-border bg-background ring-1 ring-border/50"
      style={{ height }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        defaultEdgeOptions={{
          style: { stroke: "rgb(148 163 184)", strokeWidth: 1.8, opacity: 0.88 },
        }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={true}
        zoomOnScroll={true}
        panOnScroll={false}
        zoomOnDoubleClick={false}
        nodesFocusable={false}
        edgesFocusable={false}
        proOptions={{ hideAttribution: true }}
        fitView
        fitViewOptions={{ padding: 0.22, minZoom: 0.4, maxZoom: 1.3 }}
        fitViewPropagation
        minZoom={0.3}
        maxZoom={1.5}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={18}
          size={1}
          color="rgb(140 140 150 / 0.35)"
        />
        <Controls
          showInteractive={false}
          className="!rounded-lg !border !border-border !bg-card !shadow-sm"
        />
        {showMiniMap && (
          <MiniMap
            pannable
            zoomable
            className="!rounded-lg !border !border-border !bg-card"
            maskColor="rgb(140 140 150 / 0.35)"
            nodeColor={(n) => {
              const kind = (n.data as RelationNodeData | undefined)?.kind;
              switch (kind) {
                case "entry":
                  return "#10b981";
                case "person":
                  return "#f59e0b";
                case "self":
                  return "#8b5cf6";
                case "related":
                  return "#0ea5e9";
                case "shared":
                  return "#f43f5e";
                case "resource":
                  return "#71717a";
                case "agent":
                  return "#0ea5e9";
                default:
                  return "#71717a";
              }
            }}
          />
        )}
      </ReactFlow>
    </div>
  );
}

export function RelationGraph(props: RelationGraphProps) {
  return (
    <ReactFlowProvider>
      <GraphInner {...props} />
    </ReactFlowProvider>
  );
}

// ────────────────────────────────────────────────────────────
// 辅助 edge 构造器(调用方用)
// ────────────────────────────────────────────────────────────

export function dashedEdge(extra?: Partial<RelationEdge>): RelationEdge {
  return { id: "", source: "", target: "", data: { style: "dashed" }, ...extra } as RelationEdge;
}

export function dangerEdge(extra?: Partial<RelationEdge>): RelationEdge {
  return { id: "", source: "", target: "", data: { style: "danger" }, ...extra } as RelationEdge;
}

export function strongEdge(extra?: Partial<RelationEdge>): RelationEdge {
  return { id: "", source: "", target: "", data: { style: "strong" }, ...extra } as RelationEdge;
}

/** R33-B 新增:真人本体边(琥珀色加粗,强调"指向/出自真人") */
export function personEdge(extra?: Partial<RelationEdge>): RelationEdge {
  return { id: "", source: "", target: "", data: { style: "person" }, ...extra } as RelationEdge;
}
