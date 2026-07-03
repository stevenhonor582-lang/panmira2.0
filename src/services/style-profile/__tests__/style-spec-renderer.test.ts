// style-spec-renderer.test.ts — render StyleSpec → writer prompt fragment

import { describe, it, expect } from 'vitest';
import { renderStyleSpec, renderSpecSummary } from '../style-spec-renderer.js';

const fullSpec = {
  topic: 'MJF vs FDM 3D printing',
  reader: 'manufacturing engineer',
  master: { id: 'abc-123-def-456', name: 'Protolabs Guide', sourceUrl: 'https://protolabs.com/mjf-vs-fdm' },
  aux: [
    { id: 'xyz-789-uvw-012', name: 'Xometry Comparison', score: 0.42 },
    { id: 'pqr-345-mno-678', name: 'WayKen CNC', score: 0.31 },
  ],
  slots: {
    title_formula: 'X vs Y: A Detailed Comparison',
    opening_pattern: 'Question hook + 3 key data points',
    body_structure: '4 sections: intro / process / comparison table / verdict',
    voice_tone: 'authoritative, data-driven',
    pronoun_usage: 'we / you',
    paragraph_rhythm: 'short paragraphs (2-3 sentences)',
    cta_strategy: 'consult our engineers',
    link_strategy: 'inline links to related guides',
  },
  slotProvenance: {
    title_formula: 'abc-123-def-456',
    opening_pattern: 'abc-123-def-456',
    body_structure: 'abc-123-def-456',
    voice_tone: 'xyz-789-uvw-012',
    pronoun_usage: 'abc-123-def-456',
    paragraph_rhythm: 'pqr-345-mno-678',
    cta_strategy: 'abc-123-def-456',
    link_strategy: 'abc-123-def-456',
  },
  empty: [],
};

describe('renderStyleSpec — markdown (default)', () => {
  it('includes topic + reader in header', () => {
    const out = renderStyleSpec(fullSpec);
    expect(out).toContain('MJF vs FDM 3D printing');
    expect(out).toContain('manufacturing engineer');
  });

  it('includes master name + short id', () => {
    const out = renderStyleSpec(fullSpec);
    expect(out).toContain('Protolabs Guide');
    expect(out).toContain('abc-123'); // first 8 chars
  });

  it('includes all 8 slot labels', () => {
    const out = renderStyleSpec(fullSpec);
    expect(out).toContain('标题公式');
    expect(out).toContain('开篇模式');
    expect(out).toContain('正文结构');
    expect(out).toContain('语气');
    expect(out).toContain('代词用法');
    expect(out).toContain('段落节奏');
    expect(out).toContain('CTA 策略');
    expect(out).toContain('链接策略');
  });

  it('lists all aux profiles with scores', () => {
    const out = renderStyleSpec(fullSpec);
    expect(out).toContain('Xometry Comparison');
    expect(out).toContain('0.420');
    expect(out).toContain('WayKen CNC');
    expect(out).toContain('0.310');
  });

  it('includes hard-constraint instructions', () => {
    const out = renderStyleSpec(fullSpec);
    expect(out).toContain('硬约束');
  });

  it('omits provenance by default', () => {
    const out = renderStyleSpec(fullSpec);
    expect(out).not.toContain('from abc-123');
  });
});

describe('renderStyleSpec — provenance', () => {
  it('withProvenance=true includes profile id origin for each slot', () => {
    const out = renderStyleSpec(fullSpec, { withProvenance: true });
    // voice_tone came from xyz-789
    expect(out).toMatch(/语气.*from xyz-789/s);
    // paragraph_rhythm came from pqr-345
    expect(out).toMatch(/段落节奏.*from pqr-345/s);
  });

  it('withProvenance=false omits from-source', () => {
    const out = renderStyleSpec(fullSpec, { withProvenance: false });
    expect(out).not.toMatch(/from [a-z0-9-]{8}/);
  });
});

describe('renderStyleSpec — empty slots', () => {
  it('marks empty slots as free-form', () => {
    const partial = {
      ...fullSpec,
      slots: {
        title_formula: 'X vs Y',
        // other 7 slots missing
      },
      slotProvenance: {
        title_formula: 'abc-123-def-456',
        opening_pattern: null,
        body_structure: null,
        voice_tone: null,
        pronoun_usage: null,
        paragraph_rhythm: null,
        cta_strategy: null,
        link_strategy: null,
      },
      empty: ['opening_pattern', 'body_structure', 'voice_tone', 'pronoun_usage', 'paragraph_rhythm', 'cta_strategy', 'link_strategy'],
    };
    const out = renderStyleSpec(partial);
    expect(out).toContain('(empty — 由运营自由发挥)');
  });

  it('all slots empty still produces valid output', () => {
    const empty = {
      ...fullSpec,
      slots: {},
      slotProvenance: {
        title_formula: null, opening_pattern: null, body_structure: null, voice_tone: null,
        pronoun_usage: null, paragraph_rhythm: null, cta_strategy: null, link_strategy: null,
      },
      empty: ['title_formula', 'opening_pattern', 'body_structure', 'voice_tone', 'pronoun_usage', 'paragraph_rhythm', 'cta_strategy', 'link_strategy'],
    };
    const out = renderStyleSpec(empty);
    expect(out).toContain('StyleSpec');
    expect(out).toContain('硬约束');
  });
});

describe('renderStyleSpec — truncation', () => {
  it('truncates slot values longer than slotMaxChars', () => {
    const longValue = 'a'.repeat(500);
    const spec = {
      ...fullSpec,
      slots: { ...fullSpec.slots, title_formula: longValue },
    };
    const out = renderStyleSpec(spec, { slotMaxChars: 100 });
    expect(out).toContain('a'.repeat(99) + '…');
    expect(out).not.toContain('a'.repeat(500));
  });
});

describe('renderStyleSpec — no master', () => {
  it('shows (no master) gracefully', () => {
    const noMaster = {
      ...fullSpec,
      master: null,
      aux: [],
    };
    const out = renderStyleSpec(noMaster);
    expect(out).toContain('主风格: (无');
  });
});

describe('renderStyleSpec — plain text mode', () => {
  it('markdown=false uses simple text format', () => {
    const out = renderStyleSpec(fullSpec, { markdown: false });
    expect(out).not.toContain('##');
    expect(out).not.toContain('###');
    expect(out).not.toContain('**');
    expect(out).toContain('标题公式:');
    expect(out).toContain('主风格:');
  });
});

describe('renderSpecSummary', () => {
  it('returns short summary with master + filled count', () => {
    const summary = renderSpecSummary(fullSpec);
    expect(summary).toContain('master=Protolabs Guide');
    expect(summary).toContain('aux=2');
    expect(summary).toContain('filled=8/8');
  });

  it('handles empty spec', () => {
    const empty = {
      ...fullSpec,
      master: null,
      aux: [],
      empty: ['title_formula', 'opening_pattern', 'body_structure', 'voice_tone', 'pronoun_usage', 'paragraph_rhythm', 'cta_strategy', 'link_strategy'],
    };
    const summary = renderSpecSummary(empty);
    expect(summary).toContain('master=(no master)');
    expect(summary).toContain('filled=0/8');
  });
});