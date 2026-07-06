export interface SystemStatus {
  counts: {
    llm: number;
    embedding: number;
    mcp: number;
    kb: number;
    agent: number;
    oauth: number;
  };
  usageToday: Record<string, number>;
  errorsLast24h: number;
  timestamp: string;
}

export interface AlertItem {
  id: string;
  type: string;
  bot_name: string;
  error_message: string;
  created_at: string; // bigint 字符串
}

export interface BotAlertSummary {
  botName: string;
  count: number;
  lastError: string;
  lastAt: number;
}

export interface DiagnoseResult {
  taskId: string;
  session: Record<string, unknown> | null;
  events: Array<Record<string, unknown>>;
  found: number;
}
