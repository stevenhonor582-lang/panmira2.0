import { ClarificationError, isClarificationError } from './errors.js';
import { ClarificationEngine } from './engine.js';
import { ConfigLoader } from './config-loader.js';
import { CardBuilder } from './card-builder.js';
import { SessionStore } from './session-store.js';
import type { FeishuCard } from './card-builder.js';

export interface MiddlewareContext {
  userId: string;
  botId: string;
  targetSkill: string;
  rawMessage: string;
  enrichedPayload?: Record<string, any>;
  chatId?: string;
}

export type Next = () => Promise<void> | void;
export type CardSender = (chatId: string, card: FeishuCard) => Promise<boolean>;
export type TextSender = (chatId: string, text: string) => Promise<boolean>;

export class ClarificationMiddleware {
  constructor(
    private engine: ClarificationEngine,
    private sessionStore: SessionStore,
    private configLoader: ConfigLoader,
    private cardBuilder: CardBuilder,
    private sendCard: CardSender,
    private sendTextFallback?: TextSender,
  ) {}

  async handle(ctx: MiddlewareContext, next: Next): Promise<void> {
    const config = this.configLoader.load(ctx.botId);

    if (!config.enabled) {
      await next();
      return;
    }

    let result;
    try {
      result = await this.engine.process({
        userId: ctx.userId,
        botId: ctx.botId,
        targetSkill: ctx.targetSkill,
        rawMessage: ctx.rawMessage,
        existingPayload: ctx.enrichedPayload,
      });
    } catch (err) {
      if (isClarificationError(err) && err.recoverable) {
        console.warn('[clarification] engine error, falling through', err);
        await next();
        return;
      }
      throw err;
    }

    if (!result.needsClarification) {
      ctx.enrichedPayload = result.payload;
      await next();
      return;
    }

    try {
      const card = this.cardBuilder.build(result.suggestedQuestions || [], ctx.targetSkill);
      const sent = await this.sendCard(ctx.chatId || ctx.userId, card);
      
      if (!sent && this.sendTextFallback) {
        await this.sendTextFallback(
          ctx.chatId || ctx.userId,
          this.cardToText(result.suggestedQuestions || [], ctx.targetSkill)
        );
      }

      await this.sessionStore.create(
        ctx.userId, ctx.botId, ctx.targetSkill, result.missingFields
      );
    } catch (err) {
      if (isClarificationError(err) && !err.recoverable) {
        throw err;
      }
      console.warn('[clarification] card/session failed, falling through', err);
    }
  }


  async handlePreIntent(ctx: MiddlewareContext, next: Next): Promise<void> {
    const config = this.configLoader.load(ctx.botId);

    if (!config.enabled) {
      await next();
      return;
    }

    let result;
    try {
      result = await this.engine.processPreIntent(ctx.enrichedPayload || {});
    } catch (err) {
      if (isClarificationError(err) && err.recoverable) {
        console.warn('[clarification] pre-intent engine error, falling through', err);
        await next();
        return;
      }
      throw err;
    }

    if (!result.needsClarification) {
      ctx.enrichedPayload = result.payload;
      await next();
      return;
    }

    try {
      const card = this.cardBuilder.build(result.suggestedQuestions || [], '需求澄清');
      const sent = await this.sendCard(ctx.chatId || ctx.userId, card);

      if (!sent && this.sendTextFallback) {
        await this.sendTextFallback(
          ctx.chatId || ctx.userId,
          this.cardToText(result.suggestedQuestions || [], '需求澄清')
        );
      }

      await this.sessionStore.create(
        ctx.userId, ctx.botId, 'pre_intent', result.missingFields
      );
    } catch (err) {
      if (isClarificationError(err) && !err.recoverable) {
        throw err;
      }
      console.warn('[clarification] pre-intent card/session failed, falling through', err);
    }
  }
  private cardToText(questions: any[], skillName: string): string {
    const lines = [`📋 ${skillName} · 请确认以下信息:`];
    for (const q of questions) {
      lines.push(`\n• ${q.text}`);
      if (q.options) {
        lines.push(q.options.map((o: any, i: number) => `  ${i + 1}. ${o.label}`).join('\n'));
      } else {
        lines.push(`  (手动输入)`);
      }
    }
    return lines.join('\n');
  }
}
