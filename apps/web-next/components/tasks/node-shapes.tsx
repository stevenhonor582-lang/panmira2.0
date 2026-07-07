// Custom tldraw shape utils for the 6 DAG node kinds.
// Each shape is a BaseBoxShapeUtil that renders a card-style node with
// a tinted header bar, kind label, and a meta-resolved subtitle.
// All shapes share the same w/h (180×88) so the palette grid stays tidy.

"use client";

import * as React from "react";
import {
  BaseBoxShapeUtil,
  type Geometry2d,
  type RecordProps,
  type T,
  type TLBaseShape,
  HTMLContainer,
  Rectangle2d,
} from "@tldraw/editor";
import {
  Bot,
  UserRound,
  Wrench,
  Hammer,
  GitFork,
  Split,
  type LucideIcon,
} from "lucide-react";

import type { DagNodeMeta, NodeKind } from "./types";

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

/** Single shape definition reused for all 6 kinds via `meta.kind`. */
export interface DagNodeShape extends TLBaseShape<"dag-node", { w: number; h: number; meta: DagNodeMeta }> {
  type: "dag-node";
}

export class DagNodeShapeUtil extends BaseBoxShapeUtil<DagNodeShape> {
  static override type = "dag-node" as const;

  getDefaultProps(): DagNodeShape["props"] {
    return {
      w: DAG_SHAPE_W,
      h: DAG_SHAPE_H,
      meta: { kind: "bot", label: "新节点" },
    };
  }

  getGeometry(shape: DagNodeShape): Geometry2d {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    });
  }

  component(shape: DagNodeShape) {
    const kind = shape.props.meta.kind;
    const Icon = KIND_ICON[kind];
    const label = shape.props.meta.label?.trim() || "未命名节点";
    const tone = TONE[kind];
    return (
      <HTMLContainer style={{ pointerEvents: "all" }}>
        <div
          className="w-full h-full rounded-lg bg-card ring-1 ring-foreground/15 shadow-[0_4px_14px_-6px_rgba(15,23,42,0.18)] overflow-hidden flex flex-col"
          data-kind={kind}
        >
          <div
            className="h-1.5 w-full"
            style={{ backgroundColor: tone }}
          />
          <div className="flex items-center gap-2 px-2.5 py-1.5">
            <span
              className="grid place-items-center size-5 rounded-sm"
              style={{ backgroundColor: `${tone}22`, color: tone }}
            >
              <Icon className="size-3.5" strokeWidth={2} />
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {KIND_LABEL[kind]}
            </span>
          </div>
          <div className="px-2.5 pb-2 -mt-0.5 flex-1 flex items-start">
            <div className="text-[12px] font-medium leading-tight line-clamp-2">
              {label}
            </div>
          </div>
        </div>
      </HTMLContainer>
    );
  }

  indicator(shape: DagNodeShape) {
    const p = new Path2D();
    p.rect(0, 0, shape.props.w, shape.props.h);
    return p;
  }

  override canEdit() {
    return false;
  }

  override canResize() {
    return false;
  }

  override hideRotateHandle() {
    return true;
  }
}

const TONE: Record<NodeKind, string> = {
  bot: "#0ea5e9",
  human: "#10b981",
  skill: "#a855f7",
  tool: "#f59e0b",
  conditional: "#475569",
  parallel: "#64748b",
};

export const DAG_SHAPE_UTILS = [DagNodeShapeUtil];

/** Helper to seed the canvas from a template's nodes + edges. */
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
 * Build tldraw TLRecord[] for a set of seed nodes + edges.
 * Caller passes them via `editor.createShapes(...)` and `editor.createArrows(...)`.
 */
export function buildSeedRecords(
  nodes: SeedNode[],
  edges: SeedEdge[],
  idGen: () => string,
): {
  shapes: T.Object[];
  arrows: { id: string; startShapeId: string; endShapeId: string }[];
} {
  const ids: string[] = [];
  const shapes: T.Object[] = nodes.map((n) => {
    const id = idGen();
    ids.push(id);
    return {
      id,
      typeName: "shape" as const,
      type: "dag-node",
      x: n.x,
      y: n.y,
      rotation: 0,
      index: 0,
      parentId: undefined,
      isLocked: false,
      opacity: 1,
      props: {
        w: DAG_SHAPE_W,
        h: DAG_SHAPE_H,
        meta: n.meta,
      },
      meta: {},
    } as unknown as T.Object;
  });

  const arrows = edges
    .filter((e) => e.from >= 0 && e.from < ids.length && e.to >= 0 && e.to < ids.length && e.from !== e.to)
    .map((e) => ({
      id: idGen(),
      startShapeId: ids[e.from],
      endShapeId: ids[e.to],
    }));

  return { shapes, arrows };
}