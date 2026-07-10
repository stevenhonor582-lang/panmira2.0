/**
 * ContextManager — priority-based system prompt assembly with token budgets.
 * Lower-priority layers are trimmed first when the budget is tight.
 */

export enum ContextLayer {
  SYSTEM = 0,
  IDENTITY = 1,
  KNOWLEDGE = 2,
  SKILLS = 3,
  GROUP = 4,
  HISTORY = 5,
}



export interface LayerContent {
  layer: ContextLayer;
  content: string;
  /** If true, this layer can be dropped entirely when over budget. */
  trimmable?: boolean;
}

export interface AutoCompressRuntimeConfig {
  enabled: boolean;
  warnThreshold: number;
  compressThreshold: number;
  resetThreshold: number;
  retainRatio: number;
}

export type ContextUsageAction = 'none' | 'warn' | 'compress' | 'reset';

export const DEFAULT_AUTO_COMPRESS_CONFIG: AutoCompressRuntimeConfig = {
  enabled: true,
  warnThreshold: 0.5,
  compressThreshold: 0.7,
  resetThreshold: 0.85,
  retainRatio: 0.5,
};

/** @deprecated Use normalizeAutoCompressConfig(...).compressThreshold instead. */
export const CONTEXT_USAGE_THRESHOLD = DEFAULT_AUTO_COMPRESS_CONFIG.resetThreshold;

function ratioFromPercentLike(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const ratio = value > 1 ? value / 100 : value;
  return Math.min(0.99, Math.max(0.01, ratio));
}

export function normalizeAutoCompressConfig(raw: unknown): AutoCompressRuntimeConfig {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const warnThreshold = ratioFromPercentLike(
    obj.warnThresholdPct ?? obj.warningThresholdPct ?? obj.warnThreshold,
    DEFAULT_AUTO_COMPRESS_CONFIG.warnThreshold,
  );
  const compressThreshold = ratioFromPercentLike(
    obj.compressThresholdPct ?? obj.thresholdPct ?? obj.compressThreshold,
    DEFAULT_AUTO_COMPRESS_CONFIG.compressThreshold,
  );
  const resetThreshold = ratioFromPercentLike(
    obj.resetThresholdPct ?? obj.forceThresholdPct ?? obj.resetThreshold ?? obj.forceThreshold,
    DEFAULT_AUTO_COMPRESS_CONFIG.resetThreshold,
  );
  const retainRatio = ratioFromPercentLike(
    obj.retainRatioPct ?? obj.ratioPct ?? obj.retainRatio,
    DEFAULT_AUTO_COMPRESS_CONFIG.retainRatio,
  );

  return {
    enabled: typeof obj.enabled === 'boolean' ? obj.enabled : DEFAULT_AUTO_COMPRESS_CONFIG.enabled,
    warnThreshold: Math.min(warnThreshold, Math.max(0.01, compressThreshold - 0.01)),
    compressThreshold,
    resetThreshold: Math.max(resetThreshold, compressThreshold),
    retainRatio,
  };
}

export function resolveContextUsageAction(
  usedTokens: number,
  contextWindow: number,
  config: AutoCompressRuntimeConfig = DEFAULT_AUTO_COMPRESS_CONFIG,
): ContextUsageAction {
  if (!config.enabled || !contextWindow || contextWindow <= 0) return 'none';
  const ratio = usedTokens / contextWindow;
  if (ratio >= config.resetThreshold) return 'reset';
  if (ratio >= config.compressThreshold) return 'compress';
  if (ratio >= config.warnThreshold) return 'warn';
  return 'none';
}

export function summaryCharLimitFromRetainRatio(
  baseLimit: number,
  config: AutoCompressRuntimeConfig = DEFAULT_AUTO_COMPRESS_CONFIG,
): number {
  return Math.max(200, Math.floor(baseLimit * config.retainRatio));
}

export class ContextManager {
  private layers: LayerContent[] = [];

  addLayer(layer: LayerContent): this {
    this.layers.push(layer);
    return this;
  }

  /** Estimate token count, accounting for CJK characters. */
  private estimateTokens(text: string): number {
    if (!text) return 0;
    const cjkCount = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
    const nonCjkCount = text.length - cjkCount;
    // CJK: ~1.5 chars/token, English: ~4 chars/token
    return Math.ceil(cjkCount / 1.5 + nonCjkCount / 4);
  }

  /** Total estimated tokens across all layers. */
  getTotalTokens(): number {
    return this.layers.reduce((sum, l) => sum + this.estimateTokens(l.content), 0);
  }

  /** Check if proactive compression should be triggered. */
  shouldCompress(
    usedTokens: number,
    contextWindow: number,
    config: AutoCompressRuntimeConfig = DEFAULT_AUTO_COMPRESS_CONFIG,
  ): boolean {
    const action = resolveContextUsageAction(usedTokens, contextWindow, config);
    return action === 'compress' || action === 'reset';
  }

  /**
   * Assemble the final system prompt within the given token budget.
   * Higher-priority (lower-numbered) layers are kept; lower-priority
   * layers are either truncated or dropped when they exceed budget.
   */
  buildPrompt(tokenBudget: number): string {
    // Sort by layer priority (ascending = highest priority first)
    const sorted = [...this.layers].sort((a, b) => a.layer - b.layer);

    const kept: string[] = [];
    let remainingBudget = tokenBudget;

    for (const layer of sorted) {
      const tokens = this.estimateTokens(layer.content);
      if (tokens <= remainingBudget) {
        kept.push(layer.content);
        remainingBudget -= tokens;
      } else if (layer.trimmable) {
        // Drop trimmable layers that don't fit
        continue;
      } else if (remainingBudget > 100) {
        // Truncate non-trimmable layer to fit
        // Use upper-bound char estimate (CJK-safe: 1.5 chars/token worst case)
        const charBudget = remainingBudget * 1.5;
        kept.push(layer.content.slice(0, charBudget) + '\n...[truncated]');
        remainingBudget = 0;
        // Don't break — continue to skip trimmable layers, preserving budget for future non-trimmable ones
      }
    }

    return kept.join('\n\n');
  }

  /** Clear all layers for reuse. */
  reset(): this {
    this.layers = [];
    return this;
  }

  /** Get the current number of layers. */
  getLayerCount(): number {
    return this.layers.length;
  }
}
