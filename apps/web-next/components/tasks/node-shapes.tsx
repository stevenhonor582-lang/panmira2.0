// R19 (2026-07-09): React Flow custom node for the 6 DAG kinds.
// Replaces the old tldraw BaseBoxShapeUtil implementation.
//
// All 6 kinds share the same component; `data.kind` picks the icon/tone/label.
// Conditional / Parallel expose multiple source handles so the operator can
// draw distinct branches from the same node.

"use client";

import * as React from "react";
import {
  Handle,
  Position,
  type NodeProps,
  type Edge,
  type Node,
} from "@xyflow/react";
import {
  Bot,
  UserRound,
  Wrench,
  Hammer,
  GitFork,
  Split,
  type LucideIcon,
} from "lucide-react";

import type {
  DagNodeMeta,
  NodeKind,
  NodeRunStatus,
  ApprovalState,
} from "./types";
import {
  NODE_STATUS_TONE,
  NODE_STATUS_LABEL,
} from "./types";

/** Uniform node footprint — kept identical across kinds so the grid stays tidy. */
export const DAG_SHAPE_W = 200;
export const DAG_SHAPE_H = 96;

const KIND_ICON: Record<NodeKind, LucideIcon> = {
  bot: Bot,
  human: UserRound,
  skill: Wrench,
  tool: Hammer,
  conditional: GitFork,
  parallel: Split,
};

const KIND_LABEL: Record<NodeKind, string> = {
  bot: "Bot",
  human: "Human",
  skill: "Skill",
  tool: "Tool",
  conditional: "If / Else",
  parallel: "Parallel",
};

const TONE: Record<NodeKind, string> = {
  bot: "#0ea5e9",
  human: "#10b981",
  skill: "#a855f7",
  tool: "#f59e0b",
  conditional: "#475569",
  parallel: "#64748b",
};

// ── Status / approval badges ──────────────────────────────────────────────

function StatusPill({ status }: { status: NodeRunStatus }) {
  const tone = NODE_STATUS_TONE[status];
  const label = NODE_STATUS_LABEL[status];
  return (
    <span
      className="inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
      style={{ backgroundColor: `${tone}22`, color: tone }}
    >
      <span
        className={
          status === "running"
            ? "size-1.5 rounded-full animate-pulse"
            : "size-1.5 rounded-full"
        }
        style={{ backgroundColor: tone }}
      />
      {label}
    </span>
  );
}

const APPROVAL_PILL: Record<
  ApprovalState,
  { label: string; bg: string; fg: string }
> = {
  idle: { label: "未触发", bg: "#f1f5f9", fg: "#475569" },
  waiting: { label: "⏸ 等待", bg: "#fef3c7", fg: "#92400e" },
  approved: { label: "✓ 批准", bg: "#d1fae5", fg: "#065f46" },
  rejected: { label: "✗ 拒绝", bg: "#fee2e2", fg: "#991b1b" },
  modified: { label: "✎ 修改", bg: "#dbeafe", fg: "#1e40af" },
};

function ApprovalPill({ state }: { state: ApprovalState }) {
  const m = APPROVAL_PILL[state];
  return (
    <span
      className="inline-flex items-center text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
      style={{ backgroundColor: m.bg, color: m.fg }}
    >
      {m.label}
    </span>
  );
}

// ── Custom node ─────────────────────────────────────────────────────────────

/**
 * Single custom React Flow node component reused by all 6 kinds.
 *
 * Handle layout:
 *   - bot / human / skill / tool: 1 target (left) + 1 source (right)
 *   - conditional: 1 target (left) + 2 sources (top-right id="true", bottom-right id="false")
 *   - parallel: 1 target (left) + 1 source (right, fan-out via multiple edges)
 */
