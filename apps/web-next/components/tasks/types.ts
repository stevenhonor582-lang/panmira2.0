// Shared types & constants for the /tasks DAG module.
// 6 node kinds we expose in the palette. Each maps to one custom tldraw shape.

export type NodeKind =
  | "bot"
  | "human"
  | "skill"
  | "tool"
  | "conditional"
  | "parallel";

export interface NodeKindMeta {
  kind: NodeKind;
  label: string;
  /** Lucide icon name (imported by consumer to keep tree-shaken). */
  icon:
    | "Bot"
    | "UserRound"
    | "Wrench"
    | "Hammer"
    | "GitFork"
    | "Split";
  /** Hex tone for the shape body — restrained, single-accent palette. */
  tone: string;
  /** One-line description shown in the palette tooltip. */
  hint: string;
}

export const NODE_KINDS: NodeKindMeta[] = [
  {
    kind: "bot",
    label: "Bot 节点",
    icon: "Bot",
    tone: "#0ea5e9",
    hint: "拉取 8 个数字员工之一",
  },
  {
    kind: "human",
    label: "真人节点",
    icon: "UserRound",
    tone: "#10b981",
    hint: "史德飞 + 团队成员审批/兜底",
  },
  {
    kind: "skill",
    label: "Skill 节点",
    icon: "Wrench",
    tone: "#a855f7",
    hint: "skills/MCP 库中的能力",
  },
  {
    kind: "tool",
    label: "Tool 节点",
    icon: "Hammer",
    tone: "#f59e0b",
    hint: "底层工具函数",
  },
  {
    kind: "conditional",
    label: "条件分支",
    icon: "GitFork",
    tone: "#64748b",
    hint: "if/else 条件路由",
  },
  {
    kind: "parallel",
    label: "并行网关",
    icon: "Split",
    tone: "#64748b",
    hint: "并行分支 fan-out/fan-in",
  },
];

export const NODE_KIND_MAP: Record<NodeKind, NodeKindMeta> = Object.fromEntries(
  NODE_KINDS.map((k) => [k.kind, k]),
) as Record<NodeKind, NodeKindMeta>;

/** A node's persistent payload (stored in tldraw shape's `meta`). */
export interface DagNodeMeta {
  kind: NodeKind;
  /** Reference id into the chosen catalogue (agent.id, user.id, skill.id, ...). */
  refId?: string;
  /** Display label. */
  label?: string;
  /** Free-form config JSON. */
  config?: Record<string, unknown>;
}

export interface DagNodeRecord {
  shapeId: string;
  meta: DagNodeMeta;
}

export interface DagEdgeRecord {
  from: string;
  to: string;
}

/** Whole pipeline snapshot we save into pipeline.config. */
export interface DagDocument {
  /** tldraw store snapshot JSON (TLStoreSnapshot). */
  snapshot: unknown;
  /** Derived lists for quick read on the server side without parsing tldraw. */
  nodes: DagNodeRecord[];
  edges: DagEdgeRecord[];
  /** Bot that owns the template (used by the 5-bot templates). */
  botId?: string;
}

export type TaskStatus =
  | "ready"
  | "running"
  | "completed"
  | "failed"
  | "paused";

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  ready: "待执行",
  running: "执行中",
  completed: "已完成",
  failed: "失败",
  paused: "已暂停",
};

export const TASK_STATUS_TONE: Record<TaskStatus, string> = {
  ready: "bg-slate-100 text-slate-700 ring-slate-200",
  running: "bg-sky-100 text-sky-700 ring-sky-200",
  completed: "bg-emerald-100 text-emerald-700 ring-emerald-200",
  failed: "bg-rose-100 text-rose-700 ring-rose-200",
  paused: "bg-amber-100 text-amber-700 ring-amber-200",
};

/** Pipeline run shape (L6 schema). */
export interface PipelineRun {
  id: string;
  pipelineId?: string;
  status?: "pending" | "running" | "completed" | "failed" | "cancelled";
  startedAt?: string;
  finishedAt?: string;
  error?: string;
  triggeredBy?: string;
}

export interface ScheduledJob {
  id: string;
  name?: string;
  cronExpression?: string;
  triggerType?: "cron" | "event" | "manual";
  enabled?: boolean;
  nextRunAt?: string;
  description?: string;
  pipelineId?: string;
}