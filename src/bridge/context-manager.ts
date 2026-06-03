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

const CHARS_PER_TOKEN = 4;

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

  /** Estimate token count from character length. */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / CHARS_PER_TOKEN);
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
        const charBudget = remainingBudget * CHARS_PER_TOKEN;
        kept.push(layer.content.slice(0, charBudget) + '\n...[truncated]');
        remainingBudget = 0;
      }
      // If no budget left, stop adding
      if (remainingBudget <= 0) break;
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
