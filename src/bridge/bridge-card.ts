/**
 * R49-C1: BridgeCard
 * Final 卡 / 审计 / 通知 相关方法
 * 抽出自 message-bridge.ts (原 2947 行)
 */
import type { CardState } from '../types.js';
import type { Logger } from '../utils/logger.js';
import type { BotConfigBase } from '../config.js';
import type { StreamProcessor } from '../engines/index.js';
import type { CardRendererDeps } from './card-renderer.js';
import { sendFinalCard, sendPlanContent, sendCompletionNotice } from './card-renderer.js';
import type { RunningTask } from './bridge-types.js';

export interface BridgeCardDeps {
  config: BotConfigBase;
  logger: Logger;
  /** Session manager — used by sendFinalCard to record cumulative cost */
  sessionManager: import('../engines/index.js').SessionManager;
  /** Sender resolver — used by all card senders to dispatch to right IM platform */
  getSender: (chatId?: string) => import('./message-sender.interface.js').IMessageSender;
  /** runningTasks map — used by auditCorrectFinalCard to read lastUserAnswers */
  getRunningTask: (chatId: string) => RunningTask | undefined;
}

export interface AuditResult {
  violations: string[];
  count: number;
}

export class BridgeCard {
  private _autonomyViolationCount: number = 0;

  constructor(private readonly deps: BridgeCardDeps) {}

  /** Card renderer deps getter — reused by sendFinalCard/sendPlanContent/sendCompletionNotice */
  private get cardDeps(): CardRendererDeps {
    return {
      logger: this.deps.logger,
      sessionManager: this.deps.sessionManager,
      getSender: this.deps.getSender,
    };
  }

  /**
   * Send the final card update with exponential backoff retry.
   * Retries with exponential backoff (2s → 4s → 8s). If all retries fail,
   * sends a plain text fallback so the user at least sees the result.
   */
  async sendFinalCard(messageId: string, state: CardState, chatId?: string): Promise<void> {
    // commit-17 (2026-06-25): audit bot autonomy violations
    // Per user.bot_autonomy 95% + user.bot.behavior.no_auto_recommend 95%:
    //   - bot must NOT auto-recommend
    //   - bot must NOT say "我推荐 X" / "我建议 X" / "按 X 落地" / "默认推荐 X"
    //   - bot 看到 risk/issue -> 告诉用户，让用户决定
    this.auditBotAutonomy(state, chatId);
    return sendFinalCard(this.cardDeps, messageId, state, chatId);
  }

  /**
   * Read and send plan file content to the user when ExitPlanMode is triggered.
   */
  async sendPlanContent(chatId: string, processor: StreamProcessor, currentState: CardState): Promise<void> {
    return sendPlanContent(this.cardDeps, chatId, processor, currentState);
  }

  /**
   * Send a short text message when a task completes (for long-running tasks).
   * Card updates don't trigger Feishu mobile push notifications, but new messages do.
   * Only sends for tasks that took longer than 10 seconds.
   */
  async sendCompletionNotice(chatId: string, state: CardState, durationMs: number): Promise<void> {
    return sendCompletionNotice(this.cardDeps, chatId, state, durationMs);
  }

  /**
   * Getter for the autonomy violation counter (used by metrics export).
   */
  getAutonomyViolationCount(): number {
    return this._autonomyViolationCount;
  }

  /** Reset autonomy violation counter (used between sessions / by tests). */
  resetAutonomyViolationCount(): void {
    this._autonomyViolationCount = 0;
  }

