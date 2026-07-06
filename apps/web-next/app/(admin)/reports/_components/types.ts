export type Dimension = "token" | "skill" | "mcp" | "channel" | "knowledge";
export type GroupBy = "day" | "dimension_key";

export interface ReportRowDay {
  date: string;
  count: number;
}

export interface ReportRowKey {
  dimensionKey: string;
  count: number;
}

export type ReportRow = ReportRowDay | ReportRowKey;

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
