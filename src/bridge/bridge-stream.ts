/**
 * R49-C1: BridgeStream
 * 读流 / retry / timeout / continuation 相关方法
 * 抽出自 message-bridge.ts (步 4)
 */
import type { Logger } from '../utils/logger.js';
import type { BotConfigBase } from '../config.js';
import type { CardState, PendingQuestion } from '../types.js';
import type { ExecutionHandle, StreamProcessor, SessionManager } from '../engines/index.js';
import type { IMessageSender } from './message-sender.interface.js';
import type { RateLimiter } from './rate-limiter.js';
import type { RunningTask } from './bridge-types.js';
import {
  isStaleSessionError,
  isContextOverflowError,
  TASK_TIMEOUT_MESSAGE,
  IDLE_TIMEOUT_MESSAGE,
} from './bridge-types.js';

/** Outcome of one stream consumption pass. */
export interface StreamConsumeOutcome {
  lastState: CardState;
  /** Whether the loop broke due to terminal state (complete/error) vs abort/timeout. */
  terminated: boolean;
  /** Whether the loop hit a waiting_for_input state (handled by caller). */
  sawWaitingForInput: boolean;
}

/** Per-call context for consumeStream — keeps runningTask mutation at caller. */
export interface StreamConsumeContext {
  chatId: string;
  userId: string;
  messageId: string;
  abortController: AbortController;
  processor: StreamProcessor;
  runningTask: RunningTask;
  session: ReturnType<SessionManager['getSession']>;
  engineName: string;
  rateLimiter: RateLimiter;
  /** Reset the idle timer (caller controls because it needs closure over setTimeout). */
  resetIdleTimer: () => void;
  /** Called when stream ends without terminal state — caller decides how to handle timeout/idle flags. */
  onStreamEnded?: () => { timedOut: boolean; idledOut: boolean };
  /** Called for each waiting_for_input transition. */
  onWaitingForInput?: (state: CardState, question: PendingQuestion) => Promise<void>;
  /** Called when ExitPlanMode SDK tool is detected. */
  onExitPlanMode?: (state: CardState) => Promise<void>;
}

export interface BridgeStreamDeps {
  config: BotConfigBase;
  logger: Logger;
  sessionManager: SessionManager;
  getSender: (chatId: string) => IMessageSender;
}

/**
 * Build a continuation prompt when context overflows (third-party models
 * without compaction). Prepends a summary of previous tool calls + response
 * so the new session has enough context to continue.
 */
export function buildContinuationPrompt(originalPrompt: string, lastState: CardState): string {
  const parts: string[] = [
    '## 上下文续接（前次对话因长度溢出被压缩）',
    '',
    `**用户原始请求**: ${originalPrompt.slice(0, 500)}`,
    '',
  ];

  if (lastState.toolCalls && lastState.toolCalls.length > 0) {
    const toolSummary = lastState.toolCalls
      .slice(-10)
      .map((tc) => `- ${tc.name}${tc.detail ? ': ' + tc.detail.slice(0, 100) : ''} [${tc.status}]`)
      .join('\n');
    parts.push(`**已执行的操作**:\n${toolSummary}`, '');
  }

  if (lastState.responseText && lastState.responseText.length > 0) {
    const truncated =
      lastState.responseText.length > 1500
        ? lastState.responseText.slice(0, 800) + '\n...[中间内容省略]...\n' + lastState.responseText.slice(-500)
        : lastState.responseText;
    parts.push(`**已生成的回复摘要**:\n${truncated}`, '');
  }

  parts.push('## 请基于以上上下文继续');
  return parts.join('\n');
}

/**
 * Force a terminal state if stream ended without one (timeout / idle / abort / unexpected end).
 * Mirrors the inline logic in the three stream consumption sites.
 */
