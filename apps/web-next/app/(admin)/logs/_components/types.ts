export type LogKind = "bot" | "agent";

export interface BotSession {
  id: string;
  botName: string;
  chatId: string;
  sessionId: string | null;
  workingDirectory: string;
  model: string | null;
  engine: string | null;
  lastUsed: number;
  status: "active" | "idle" | "archived";
  cumulativeTokens: number;
  cumulativeCostUsd: string;
  cumulativeDurationMs: number;
  interruptRequested: boolean;
}

export interface AgentRun {
  id: string;
  agentName: string;
  pipelineId: string | null;
  pipelineName: string | null;
  startedAt: number;
  endedAt: number | null;
  status: "running" | "succeeded" | "failed" | "timeout" | "cancelled" | "pending";
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: string;
  message?: string;
  durationMs: number;
}

export interface AgentRunMessage {
  id: string;
  runId: string;
  role: "user" | "agent" | "system" | "tool";
  content: string;
  ts: number;
  tokens: number;
}

export const STATUS_LABEL: Record<BotSession["status"], string> = {
  active: "活跃",
  idle: "空闲",
  archived: "已归档",
};

export const STATUS_TONE: Record<BotSession["status"], string> = {
  active: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  idle: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  archived: "bg-zinc-500/15 text-zinc-500 border-zinc-500/30",
};

export const RUN_STATUS_LABEL: Record<AgentRun["status"], string> = {
  running: "执行中",
  succeeded: "成功",
  failed: "失败",
  timeout: "超时",
  cancelled: "已取消",
  pending: "排队中",
};

export const RUN_STATUS_TONE: Record<AgentRun["status"], string> = {
  running: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  succeeded: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  failed: "bg-rose-500/15 text-rose-600 border-rose-500/30",
  timeout: "bg-orange-500/15 text-orange-600 border-orange-500/30",
  cancelled: "bg-zinc-500/15 text-zinc-500 border-zinc-500/30",
  pending: "bg-amber-500/15 text-amber-600 border-amber-500/30",
};

export function fmtAge(epochMs: number): string {
  const diff = Date.now() - epochMs;
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return `${Math.floor(diff / 86_400_000)} 天前`;
}

export function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3_600_000) return `${(ms / 60_000).toFixed(1)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}
