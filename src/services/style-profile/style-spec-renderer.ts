// style-spec-renderer.ts — turn a StyleSpec into a writer prompt fragment
// Pure function, no DB / no LLM. Used by writer skill to inject style constraints
// into the LLM's system_prompt or user_message.

import type { StyleSlots } from './types.js';

export interface StyleSpecLite {
  topic: string;
  reader: string;
  master: { id: string; name: string; sourceUrl: string | null } | null;
  aux: Array<{ id: string; name: string; score: number }>;
  slots: StyleSlots;
  slotProvenance: Record<keyof StyleSlots, string | null>;
  empty: (keyof StyleSlots)[];
}

export interface RenderOptions {
  /** When true, output markdown; when false, plain text. Default: true */
  markdown?: boolean;
  /** When true, include provenance (which profile contributed each slot). Default: false */
  withProvenance?: boolean;
  /** Maximum characters per slot value (truncate longer). Default: 280 */
  slotMaxChars?: number;
}

const SLOT_LABELS_ZH: Record<keyof StyleSlots, string> = {
  title_formula: '标题公式',
  opening_pattern: '开篇模式',
  body_structure: '正文结构',
  voice_tone: '语气',
  pronoun_usage: '代词用法',
  paragraph_rhythm: '段落节奏',
  cta_strategy: 'CTA 策略',
  link_strategy: '链接策略',
};

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

/** Render a StyleSpec as a writer prompt fragment (markdown or plain) */
export function renderStyleSpec(spec: StyleSpecLite, opts: RenderOptions = {}): string {
  const md = opts.markdown !== false;
  const withProv = opts.withProvenance === true;
  const maxChars = opts.slotMaxChars ?? 280;

  const head = md
    ? `## 风格规范 (StyleSpec)\n\n**主题**: ${spec.topic}  \n**读者**: ${spec.reader}\n`
    : `风格规范\n主题: ${spec.topic}\n读者: ${spec.reader}\n`;

  let master = '';
  if (spec.master) {
    master = md
      ? `\n### 主风格 (Master)\n- **${spec.master.name}** (\`${spec.master.id.slice(0, 8)}\`)${spec.master.sourceUrl ? ` — ${spec.master.sourceUrl}` : ''}\n`
      : `\n主风格: ${spec.master.name} (${spec.master.id.slice(0, 8)})\n`;
  } else {
    master = md ? `\n### 主风格: (无 — 候选库为空)\n` : `\n主风格: (无)\n`;
  }

  let aux = '';
  if (spec.aux.length > 0) {
    if (md) {
      aux = `\n### 辅助风格 (Aux)\n${spec.aux.map((a) => `- **${a.name}** [score=${a.score.toFixed(3)}]`).join('\n')}\n`;
    } else {
      aux = `\n辅助风格: ${spec.aux.map((a) => `${a.name} [${a.score.toFixed(3)}]`).join(', ')}\n`;
    }
  }

  let slotsBlock = '';
  const slotKeys = Object.keys(SLOT_LABELS_ZH) as (keyof StyleSlots)[];
  for (const k of slotKeys) {
    const v = spec.slots[k];
    const label = SLOT_LABELS_ZH[k];
    if (v) {
      const truncated = truncate(v, maxChars);
      const prov = withProv && spec.slotProvenance[k] ? ` _(from ${spec.slotProvenance[k]!.slice(0, 8)})_` : '';
      slotsBlock += md ? `- **${label}**: ${truncated}${prov}\n` : `${label}: ${truncated}\n`;
    } else {
      slotsBlock += md ? `- **${label}**: _(empty — 由运营自由发挥)_\n` : `${label}: (empty)\n`;
    }
  }

  const instructions = md
    ? `\n### 写作约束\n- 上述每个 slot 都是 **硬约束**,不是建议\n- slot 值为空的,允许按主题/读者自由发挥,但不能跟已填充 slot 冲突\n- 标题必须遵循 \`标题公式\`,开篇前 3 句必须遵循 \`开篇模式\`,整体语气一致\n`
    : `\n写作约束: 每个 slot 都是硬约束, slot 为空的允许自由发挥但不能冲突.\n`;

  return head + master + aux + (md ? '\n### 槽位规则\n' : '\n槽位规则:\n') + slotsBlock + instructions;
}

/** Render a short summary — useful for log lines / card titles */
export function renderSpecSummary(spec: StyleSpecLite): string {
  const filled = 8 - spec.empty.length;
  const masterName = spec.master?.name ?? '(no master)';
  return `StyleSpec: master=${masterName}, aux=${spec.aux.length}, filled=${filled}/8`;
}