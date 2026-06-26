import type { IncomingMessage, CardState, PendingQuestion } from '../types.js';

export const TASK_TIMEOUT_MS = 24 * 60 * 60 * 1000;
export const QUESTION_TIMEOUT_MS = 5 * 60 * 1000;
export const MAX_QUEUE_SIZE = 5;
export const IDLE_TIMEOUT_MS = 60 * 60 * 1000;
export const FINAL_CARD_RETRIES = 3;
export const FINAL_CARD_BASE_DELAY_MS = 2000;
export const TASK_TIMEOUT_MESSAGE = 'Task timed out (24 hour limit)';
export const IDLE_TIMEOUT_MESSAGE = 'Task aborted: no activity for 1 hour';
export const BATCH_DEBOUNCE_MS = 2000;
export const DEFAULT_IMAGE_TEXT = '请分析这张图片';
export const DEFAULT_FILE_TEXT = '请分析这个文件';

export interface PendingBatch {
  messages: IncomingMessage[];
  timerId: ReturnType<typeof setTimeout>;
}

export interface RunningTask {
  abortController: AbortController;
  startTime: number;
  prompt: string;
  executionHandle: import('../engines/index.js').ExecutionHandle;
  pendingQuestion: PendingQuestion | null;
  currentQuestionIndex: number;
  collectedAnswers: Record<string, string>;
  cardMessageId: string;
  questionTimeoutId?: ReturnType<typeof setTimeout>;
  processor: import('../engines/index.js').StreamProcessor;
  rateLimiter: import('./rate-limiter.js').RateLimiter;
  chatId: string;
  /** Latest response text preview, updated during streaming, used for recovery notification */
  lastResponsePreview: string;
  /** commit-19 (2026-06-26): user text sent during running task. NOT queued as new task.
   *  Instead appended to running task so bot sees it as user "补充" in next round. */
  userAdditionalInput?: string;
}

export interface ApiTaskOptions {
  prompt: string;
  chatId: string;
  userId?: string;
  sendCards?: boolean;
  maxTurns?: number;
  model?: string;
  allowedTools?: string[];
  onUpdate?: (state: CardState, messageId: string, final: boolean) => void;
  onQuestion?: (question: PendingQuestion) => Promise<string>;
  onOutputFiles?: (files: import('./outputs-manager.js').OutputFile[]) => void;
  skipOutputFiles?: boolean;
  groupMembers?: string[];
  groupId?: string;
  chatType?: string;
}

export interface ApiTaskResult {
  success: boolean;
  responseText: string;
  sessionId?: string;
  costUsd?: number;
  durationMs?: number;
  error?: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  /** Output files produced by this task (subset of OutputFile for the manifest card). */
  outputFiles?: Array<{ fileName: string; sizeBytes: number; isImage: boolean }>;
}

export interface ActivityEventData {
  type: 'task_started' | 'task_completed' | 'task_failed';
  botName: string;
  chatId: string;
  userId?: string;
  prompt?: string;
  responsePreview?: string;
  costUsd?: number;
  durationMs?: number;
  errorMessage?: string;
  timestamp: number;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  model?: string;
}

export function isStaleSessionError(errorMessage?: string): boolean {
  if (!errorMessage) return false;
  return /no conversation found|conversation not found|session.*ended|ended unexpectedly|session id|invalid session|thread\/resume.*failed|no rollout found|multiple.*tool_result.*blocks|each tool_use must have a single result/i.test(
    errorMessage,
  );
}

export function isContextOverflowError(errorMessage?: string): boolean {
  if (!errorMessage) return false;
  return /context.window.exceeds.limit|context.length.exceeded|context.too.long|max.context.length|token.limit.exceeded|maximum.context|reached.*context.*window.*limit|exceeded.*context|context.*window.*reached|prompt.*too.*long|input.*too.*long/i.test(
    errorMessage,
  );
}
