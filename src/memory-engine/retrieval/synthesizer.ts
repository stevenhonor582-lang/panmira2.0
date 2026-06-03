import { MemoryLayer } from '../../core/constants.js';
import type { MemoryResult } from '../../core/types.js';

const LAYER_LABELS: Record<number, string> = {
  [MemoryLayer.RAW]: '原始记录',
  [MemoryLayer.USER]: '用户记忆',
  [MemoryLayer.AGENT]: 'Agent 记忆',
  [MemoryLayer.SHARED]: '共享知识',
};

export class ContextSynthesizer {
  synthesize(results: MemoryResult[], query: string): string {
    if (results.length === 0) return '';

    const grouped = new Map<number, MemoryResult[]>();
    for (const r of results) {
      const layer = r.memory.layer;
      const existing = grouped.get(layer) ?? [];
      grouped.set(layer, [...existing, r]);
    }

    const sections: string[] = [`## 相关记忆 (查询: "${query}")\n`];

    for (const [layer, items] of Array.from(grouped.entries())) {
      const label = LAYER_LABELS[layer] ?? `层级${layer}`;
      sections.push(`### ${label}`);
      for (const item of items) {
        const sim = (item.similarity * 100).toFixed(0);
        sections.push(`- [${sim}%] ${item.memory.content}`);
      }
      sections.push('');
    }

    return sections.join('\n');
  }
}
