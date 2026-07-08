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
  /**
   * Human-in-the-loop approval state.
   * - 'idle'      : not yet reached by the engine
   * - 'waiting'   : engine paused, awaiting a human decision
   * - 'approved'  : human approved, downstream may proceed
   * - 'rejected'  : human rejected, downstream skipped
   * - 'modified'  : human altered the input, downstream proceeds with new payload
   * Only meaningful when `kind === 'human'`. Defaults to 'idle'.
   */
  approvalState?: ApprovalState;
  /** Last decision actor (e.g. user id / 'auto-bypass') — for audit trail. */
  approvalActor?: string;
  /** Optional note left by the human when deciding. */
  approvalNote?: string;
}

export type ApprovalState = "idle" | "waiting" | "approved" | "rejected" | "modified";

/**
 * R17-4: per-kind IO contract.
 * Surfaces to operators what each node consumes and produces so they can
 * reason about pipeline breaks ("断点") before/after each step.
 */
export interface NodeKindContract {
  /** What upstream feeds into this node. */
  input: string;
  /** What this node emits to downstream. */
  output: string;
  /** Behaviour when the engine hits this node. */
  behaviour: string;
  /** Whether this node blocks until a human decides. */
  blocking?: boolean;
}

export const NODE_KIND_CONTRACTS: Record<NodeKind, NodeKindContract> = {
  bot: {
    input: "上游节点输出(或 initialInput)+ 节点 inputTemplate",
    output: "{ text, agentId, model, toolCalls[] }",
    behaviour: "调用数字员工 (LLM agent template) ,单跳 tool_use 循环,失败按 retryPolicy 重试",
  },
  human: {
    input: "待审批的上游输出 + 节点上下文(摘要 / 风险点)",
    output: "{ decision: 'approved'|'rejected'|'modified', note?, modifiedInput? }",
    behaviour: "执行到此暂停 (status=waiting_for_human),等真人 approve / reject / modify 后继续下游",
    blocking: true,
  },
  skill: {
    input: "调用参数 (args JSON) + 上游上下文",
    output: "skill 标准化结果(搜索结果 / 摘要 / 翻译等)",
    behaviour: "调用 skill 库 (filesystem-backed) ,无状态,可并行",
  },
  tool: {
    input: "工具名 + args JSON",
    output: "{ output, error? } 工具原始返回",
    behaviour: "底层工具函数(web_search / fetch_url / send_email...) ,单次调用,失败抛错",
  },
  conditional: {
    input: "上游数据 (任意)",
    output: "布尔分支结果(true → 第 1 条出边,false → 其余)",
    behaviour: "求值 expression,路由到对应下游。必须 ≥2 条出边",
  },
  parallel: {
    input: "任务列表(上游输出 fan-out 到 N 条出边)",
    output: "下游 N 个节点的合并结果(fan-in 等待全部完成)",
    behaviour: "同时启动 N 条并行分支,全部完成后汇聚到 fan-in 节点",
  },
};

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