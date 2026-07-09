"use client";

/**
 * R21 (2026-07-09): 通用节点执行详情组件。
 *
 * 数据来源:后端 pipeline_runs.node_states jsonb 列,每个节点的状态记录在
 *   { status, input, output, error, startedAt, finishedAt, durationMs,
 *     tokensUsed, approval, note, decidedBy }
 * WS 只推汇总进度,具体 input/output 需要从 GET /pipelines/:id/runs/:runId 拉取。
 *
 * 三处复用:
 *   - shape-config-panel: 选中节点 → 显示该节点最近一次 run 的实际 input/output
 *   - execution-log-panel: 每个节点条目可展开 → NodeRunDetails compact
 *   - 详情抽屉/独立页: 直接用默认尺寸
 */

import * as React from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Coins,
  GitBranch,
  Loader2,
  UserCheck,
} from "lucide-react";

/** 与后端 NodeState jsonb 对齐。 */
export interface NodeRunState {
  status?: string;
  input?: unknown;
  output?: unknown;
  error?: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  tokensUsed?: number;
  /** human 节点:approved / rejected / modified */
  approval?: string;
  note?: string;
  decidedBy?: string;
}

interface NodeRunDetailsProps {
  state: NodeRunState | null | undefined;
  /** 节点类型 (bot/human/conditional/...) — 用于条件分支特殊渲染 */
  nodeKind?: string;
  /** 紧凑模式:执行流里默认收起输入输出 */
  compact?: boolean;
  className?: string;
}

const STATUS_CFG: Record<
  string,
  { label: string; cls: string; Icon: typeof CheckCircle2 }
> = {
  success: {
    label: "完成",
    cls: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 ring-emerald-200",
    Icon: CheckCircle2,
  },
  failed: {
    label: "失败",
    cls: "text-rose-600 bg-rose-50 dark:bg-rose-950/30 ring-rose-200",
    Icon: AlertCircle,
  },
  running: {
    label: "执行中",
    cls: "text-sky-600 bg-sky-50 dark:bg-sky-950/30 ring-sky-200",
    Icon: Loader2,
  },
  waiting_for_human: {
    label: "待审批",
    cls: "text-amber-600 bg-amber-50 dark:bg-amber-950/30 ring-amber-200",
    Icon: UserCheck,
  },
  pending: {
    label: "待执行",
    cls: "text-muted-foreground bg-muted/30 ring-foreground/10",
    Icon: Clock,
  },
  skipped: {
    label: "跳过",
    cls: "text-muted-foreground bg-muted/30 ring-foreground/10",
    Icon: ChevronRight,
  },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? {
    label: status || "未知",
    cls: "text-muted-foreground bg-muted/30 ring-foreground/10",
    Icon: Clock,
  };
  const { Icon } = cfg;
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] ring-1 ${cfg.cls}`}
    >
      <Icon
        className={`size-3 ${status === "running" ? "animate-spin" : ""}`}
        strokeWidth={2.5}
      />
      {cfg.label}
    </span>
  );
}

function isNonEmptyObject(v: unknown): boolean {
  return (
    v != null &&
    typeof v === "object" &&
    Object.keys(v as object).length > 0
  );
}

function formatBranch(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "true" : "false";
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function JsonBlock({ value }: { value: unknown }) {
  const text = React.useMemo(() => {
    if (value == null) return "";
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }, [value]);
  return (
    <pre className="mt-1 p-2 rounded bg-muted/60 text-[11px] font-mono whitespace-pre-wrap break-all overflow-x-auto max-h-48 overflow-y-auto ring-1 ring-foreground/5">
      {text}
    </pre>
  );
}

function Section({
  title,
  defaultOpen,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(Boolean(defaultOpen));
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground hover:text-foreground transition-colors"
      >
        {open ? (
          <ChevronDown className="size-3" />
        ) : (
          <ChevronRight className="size-3" />
        )}
        {title}
      </button>
      {open && <div className="mt-1">{children}</div>}
    </div>
  );
}

export function NodeRunDetails({
  state,
  nodeKind,
  compact,
  className,
}: NodeRunDetailsProps) {
  if (!state || Object.keys(state).length === 0) {
    return (
      <div className={`text-xs text-muted-foreground ${className ?? ""}`}>
        尚未执行 · 触发运行后这里显示输入输出
      </div>
    );
  }

  const status = state.status ?? "pending";
  const showBranch =
    nodeKind === "conditional" && state.output != null;
  const showApproval = Boolean(state.approval);
  const showInput = isNonEmptyObject(state.input);
  const showOutput = state.output != null;
  const inputDefaultOpen = !compact;

  return (
    <div className={`space-y-2 text-xs ${className ?? ""}`}>
      {/* 行 1:状态 + 耗时 + token */}
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={status} />
        {state.durationMs != null && (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Clock className="size-3" /> {state.durationMs} ms
          </span>
        )}
        {state.tokensUsed != null && state.tokensUsed > 0 && (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Coins className="size-3" /> {state.tokensUsed} tokens
          </span>
        )}
        {state.startedAt && (
          <span className="ml-auto text-[10px] text-muted-foreground font-mono">
            {formatTs(state.startedAt)}
            {state.finishedAt ? ` → ${formatTs(state.finishedAt)}` : ""}
          </span>
        )}
      </div>

      {/* 错误 */}
      {state.error && (
        <div className="flex items-start gap-1.5 text-rose-600 bg-rose-50 dark:bg-rose-950/30 px-2 py-1.5 rounded ring-1 ring-rose-200">
          <AlertCircle className="size-3.5 mt-0.5 shrink-0" />
          <span className="break-words leading-snug">{state.error}</span>
        </div>
      )}

      {/* 审批结果(human) */}
      {showApproval && (
        <div className="flex items-start gap-1.5 bg-amber-50 dark:bg-amber-950/30 px-2 py-1.5 rounded ring-1 ring-amber-200">
          <UserCheck className="size-3.5 mt-0.5 shrink-0 text-amber-600" />
          <div className="leading-snug">
            <div>
              审批:
              <span className="font-medium">
                {state.approval === "approved"
                  ? "已批准"
                  : state.approval === "rejected"
                    ? "已拒绝"
                    : state.approval === "modified"
                      ? "已修改"
                      : state.approval}
              </span>
              {state.decidedBy && (
                <span className="text-muted-foreground"> · {state.decidedBy}</span>
              )}
            </div>
            {state.note && (
              <div className="text-muted-foreground mt-0.5">备注:{state.note}</div>
            )}
          </div>
        </div>
      )}

      {/* 条件结果(conditional) */}
      {showBranch && (
        <div className="flex items-center gap-1.5 bg-sky-50 dark:bg-sky-950/30 px-2 py-1.5 rounded ring-1 ring-sky-200">
          <GitBranch className="size-3.5 shrink-0 text-sky-600" />
          <span className="leading-snug">
            分支:
            <span className="font-mono font-medium ml-1">
              {formatBranch(state.output)}
            </span>
          </span>
        </div>
      )}

      {/* 输入 */}
      {showInput && (
        <Section title="输入" defaultOpen={inputDefaultOpen}>
          <JsonBlock value={state.input} />
        </Section>
      )}

      {/* 输出 */}
      {showOutput && !showBranch && (
        <Section title="输出" defaultOpen={inputDefaultOpen}>
          <JsonBlock value={state.output} />
        </Section>
      )}
    </div>
  );
}

function formatTs(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("zh-CN", { hour12: false });
  } catch {
    return iso;
  }
}

export default NodeRunDetails;
