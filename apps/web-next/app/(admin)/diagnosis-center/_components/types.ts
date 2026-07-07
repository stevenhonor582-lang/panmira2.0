export interface AlertItem {
  id: string;
  type: string;
  bot_name: string;
  error_message?: string;
  created_at: string | number;
  severity?: "critical" | "error" | "warning" | "info";
}

export interface DiagnoseEvent {
  id: string;
  type: string;
  bot_name?: string;
  timestamp?: string | number;
  prompt?: string;
  response_preview?: string;
  error_message?: string;
}

export interface DiagnoseResult {
  found: number;
  session?: Record<string, unknown>;
  events?: DiagnoseEvent[];
}

export interface BotGroup {
  botName: string;
  count: number;
  latestAt: number;
  latestMessage: string;
  items: AlertItem[];
  conclusion: string;
  severity: "critical" | "error" | "warning" | "info";
}

export interface WeeklyBucket {
  weekStart: string; // YYYY-MM-DD (周一)
  alert: number;
  error: number;
  warning: number;
  info: number;
}
