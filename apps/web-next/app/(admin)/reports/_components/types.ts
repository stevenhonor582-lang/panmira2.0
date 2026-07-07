export type Dimension = "token" | "skill" | "mcp" | "channel" | "knowledge";
export type GroupBy = "day" | "week" | "month" | "dimension_key" | "provider";

export interface ReportRowDay {
  date: string;
  count: number;
}

export interface ReportRowKey {
  dimensionKey: string;
  count: number;
}

export interface ReportRowProvider {
  provider: string;
  count: number;
}

export type ReportRow = ReportRowDay | ReportRowKey | ReportRowProvider;

export interface ReportResponse {
  dimension: Dimension;
  from: string;
  to: string;
  groupBy: GroupBy;
  rows: ReportRow[];
}

export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

export const DIMENSIONS: { value: Dimension; label: string; tone: string }[] = [
  { value: "token", label: "Token 用量", tone: "primary" },
  { value: "skill", label: "Skill 调用", tone: "violet" },
  { value: "mcp", label: "MCP 调用", tone: "rose" },
  { value: "channel", label: "Channel", tone: "amber" },
  { value: "knowledge", label: "KB 检索", tone: "emerald" },
];

export const PROVIDERS = [
  { key: "openai", label: "OpenAI", color: "oklch(0.7 0.18 250)" },
  { key: "anthropic", label: "Anthropic", color: "oklch(0.7 0.16 30)" },
  { key: "deepseek", label: "DeepSeek", color: "oklch(0.7 0.18 280)" },
  { key: "google", label: "Google", color: "oklch(0.72 0.18 145)" },
  { key: "qwen", label: "通义千问", color: "oklch(0.72 0.16 65)" },
  { key: "glm", label: "智谱 GLM", color: "oklch(0.7 0.16 195)" },
  { key: "custom", label: "自定义", color: "oklch(0.65 0.05 280)" },
] as const;

export const GRANULARITIES = [
  { value: "day", label: "按日" },
  { value: "week", label: "按周" },
  { value: "month", label: "按月" },
] as const;
export type Granularity = (typeof GRANULARITIES)[number]["value"];
