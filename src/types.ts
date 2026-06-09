// Shared types used across IM platforms (Feishu, Telegram, etc.)

export type CardStatus = 'preparing' | 'thinking' | 'running' | 'complete' | 'error' | 'waiting_for_input';

export interface ToolCall {
  name: string;
  detail: string;
  status: 'running' | 'done';
  /** Orchestration step index this tool call belongs to (undefined = single-shot feishu path). */
  stepIndex?: number;
}

export interface PendingQuestion {
  toolUseId: string;
  questions: Array<{
    question: string;
    header: string;
    options: Array<{ label: string; description: string }>;
    multiSelect: boolean;
  }>;
}

export type BackgroundTaskStatus = 'running' | 'completed' | 'failed' | 'stopped';

export interface BackgroundEvent {
  taskId: string;
  description: string;
  status: BackgroundTaskStatus;
  /** Latest stdout event line from the task, if any. */
  lastEvent?: string;
}

export interface CardState {
  status: CardStatus;
  userPrompt: string;
  responseText: string;
  toolCalls: ToolCall[];
  /** @deprecated Use sessionCostUsd. Kept for backward compat. */
  costUsd?: number;
  durationMs?: number;
  errorMessage?: string;
  pendingQuestion?: PendingQuestion;
  /** Primary model used (e.g. "claude-opus-4-7") */
  model?: string;
  /** Total input+output tokens consumed */
  totalTokens?: number;
  /** Context window size of the primary model */
  contextWindow?: number;
  /** Cumulative session cost (USD), accumulated across queries until /reset */
  sessionCostUsd?: number;
  /** Input tokens consumed (non-cache) */
  inputTokens?: number;
  /** Output tokens consumed */
  outputTokens?: number;
  /** Cache read tokens */
  cacheReadTokens?: number;
  /** Cache creation tokens */
  cacheCreationTokens?: number;
  /** Background tasks (e.g. Monitor) the agent has spawned during this turn. */
  backgroundEvents?: BackgroundEvent[];
  /** Persistent context note shown above response text (config summary, intent, etc.) */
  contextNote?: string;
  /** Name of the current orchestration skill (set by orchestrator CardUpdater). */
  currentSkill?: string;
  /** Bot display name (e.g. '信言--内容创作'). Shown in card header. */
  botName?: string;
  /** Intent name from orchestration (e.g. 'fix-bug'). Shown in card header. */
  intentName?: string;
}

export interface IncomingMessage {
  messageId: string;
  chatId: string;
  chatType: string;
  userId: string;
  text: string;
  imageKey?: string;
  fileKey?: string;
  fileName?: string;
  /** Additional media from batched messages (smart debounce). */
  extraMedia?: Array<{
    messageId: string;
    imageKey?: string;
    fileKey?: string;
    fileName?: string;
  }>;
}