function DagNodeComponent({ data, selected }: NodeProps) {
  const meta = data as DagNodeMeta;
  const kind = meta.kind;
  const Icon = KIND_ICON[kind];
  const tone = TONE[kind];
  const label = meta.label?.trim() || "未命名节点";
  const status = meta.status;
  const approval = meta.approvalState;

  // Ring: selected (primary) > runtime status > idle
  let ring = "ring-foreground/15";
  if (selected) ring = "ring-primary ring-2";
  else if (status === "running") ring = "ring-sky-400 ring-2";
  else if (status === "waiting") ring = "ring-amber-400 ring-2";
  else if (status === "failed") ring = "ring-rose-400 ring-2";
  else if (status === "success") ring = "ring-emerald-400 ring-2";

  // Subtle background tint while running/failed for at-a-glance scanning.
  let bgTint = "bg-card";
  if (status === "running") bgTint = "bg-sky-50/60";
  else if (status === "failed") bgTint = "bg-rose-50/60";
  else if (status === "waiting") bgTint = "bg-amber-50/60";
  else if (status === "success") bgTint = "bg-emerald-50/60";

  return (
    <div
      className={`relative w-[200px] h-[96px] rounded-lg ${bgTint} shadow-[0_4px_14px_-6px_rgba(15,23,42,0.18)] overflow-hidden flex flex-col ring-1 ${ring}`}
      data-kind={kind}
    >
      {/* Single target handle on the left for all kinds. */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2 !h-2 !bg-foreground/40 !border-2 !border-card"
      />

      {/* Coloured header strip */}
      <div className="h-1.5 w-full" style={{ backgroundColor: tone }} />

      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <span
          className="grid place-items-center size-5 rounded-sm"
          style={{ backgroundColor: `${tone}22`, color: tone }}
        >
          <Icon className="size-3.5" strokeWidth={2} />
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex-1">
          {KIND_LABEL[kind]}
        </span>
        {status && <StatusPill status={status} />}
      </div>

      <div className="px-2.5 pb-2 -mt-0.5 flex-1 flex items-start">
        <div className="text-[12px] font-medium leading-tight line-clamp-2 flex-1">
          {label}
        </div>
        {kind === "human" && approval && approval !== "idle" && (
          <ApprovalPill state={approval} />
        )}
      </div>

      {/* Source handles — kind-specific */}
      {kind === "conditional" ? (
        // 2 sources: top-right = true branch, bottom-right = false branch
        <>
          <Handle
            type="source"
            position={Position.Right}
            id="true"
            style={{ top: 28 }}
            className="!w-2 !h-2 !bg-emerald-500 !border-2 !border-card"
          />
          <Handle
            type="source"
            position={Position.Right}
            id="false"
            style={{ top: 76 }}
            className="!w-2 !h-2 !bg-rose-500 !border-2 !border-card"
          />
        </>
      ) : (
        <Handle
          type="source"
          position={Position.Right}
          className="!w-2 !h-2 !bg-foreground/40 !border-2 !border-card"
        />
      )}
    </div>
  );
}

export const DagNode = React.memo(DagNodeComponent);

/** React Flow nodeTypes map — register on <ReactFlow nodeTypes={NODE_TYPES} /> */
export const NODE_TYPES = { dagNode: DagNode } as const;

// ── Seeding helpers (templates -> RF nodes/edges) ──────────────────────────

export interface SeedNode {
  meta: DagNodeMeta;
  x: number;
  y: number;
}

export interface SeedEdge {
  from: number;
  to: number;
}

/**
 * Build React Flow nodes + edges from a template's seed lists.
 * Pure helper — caller then `setNodes` / `setEdges` directly.
 */
export function buildSeedRecords(
  seedNodes: SeedNode[],
  seedEdges: SeedEdge[],
  idGen: () => string,
): { nodes: Node[]; edges: Edge[] } {
  const ids: string[] = [];
  const nodes: Node[] = seedNodes.map((n) => {
    const id = idGen();
    ids.push(id);
    return {
      id,
      type: "dagNode",
      position: { x: n.x, y: n.y },
      data: { ...n.meta },
    };
  });

  const edges: Edge[] = seedEdges
    .filter(
      (e) =>
        e.from >= 0 &&
        e.from < ids.length &&
        e.to >= 0 &&
        e.to < ids.length &&
        e.from !== e.to,
    )
    .map((e, i) => ({
      id: `e-${ids[e.from]}-${ids[e.to]}-${i}`,
      source: ids[e.from],
      target: ids[e.to],
      type: "smoothstep",
      animated: false,
    }));

  return { nodes, edges };
}
