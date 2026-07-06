// style-spec-builder.test.ts — buildStyleSpecForWriting() with mocked DB
// Uses vi.mock to swap out the real pool for an in-memory fake

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the pool BEFORE importing modules that use it
const fakeRows: Array<{
  id: string;
  name: string;
  topic_tags: string[];
  reader_tags: string[];
  slots: Record<string, string>;
  source_url: string | null;
  derived_from: string | null;
}> = [];

vi.mock('../../../db/index.js', () => ({
  pool: {
    query: vi.fn(async (sql: string) => {
      if (sql.includes('SELECT') && sql.includes('style_profiles')) {
        return { rows: fakeRows };
      }
      return { rows: [] };
    }),
  },
}));

import { buildStyleSpecForWriting } from '../style-spec-builder.js';

beforeEach(() => {
  fakeRows.length = 0;
});

describe('buildStyleSpecForWriting — empty DB', () => {
  it('returns null master + empty slots when no candidates', async () => {
    const result = await buildStyleSpecForWriting({
      topic: 'random topic',
      reader: 'random reader',
    });
    expect(result.spec.master).toBeNull();
    expect(result.spec.aux).toEqual([]);
    expect(result.spec.empty).toHaveLength(8);
    expect(result.promptFragment).toContain('StyleSpec');
    expect(result.summary).toContain('master=(no master)');
  });
});

describe('buildStyleSpecForWriting — single master', () => {
  it('returns 1 master + 0 aux when only 1 candidate', async () => {
    fakeRows.push({
      id: 'p1',
      name: 'Protolabs Guide',
      topic_tags: ['mjf', 'fdm', '3d_printing'],
      reader_tags: ['rnd_engineer'],
      slots: {
        title_formula: 'X vs Y',
        opening_pattern: 'Question hook',
      },
      source_url: 'https://protolabs.com/x',
      derived_from: 'auto_serp',
    });
    const result = await buildStyleSpecForWriting({
      topic: 'MJF vs FDM',
      reader: 'engineer',
    });
    expect(result.spec.master?.id).toBe('p1');
    expect(result.spec.aux).toEqual([]);
    expect(result.spec.slots.title_formula).toBe('X vs Y');
  });
});

describe('buildStyleSpecForWriting — master + aux composition', () => {
  it('master takes all slots, aux fills missing', async () => {
    fakeRows.push(
      {
        id: 'p1',
        name: 'Master Guide',
        topic_tags: ['mjf', 'fdm'],
        reader_tags: ['rnd_engineer'],
        slots: {
          title_formula: 'M1-title',
          opening_pattern: 'M1-hook',
        },
        source_url: 'https://a.com',
        derived_from: 'auto_serp',
      },
      {
        id: 'p2',
        name: 'Aux Guide',
        topic_tags: ['mjf'],
        reader_tags: ['rnd_engineer'],
        slots: {
          body_structure: 'A2-structure',
          voice_tone: 'A2-tone',
        },
        source_url: 'https://b.com',
        derived_from: 'auto_serp',
      },
    );
    const result = await buildStyleSpecForWriting({
      topic: 'MJF vs FDM',
      reader: 'engineer',
    });
    expect(result.spec.master?.id).toBe('p1');
    expect(result.spec.aux).toHaveLength(1);
    expect(result.spec.slots.title_formula).toBe('M1-title');
    expect(result.spec.slots.body_structure).toBe('A2-structure');
    expect(result.spec.empty).toEqual(['pronoun_usage', 'paragraph_rhythm', 'cta_strategy', 'link_strategy']);
  });
});

describe('buildStyleSpecForWriting — prompt fragment contract', () => {
  it('promptFragment is ready to inject into LLM system_prompt', async () => {
    fakeRows.push({
      id: 'p1',
      name: 'Test Guide',
      topic_tags: ['mjf'],
      reader_tags: ['engineer'],
      slots: { title_formula: 'X vs Y' },
      source_url: 'https://a.com',
      derived_from: 'auto_serp',
    });
    const { promptFragment } = await buildStyleSpecForWriting({
      topic: 'MJF',
      reader: 'engineer',
    });
    // Markdown by default
    expect(promptFragment).toContain('## 风格规范');
    expect(promptFragment).toContain('**硬约束**');
    // Topic + reader
    expect(promptFragment).toContain('MJF');
    expect(promptFragment).toContain('engineer');
    // Master name
    expect(promptFragment).toContain('Test Guide');
  });

  it('plain text mode produces no markdown', async () => {
    fakeRows.push({
      id: 'p1',
      name: 'Test',
      topic_tags: ['mjf'],
      reader_tags: ['engineer'],
      slots: { title_formula: 'X' },
      source_url: 'https://a.com',
      derived_from: 'auto_serp',
    });
    const { promptFragment } = await buildStyleSpecForWriting({
      topic: 'MJF',
      reader: 'engineer',
      markdown: false,
    });
    expect(promptFragment).not.toContain('##');
    expect(promptFragment).not.toContain('**');
  });
});

describe('buildStyleSpecForWriting — pinning', () => {
  it('pinProfileIds forces a profile to score 1.0', async () => {
    fakeRows.push(
      {
        id: 'p1',
        name: 'Low Score Guide',
        topic_tags: ['unrelated'],
        reader_tags: ['unrelated'],
        slots: { title_formula: 'low' },
        source_url: 'https://a.com',
        derived_from: 'auto_serp',
      },
      {
        id: 'p2',
        name: 'Pinned Guide',
        topic_tags: ['mjf'],
        reader_tags: ['engineer'],
        slots: { opening_pattern: 'pinned-hook' },
        source_url: 'https://b.com',
        derived_from: 'auto_serp',
      },
    );
    const result = await buildStyleSpecForWriting({
      topic: 'MJF',
      reader: 'engineer',
      pinProfileIds: ['p2'],
    });
    // p2 should be the master (score forced to 1.0)
    expect(result.spec.master?.id).toBe('p2');
    expect(result.spec.slots.opening_pattern).toBe('pinned-hook');
  });
});

describe('buildStyleSpecForWriting — summary', () => {
  it('summary includes master + filled count', async () => {
    fakeRows.push({
      id: 'p1',
      name: 'Protolabs',
      topic_tags: ['mjf'],
      reader_tags: ['engineer'],
      slots: {
        title_formula: 'X',
        opening_pattern: 'Y',
        body_structure: 'Z',
        voice_tone: 'T',
        pronoun_usage: 'U',
        paragraph_rhythm: 'V',
        cta_strategy: 'W',
        link_strategy: 'L',
      },
      source_url: 'https://a.com',
      derived_from: 'auto_serp',
    });
    const { summary } = await buildStyleSpecForWriting({
      topic: 'MJF',
      reader: 'engineer',
    });
    expect(summary).toContain('master=Protolabs');
    expect(summary).toContain('aux=0');
    expect(summary).toContain('filled=8/8');
  });
});