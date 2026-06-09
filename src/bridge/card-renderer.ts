import * as fsPromises from 'node:fs/promises';
import type { CardState } from '../types.js';
import type { Logger } from '../utils/logger.js';
import type { IMessageSender } from './message-sender.interface.js';
import type { SessionManager } from '../engines/index.js';
import type { StreamProcessor } from '../engines/index.js';
import { FINAL_CARD_RETRIES, FINAL_CARD_BASE_DELAY_MS } from './bridge-types.js';

export interface CardRendererDeps {
  logger: Logger;
  sessionManager: SessionManager;
  getSender: (chatId?: string) => IMessageSender;
}

export async function sendFinalCard(
  deps: CardRendererDeps,
  messageId: string,
  state: CardState,
  chatId?: string,
): Promise<void> {
  if (chatId && (state.status === 'complete' || state.status === 'error')) {
    deps.sessionManager.addUsage(chatId, state.totalTokens ?? 0, state.costUsd ?? 0, state.durationMs ?? 0);
    const session = deps.sessionManager.getSession(chatId);
    state.sessionCostUsd = session.cumulativeCostUsd;
  }
  for (let attempt = 0; attempt < FINAL_CARD_RETRIES; attempt++) {
    const ok = await deps.getSender(chatId).updateCard(messageId, state);
    if (ok) return;
    const delay = FINAL_CARD_BASE_DELAY_MS * Math.pow(2, attempt);
    deps.logger.warn({ attempt, delay, messageId }, 'Final card update failed, retrying');
    await new Promise((r) => setTimeout(r, delay));
  }
  if (chatId) {
    deps.logger.error({ messageId, chatId }, 'All final card retries failed, sending text fallback');
    const statusEmoji = state.status === 'complete' ? '✅' : '❌';
    const summary = state.responseText ? state.responseText.slice(0, 2000) : state.errorMessage || 'Task finished';
    try {
      await deps.getSender(chatId).sendText(chatId, `${statusEmoji} ${summary}`);
    } catch (err: any) {
      deps.logger.warn({ err: err?.message }, 'Failed to send completion notice');
    }
  }
}

export async function sendPlanContent(
  deps: CardRendererDeps,
  chatId: string,
  processor: StreamProcessor,
  _currentState: CardState,
): Promise<void> {
  const planPath = processor.getPlanFilePath();
  if (!planPath) return;

  try {
    const planContent = await fsPromises.readFile(planPath, 'utf-8');
    if (!planContent.trim()) return;

    deps.logger.info({ chatId, planPath }, 'Sending plan content to user');
    await deps.getSender(chatId).sendTextNotice(chatId, '📋 Plan', planContent, 'green');
  } catch (err) {
    deps.logger.warn({ err, planPath, chatId }, 'Failed to read plan file for display');
  }
}

export async function sendCompletionNotice(
  deps: CardRendererDeps,
  chatId: string,
  state: CardState,
  durationMs: number,
): Promise<void> {
  if (deps.getSender(chatId).skipCompletionNotice) return;
  if (durationMs < 10_000) return;

  const statusEmoji = state.status === 'complete' ? '✅' : '❌';
  const durationStr =
    durationMs >= 60_000 ? `${(durationMs / 60_000).toFixed(1)}min` : `${(durationMs / 1000).toFixed(0)}s`;
  const costStr = state.sessionCostUsd
    ? ` · $${state.sessionCostUsd.toFixed(2)}`
    : state.costUsd
      ? ` · $${state.costUsd.toFixed(2)}`
      : '';
  const statusWord = state.status === 'complete' ? 'Done' : 'Failed';

  const modelStr = state.model ? ` · ${state.model.replace(/^claude-/, '')}` : '';

  let usageStr = '';
  if (state.totalTokens && state.contextWindow) {
    const pct = Math.round((state.totalTokens / state.contextWindow) * 100);
    const tokensK = state.totalTokens >= 1000 ? `${(state.totalTokens / 1000).toFixed(1)}k` : `${state.totalTokens}`;
    const ctxK = `${Math.round(state.contextWindow / 1000)}k`;
    usageStr = ` · ${tokensK}/${ctxK} (${pct}%)`;
  } else if (state.totalTokens) {
    const tokensK = state.totalTokens >= 1000 ? `${(state.totalTokens / 1000).toFixed(1)}k` : `${state.totalTokens}`;
    usageStr = ` · ${tokensK} tokens`;
  }

  const message = `${statusEmoji} ${statusWord} (${durationStr}${costStr}${modelStr}${usageStr})`;

  try {
    await deps.getSender(chatId).sendText(chatId, message);
  } catch (err) {
    deps.logger.warn({ err, chatId }, 'Failed to send completion notice');
  }
}
