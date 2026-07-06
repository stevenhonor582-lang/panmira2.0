export interface DiagnoseSession {
  id?: string;
  bot_name?: string;
  chat_id?: string;
  working_directory?: string;
  last_used?: string;
  cumulative_tokens?: number;
  cumulative_cost_usd?: string;
  cumulative_duration_ms?: number;
  [k: string]: unknown;
}

export interface DiagnoseEvent {
  id: string;
  type: string;
  bot_name: string;
  chat_id: string;
  prompt?: string;
  response_preview?: string;
  error_message?: string;
  timestamp: string | number;
  [k: string]: unknown;
}

export interface DiagnoseResult {
  taskId: string;
  session: DiagnoseSession | null;
  events: DiagnoseEvent[];
  found: number;
}
