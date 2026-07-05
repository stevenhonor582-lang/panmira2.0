type AnyPool = { query: (...args: any[]) => Promise<any> };

/**
 * 工单 8 v2 / 8.4 (2026-07-06): 自动 context 压缩
 *
 * 触发条件(基于 usage 比例):
 * - < 80%   → 不压缩
 * - 80-95%  → 触发压缩(写入 memory,reset session)
 * - > 95%   → 强制压缩(同 warn,优先压缩)
 *
 * 设计意图:
 * - contextWindow 由 stream-processor.inferContextWindow 按模型动态绑定
 *   (opus-4 = 200k, sonnet-4 = 200k, MiniMax-M3 = 512k, deepseek = 1M)
 * - 压缩把"历史对话摘要"写入 memories 表,然后 resetSession 重新开始
 * - 用户感知:无感,bot 自动续接(下轮 context 干净,但 history 已被总结存到 memory)
 */

export type CompressionUrgency = 'none' | 'warn' | 'force';

export interface CompressorDeps {
  sessionManager: {
    getSession(chatId: string): { sessionId: string; model: string; cumulativeCostUsd: number };
    consumePendingSummary(chatId: string): string | null;
    setSessionId(chatId: string, sessionId: string, engineName?: string): void;
    resetSession(chatId: string, summary?: string): void;
  };
  pool: AnyPool;
  logger: {
    info: (obj: any, msg?: string) => void;
    warn: (obj: any, msg?: string) => void;
    error: (obj: any, msg?: string) => void;
    debug: (obj: any, msg?: string) => void;
    child: (bindings: any) => any;
  };
  /** 当前对话总 token 数(SDK result / 流式累计) */
  totalTokens: number;
  /** context window(从 model 推算,如 opus-4=200k) */
  contextWindow: number;
  chatId: string;
  botName: string;
  /** 触发压缩阈值(默认 0.8) */
  threshold?: number;
  /** 强制阈值(默认 0.95) */
  forceThreshold?: number;
}

export class ContextCompressor {
  constructor(private deps: CompressorDeps) {}

  usageRatio(): number {
    if (!this.deps.contextWindow || this.deps.contextWindow <= 0) return 0;
    return this.deps.totalTokens / this.deps.contextWindow;
  }

  urgency(): CompressionUrgency {
    const ratio = this.usageRatio();
    if (ratio >= (this.deps.forceThreshold ?? 0.95)) return 'force';
    if (ratio >= (this.deps.threshold ?? 0.8)) return 'warn';
    return 'none';
  }

  shouldCompress(): boolean {
    return this.urgency() !== 'none';
  }

  /**
   * 压缩对话:
   * 1. 把 summary 写入 memories(按 bot+subject 去重)
   * 2. resetSession(下次 query 自动开新 SDK session,context 干净)
   * 3. 触发后用户感知:无感,bot 自动续接
   */
  async compress(summary: string): Promise<void> {
    if (!this.shouldCompress()) {
      throw new Error(`Compress called but usage ${this.usageRatio().toFixed(2)} below threshold`);
    }

    const subject = `auto-compress/${new Date().toISOString().slice(0, 10)}`;
    const content = `[auto-compress] ${summary.slice(0, 4000)}`;
    const metadata = {
      source: 'auto-compress',
      chat_id: this.deps.chatId,
      urgency: this.urgency(),
      usage_ratio: this.usageRatio(),
      total_tokens: this.deps.totalTokens,
      context_window: this.deps.contextWindow,
    };

    try {
      await this.deps.pool.query(
        `INSERT INTO memories (id, content, layer, user_id, bot_id, tenant_id, importance,
           metadata_json, subject, subject_normalized, confidence, hit_count, type, polarity)
         SELECT gen_random_uuid()::text, $1, 3, $2, bc.bot_id, 'tenant-default', 8,
           $3::jsonb, $4, $4, 0.9, 0, 'event', 'affirm'
         FROM bot_configs bc WHERE bc.name = $5 LIMIT 1`,
        [content, 'auto-compress', JSON.stringify(metadata), subject, this.deps.botName],
      );
    } catch (e: any) {
      this.deps.logger.error({ err: e.message, chatId: this.deps.chatId }, 'ContextCompressor: memory write failed');
      throw e;
    }

    this.deps.sessionManager.resetSession(this.deps.chatId, summary.slice(0, 1000));

    this.deps.logger.info({
      chatId: this.deps.chatId,
      botName: this.deps.botName,
      ratio: this.usageRatio().toFixed(2),
      urgency: this.urgency(),
    }, 'Context compressed + session reset');
  }
}