export function finalizeStreamState(
  lastState: CardState,
  flags: { timedOut: boolean; idledOut: boolean; aborted: boolean; logger?: Logger; chatId?: string },
): CardState {
  if (lastState.status === 'complete' || lastState.status === 'error') return lastState;
  if (flags.timedOut) return { ...lastState, status: 'error', errorMessage: TASK_TIMEOUT_MESSAGE };
  if (flags.idledOut) return { ...lastState, status: 'error', errorMessage: IDLE_TIMEOUT_MESSAGE };
  if (flags.aborted) return { ...lastState, status: 'error', errorMessage: 'Task was stopped' };
  if (flags.logger) {
    flags.logger.warn({ chatId: flags.chatId }, 'Stream ended without result message, forcing complete state');
  }
  return {
    ...lastState,
    status: 'error',
    errorMessage: lastState.responseText
      ? '任务被中断，请重新发送消息继续'
      : 'Claude session ended unexpectedly',
  };
}

/**
 * Detect whether a stream error message indicates the session can be retried
 * with a fresh session id.
 */
export function shouldRetryStream(lastState: CardState, session: ReturnType<SessionManager['getSession']>): {
  retryable: boolean;
  reason: 'stale_session' | 'context_overflow' | null;
} {
  if (lastState.status !== 'error') return { retryable: false, reason: null };
  if (isStaleSessionError(lastState.errorMessage) && session.sessionId) {
    return { retryable: true, reason: 'stale_session' };
  }
  if (isContextOverflowError(lastState.errorMessage) && session.sessionId) {
    return { retryable: true, reason: 'context_overflow' };
  }
  return { retryable: false, reason: null };
}

export class BridgeStream {
  constructor(private readonly deps: BridgeStreamDeps) {}

  /**
   * Consume one execution handle's stream until terminal state, abort, or end.
   * Mirrors the inline `for await (const message of executionHandle.stream)` blocks.
   * Mutates runningTask.lastResponsePreview + lastState via context, returns final state.
   */
  async consumeStream(
    handle: ExecutionHandle,
    ctx: StreamConsumeContext,
    initialState: CardState,
  ): Promise<StreamConsumeOutcome> {
    const {
      chatId,
      abortController,
      processor,
      runningTask,
      session,
      engineName,
      rateLimiter,
      resetIdleTimer,
      onWaitingForInput,
      onExitPlanMode,
    } = ctx;

    let lastState: CardState = initialState;
    let sawWaitingForInput = false;
    let terminated = false;

    for await (const message of handle.stream) {
      if (abortController.signal.aborted) break;
      resetIdleTimer();

      const state = processor.processMessage(message);
      lastState = state;

      // Track response preview for recovery notifications
      if (state.responseText) {
        runningTask.lastResponsePreview = state.responseText.slice(-300);
      }

      // Update session ID if discovered
      const newSessionId = processor.getSessionId();
      if (newSessionId && (newSessionId !== session.sessionId || session.sessionIdEngine !== engineName)) {
        this.deps.sessionManager.setSessionId(chatId, newSessionId, engineName as any);
      }

      // Check if we hit a waiting_for_input state
      if (state.status === 'waiting_for_input' && state.pendingQuestion) {
        sawWaitingForInput = true;
        if (onWaitingForInput) {
          await onWaitingForInput(state, state.pendingQuestion);
        }
        continue;
      }

      // Detect SDK-handled tools for side effects (plan content display).
      const sdkTools = processor.drainSdkHandledTools();
      for (const tool of sdkTools) {
        if (tool.name === 'ExitPlanMode' && onExitPlanMode) {
          await onExitPlanMode(state);
        }
      }

      // If we just got a message after answering a question, clear timeout state
      if (runningTask.pendingQuestion === null && runningTask.questionTimeoutId) {
        clearTimeout(runningTask.questionTimeoutId);
        runningTask.questionTimeoutId = undefined;
      }

      // Break on final states
      if (state.status === 'complete' || state.status === 'error') {
        terminated = true;
        break;
      }

      // Throttled card update for non-final states
      if (!abortController.signal.aborted) {
        rateLimiter.schedule(() => {
          if (!abortController.signal.aborted) {
            this.deps.getSender(chatId).updateCard(ctx.messageId, state);
          }
        });
      }
    }

    return { lastState, terminated, sawWaitingForInput };
  }

  /** Expose buildContinuationPrompt for callers (instance method to keep API uniform). */
  buildContinuationPrompt(originalPrompt: string, lastState: CardState): string {
    return buildContinuationPrompt(originalPrompt, lastState);
  }
}
