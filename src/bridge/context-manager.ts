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

export const CONTEXT_USAGE_THRESHOLD = 0.85;

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
  shouldCompress(usedTokens: number, contextWindow: number): boolean {
    return usedTokens / contextWindow >= CONTEXT_USAGE_THRESHOLD;
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
