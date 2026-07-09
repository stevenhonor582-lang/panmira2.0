"use client";

/**
 * R28-B: 通用只读关系图组件(React Flow)。
 *
 * 用法:
 *   <RelationGraph nodes={nodes} edges={edges} />
 *
 * 节点类型(由 data.kind 决定样式):
 *   - entry        入口(网页/bot),绿色
 *   - agent        数字员工,蓝色
 *   - self         当前 Agent(中心高亮),紫色描边
 *   - related      关联 Agent(外链),蓝色虚线
 *   - resource     资源(KB/技能/工具/MCP/任务),灰色
 *   - shared       共享资源(被多 Agent 引用),红色高亮
 *
 * 只读模式:nodesDraggable=false, nodesConnectable=false。
 * 边可分样式:default / dashed(外链) / danger(共享资源)。
 */

import * as React from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
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
  /** 右上角徽章,如 "共享" / "×3" */
  badge?: string;
  /** 资源类型(仅 resource/shared 节点用),用于色块分组 */
  category?: "kb" | "skill" | "tool" | "mcp" | "task";
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
  const Icon = (d.icon && ICONS[d.icon]) || Bot;
  const iconColor = d.kind === "resource" && d.category
    ? CATEGORY_COLOR[d.category]
    : s.iconColor;

  return (
    <div
      className={[
        "group relative flex w-[180px] items-center gap-2.5 rounded-xl px-3 py-2.5 ring-1 transition-all",
        s.bg,
        s.ring,
        selected ? "ring-2 ring-offset-1 ring-offset-background ring-foreground/60" : "",
      ].join(" ")}
    >
      <span className={["shrink-0 rounded-lg p-1.5", s.iconWrap].join(" ")}>
        <Icon className={["size-4", iconColor].join(" ")} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12.5px] font-medium leading-tight text-foreground/90">
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
            d.kind === "shared"
              ? "bg-rose-500 text-white"
              : "bg-foreground text-background",
          ].join(" ")}
        >
          {d.badge}
        </span>
      )}
    </div>
  );
}

const NODE_TYPES = {
  relation: RelationNodeView,
};

// ────────────────────────────────────────────────────────────
// 默认边样式(按 edge.data.style 或 edge.className)
// ────────────────────────────────────────────────────────────

function edgeStyle(edge: RelationEdge): React.CSSProperties {
  const styleKind = (edge.data as { style?: string } | undefined)?.style;
  if (styleKind === "dashed") {
    return { stroke: "rgb(14 165 233 / 0.55)", strokeDasharray: "6 4", strokeWidth: 1.4 };
  }
  if (styleKind === "danger") {
    return { stroke: "rgb(244 63 94 / 0.75)", strokeWidth: 1.8 };
  }
  if (styleKind === "strong") {
    return { stroke: "rgb(139 92 246 / 0.75)", strokeWidth: 2 };
  }
  return { stroke: "rgb(120 120 130 / 0.45)", strokeWidth: 1.2 };
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
}

function GraphInner({ nodes, edges, height = 480, emptyHint, showMiniMap = true }: RelationGraphProps) {
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
        defaultEdgeOptions={{ style: { stroke: "rgb(120 120 130 / 0.45)", strokeWidth: 1.2 } }}
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
        fitViewOptions={{ padding: 0.18, minZoom: 0.4, maxZoom: 1.1 }}
        minZoom={0.3}
        maxZoom={1.5}
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="rgb(140 140 150 / 0.35)" />
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
                case "entry": return "#10b981";
                case "self": return "#8b5cf6";
                case "related": return "#0ea5e9";
                case "shared": return "#f43f5e";
                case "resource": return "#71717a";
                case "agent": return "#0ea5e9";
                default: return "#71717a";
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
// 辅助:edge data 类型助手(调用方用)
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
