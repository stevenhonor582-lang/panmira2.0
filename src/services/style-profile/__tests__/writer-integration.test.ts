// writer-integration.test.ts — simulate how writer skill uses StyleSpec
// Tests the contract: writer receives spec + prompt fragment, can build a complete
// system_prompt / user_message with style constraints injected.

import { describe, it, expect } from 'vitest';
import { renderStyleSpec, type StyleSpecLite } from '../style-spec-renderer.js';

// Mock StyleSpecLite (as it would come from compositor)
const writerMockSpec: StyleSpecLite = {
  topic: 'MJF vs FDM 3D printing comparison',
  reader: 'manufacturing engineer selecting process',
  master: { id: 'master-001', name: 'Protolabs MJF vs FDM Guide', sourceUrl: 'https://protolabs.com/...' },
  aux: [
    { id: 'aux-001', name: 'Xometry Comparison', score: 0.42 },
    { id: 'aux-002', name: 'WayKen 5-axis', score: 0.31 },
  ],
  slots: {
    title_formula: 'X vs Y: Choosing the Right Z for Your Application',
    opening_pattern: 'Open with a data point (e.g., "MJF achieves 0.05mm tolerance...")',
    body_structure: '4 sections: intro / process overview / comparison table / recommendation',
    voice_tone: 'engineer-to-engineer, data-driven, confident',
    pronoun_usage: 'you-dominant + occasional we',
    paragraph_rhythm: '3-4 sentences per paragraph (60-90 words)',
    cta_strategy: 'Soft CTA: link to related guide + mention consulting',
    link_strategy: '3-5 inline links to related manufacturing guides',
  },
  slotProvenance: {
    title_formula: 'master-001',
    opening_pattern: 'master-001',
    body_structure: 'master-001',
    voice_tone: 'aux-001',
    pronoun_usage: 'master-001',
    paragraph_rhythm: 'aux-002',
    cta_strategy: 'master-001',
    link_strategy: 'master-001',
  },
  empty: [],
};

describe('writer skill integration — system_prompt injection', () => {
  it('renders spec into a system_prompt fragment', () => {
    const fragment = renderStyleSpec(writerMockSpec);
    // Should be a coherent instruction block, not raw JSON
    expect(fragment).toContain('## 风格规范');
    expect(fragment).toContain('硬约束');
    // All 8 slots should be present
    const slotLabels = ['标题公式', '开篇模式', '正文结构', '语气', '代词用法', '段落节奏', 'CTA 策略', '链接策略'];
    for (const label of slotLabels) {
      expect(fragment).toContain(label);
    }
  });

  it('fragment is self-contained — no need to pass StyleSpec separately to LLM', () => {
    const fragment = renderStyleSpec(writerMockSpec);
    // Master + aux are inline; no need for separate lookup
    expect(fragment).toContain('Protolabs MJF vs FDM Guide');
    expect(fragment).toContain('Xometry Comparison');
    // Slots are inline with values
    expect(fragment).toContain('engineer-to-engineer, data-driven, confident');
  });
});

describe('writer skill integration — user_message augmentation', () => {
  it('can be combined with writer original user message', () => {
    const originalUserMsg = '请帮我写一篇关于 MJF vs FDM 的对比文章,目标读者是制造业工程师。';
    const styleFragment = renderStyleSpec(writerMockSpec);
    const combined = `${originalUserMsg}\n\n${styleFragment}`;

    // Both parts preserved
    expect(combined).toContain('请帮我写一篇');
    expect(combined).toContain('## 风格规范');
    expect(combined).toContain('MJF vs FDM 3D printing comparison');
  });
});

describe('writer skill integration — slot enforcement contract', () => {
  it('all 8 slots present when fully composed', () => {
    const fragment = renderStyleSpec(writerMockSpec);
    // Verify each slot is non-empty in the rendered output
    for (const slot of Object.keys(writerMockSpec.slots)) {
      // Each slot value should appear in the fragment
      const val = writerMockSpec.slots[slot as keyof typeof writerMockSpec.slots];
      expect(val).toBeTruthy();
      expect(fragment).toContain(val!);
    }
  });

  it('empty slots get explicit "(empty)" markers so LLM knows to improvise', () => {
    const partialSpec: StyleSpecLite = {
      ...writerMockSpec,
      slots: {
        title_formula: 'X vs Y',
        // other 7 slots missing
      },
      slotProvenance: {
        title_formula: 'master-001',
        opening_pattern: null, body_structure: null, voice_tone: null,
        pronoun_usage: null, paragraph_rhythm: null, cta_strategy: null, link_strategy: null,
      },
      empty: ['opening_pattern', 'body_structure', 'voice_tone', 'pronoun_usage', 'paragraph_rhythm', 'cta_strategy', 'link_strategy'],
    };
    const fragment = renderStyleSpec(partialSpec);
    // 7 empty slots should be marked
    const emptyMarkers = fragment.match(/由运营自由发挥/g);
    expect(emptyMarkers).toBeTruthy();
    expect(emptyMarkers!.length).toBe(7);
  });
});

describe('writer skill integration — length budget', () => {
  it('rendered fragment fits in typical system_prompt budget (< 2000 chars for full spec)', () => {
    const fragment = renderStyleSpec(writerMockSpec);
    expect(fragment.length).toBeLessThan(2000);
  });

  it('with long slot values, fragment still fits reasonable budget (< 4000 chars)', () => {
    const longSlots = {
      ...writerMockSpec.slots,
      body_structure: 'a'.repeat(500),
    };
    const spec = { ...writerMockSpec, slots: longSlots };
    const fragment = renderStyleSpec(spec, { slotMaxChars: 280 });
    expect(fragment.length).toBeLessThan(4000);
  });
});

describe('writer skill integration — slot value quality', () => {
  it('preserves technical terms in slot values (e.g., "5-axis", "tolerance")', () => {
    const fragment = renderStyleSpec(writerMockSpec);
    expect(fragment).toContain('engineer-to-engineer');
    expect(fragment).toContain('data-driven');
  });

  it('preserves non-ASCII / Chinese slot values intact', () => {
    const chineseSpec: StyleSpecLite = {
      ...writerMockSpec,
      slots: {
        ...writerMockSpec.slots,
        title_formula: 'MJF 对比 FDM:如何选择 3D 打印工艺',
        opening_pattern: '用数据开场,例如"MJF 精度 0.05mm"',
        body_structure: '4 段:引言 / 工艺对比 / 选型表 / 结论',
      },
    };
    const fragment = renderStyleSpec(chineseSpec);
    expect(fragment).toContain('MJF 对比 FDM');
    expect(fragment).toContain('0.05mm');
    expect(fragment).toContain('选型表');
  });
});

describe('writer skill integration — provenance transparency', () => {
  it('withProvenance shows which profile contributed each slot (debugging aid)', () => {
    const fragment = renderStyleSpec(writerMockSpec, { withProvenance: true });
    // voice_tone came from aux-001
    expect(fragment).toMatch(/voice_tone.*from aux-001|语气.*from aux-001/);
  });

  it('without provenance is cleaner for production use', () => {
    const withProv = renderStyleSpec(writerMockSpec, { withProvenance: true });
    const withoutProv = renderStyleSpec(writerMockSpec, { withProvenance: false });
    expect(withoutProv.length).toBeLessThan(withProv.length);
    expect(withoutProv).not.toMatch(/from master-001/);
  });
});