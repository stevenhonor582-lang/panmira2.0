/**
 * R49-C1: BridgeObserver
 * 摘要 / 归档 / 活动事件发射相关方法
 * 抽出自 message-bridge.ts (原 2980 行)
 */
import type { Logger } from '../utils/logger.js';
import type { BotConfigBase } from '../config.js';
import type { SessionRegistry } from '../session/session-registry.js';
import type { SessionManager } from '../engines/index.js';
import type { ActivityEventData } from './bridge-types.js';
import {
  DEFAULT_AUTO_COMPRESS_CONFIG,
  summaryCharLimitFromRetainRatio,
  type AutoCompressRuntimeConfig,
} from './context-manager.js';

export interface BridgeObserverDeps {
  config: BotConfigBase;
  logger: Logger;
  /** Lazy getter: sessionRegistry 通过 setSessionRegistry 后注入,observer 构造时可能为 undefined */
  getSessionRegistry: () => SessionRegistry | undefined | null;
  sessionManager: SessionManager;
  /** Lazy getter: onActivityEvent 是 public field,可能被外部 setActivityEventListener 后赋值 */
  getOnActivityEvent: () => ((event: ActivityEventData) => void) | undefined;
}

export class BridgeObserver {
  constructor(private readonly deps: BridgeObserverDeps) {}

  /** Emit an activity event if a listener is registered. */
  emit(event: ActivityEventData): void {
    try {
      this.deps.getOnActivityEvent()?.(event);
    } catch (err: any) {
      this.deps.logger.debug({ err: err?.message }, 'Activity event emission failed');
    }
  }

  /** Persist session snapshot to the session registry (fire-and-forget on caller). */
  async recordSession(
    chatId: string,
    prompt: string,
    responseText: string | undefined,
    claudeSessionId: string | undefined,
    costUsd: number | undefined,
    durationMs: number | undefined,
  ): Promise<void> {
    const registry = this.deps.getSessionRegistry();
    if (!registry) return;
    try {
      await registry.createOrUpdate({
        chatId,
        botName: this.deps.config.name,
        claudeSessionId,
        workingDirectory: this.deps.sessionManager.getSession(chatId).workingDirectory,
        prompt,
        responseText,
        costUsd,
        durationMs,
      });
    } catch (err: any) {
      this.deps.logger.warn({ err: err.message, chatId }, 'recordSession failed');
    }
  }

  /** Build proactive summary text from a state, used when resetting sessions. */
  buildSummary(
    state: { responseText?: string; toolCalls?: Array<{ name: string; detail: string }> },
    autoCompress: AutoCompressRuntimeConfig = DEFAULT_AUTO_COMPRESS_CONFIG,
  ): string | undefined {
    const parts: string[] = [];
    if (state.responseText) {
      parts.push('## 最近回复');
      parts.push(state.responseText.slice(0, summaryCharLimitFromRetainRatio(2000, autoCompress)));
    }
    if (state.toolCalls && state.toolCalls.length > 0) {
      parts.push('## 最近的工具调用');
      const lines = state.toolCalls.slice(-10).map((t) => '- ' + t.name + ': ' + t.detail.slice(0, 200));
      parts.push(lines.join(String.fromCharCode(10)));
    }
    return parts.length > 0 ? parts.join(String.fromCharCode(10) + String.fromCharCode(10)) : undefined;
  }
}
