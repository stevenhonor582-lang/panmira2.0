export interface AlertItem {
  id: string;
  type: string;        // task_failed / error
  bot_name: string;
  error_message: string;
  created_at: string;  // bigint 字符串
}