  /**
   * commit-17: detect bot autonomous recommendation in final output.
   * commit-18: metrics counter + detailed audit log.
   * Per user.bot_autonomy 95% + user.bot.behavior.no_auto_recommend 95%:
   *   - bot must NOT auto-recommend
   *   - bot 看到 risk/issue -> 告诉用户，让用户决定
   *
   * Returns: { violations: string[], count: number } for metrics tracking
   */
  auditBotAutonomy(state: CardState, chatId?: string): AuditResult {
    const text = state.responseText || '';
    // Detect autonomous recommendation patterns
    const recommendPattern = /我推荐[：:]?|我建议[：:]?|按\s*[\w\s]+\s*落地|默认推荐|建议\s*(你|您)/g;
    const matches = text.match(recommendPattern);
    if (matches && matches.length > 0) {
      this._autonomyViolationCount += matches.length;

      this.deps.logger.warn({
        chatId,
        bot: this.deps.config.name,
        matches,
        matchCount: matches.length,
        textLen: text.length,
        totalViolationsThisSession: this._autonomyViolationCount,
        // commit-18: structured audit fields
        auditType: 'bot_autonomy_violation',
        detectedAt: new Date().toISOString(),
        rule: 'user.bot_autonomy 95% + user.bot.behavior.no_auto_recommend 95%',
      }, 'commit-18 AUDIT: bot output contains autonomous recommendation - violates user.bot_autonomy');

      // Append explicit reminder to responseText (before final card send)
      const warningBanner = '\n\n---\n⚠️ **决策权在用户**：以上是 bot 看到的事实 + 你之前的输入。bot 不替你决策，请你自己决定。';
      state.responseText = text + warningBanner;
    }
    return { violations: matches || [], count: matches?.length || 0 };
  }

  /**
   * fix(xuanjian-card-lie, 2026-06-29): audit-correct Final card text.
   * If LLM falsely claims 未收到/失败/未执行 while task.lastUserAnswers has
   * real answers, replace the misleading phrase with the actual answer.
   *
   * Root cause: handleAnswer correctly writes answers into updatedInput via
   * resolveQuestion, but LLM stream-processor accumulates ALL text blocks
   * (including LLM thinking aloud output) into responseText. Final card
   * then displays that thinking, not the actual behavior.
   *
   * Fix: detect claim + check lastUserAnswers + replace. No audit log query
   * needed — answers are kept in memory on the running task.
   */
  async auditCorrectFinalCard(
    chatId: string,
    state: CardState,
  ): Promise<CardState> {
    if (!state.responseText) return state;
    const lowerText = state.responseText.toLowerCase();
    const claimPatterns = ['未收到', '空应答', '没收到', 'with: = 空', 'with:=""', 'with: ""'];
    const claimed = claimPatterns.some((k) => lowerText.toLowerCase().includes(k.toLowerCase()));
    if (!claimed) return state;

    const task = this.deps.getRunningTask(chatId);
    const answers = task?.lastUserAnswers;
    if (!answers || Object.keys(answers).length === 0) {
      this.deps.logger.warn(
        { chatId },
        'LLM Final card claims 未收到 and audit has no answer — keeping text as-is (genuine timeout?)',
      );
      return state;
    }

    const answerText = Object.values(answers).join(' / ');
    this.deps.logger.warn(
      { chatId, claimed: 'not received', actual: answerText },
      'LLM Final card lied about not receiving answer — correcting from task.lastUserAnswers',
    );
    // Step 1: replace "未收到" phrase with acknowledgment of real answer
    let fixed = state.responseText.replace(
      /(未收到[^\n]{0,80}|空应答[^\n]{0,80}|没收到[^\n]{0,80}|with:\s*=\s*空[^\n]{0,80}|with:\s*=\s*""[^\n]{0,80})/g,
      `已收到你的选择：${answerText}`,
    );

    // Step 2 (fix, 2026-06-29): truncate LLM fallback lists that were generated
    // under the false "未收到" assumption. Per user.bot_interaction.expectation
    // + user.prefer.bot_behavior_on_question_timeout: after a real answer is
    // received, LLM's "3 个可能意图 / 或者直接发 / 你可以 / 下一条消息直接说"
    // is misleading — strip these fallback phrasings so Final card shows only
    // the real execution content.
    fixed = fixed.replace(
      /\n\n[\s\S]*(3 个可能意图|3 个可能选项|或者直接发|你可以|下一条消息直接说|下一条消息直接回复|如果你看到中途想叫停)[^\n]*\n?[\s\S]*?(?=\n\n|$)/g,
      '\n\n',
    ).trim();

    return { ...state, responseText: fixed };
  }
}
