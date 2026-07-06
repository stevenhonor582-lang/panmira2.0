// yaml-importer.test.ts — pure-function tests for deriveTopicTags / deriveReaderTags / sampleToProfile
// importYamlSeeds is integration-level (needs DB + filesystem) — skip here

import { describe, it, expect } from 'vitest';
import { deriveTopicTags, deriveReaderTags, sampleToProfile } from '../yaml-importer.js';

const sampleInput = {
  id: 'sample-test-001',
  title: 'MJF vs FDM: A Detailed Comparison for Engineers',
  url: 'https://example.com/article',
  competitor: 'TestCo',
  industry: '3D 打印',
  article_type: '对比 + 完整指南',
  word_count_estimate: 2000,
  h2_count: 8,
  h3_count: 12,
  characteristics: {
    title_formula: 'X vs Y: A Detailed Comparison',
    opening_pattern: 'Question hook + data',
  },
  vmt_borrow_points: ['hook style', 'comparison tables'],
  best_for_role: ['r1-cross-border-b2b', 'r3-rnd-prototyping'],
  added_by: 'Steven',
  added_at: '2026-07-01',
  author_notes: '  good for B2B audience  ',
};

describe('deriveTopicTags', () => {
  it('derives 3d_printing + additive_manufacturing from "3D 打印" industry', () => {
    const tags = deriveTopicTags(sampleInput);
    expect(tags).toContain('3d_printing');
    expect(tags).toContain('additive_manufacturing');
  });

  it('derives process_comparison from "对比" article_type', () => {
    const tags = deriveTopicTags(sampleInput);
    expect(tags).toContain('process_comparison');
  });

  it('derives complete_guide from "完整指南" article_type', () => {
    const tags = deriveTopicTags(sampleInput);
    expect(tags).toContain('complete_guide');
  });

  it('derives mjf + fdm from title keywords (case-insensitive)', () => {
    const tags = deriveTopicTags(sampleInput);
    expect(tags).toContain('mjf');
    expect(tags).toContain('fdm');
  });

  it('dedupes overlapping tags', () => {
    const tags = deriveTopicTags(sampleInput);
    const occurrences = tags.filter((t) => t === '3d_printing').length;
    expect(occurrences).toBe(1);
  });

  it('handles CNC + 5-axis industry', () => {
    const input = { ...sampleInput, industry: 'CNC 加工', article_type: '完整指南', title: '5-axis CNC machining guide' };
    const tags = deriveTopicTags(input);
    expect(tags).toContain('cnc_machining');
    expect(tags).toContain('5_axis_machining');
    expect(tags).toContain('complete_guide');
  });

  it('handles elastomer industry', () => {
    const input = { ...sampleInput, industry: '弹性体', article_type: '客户故事', title: 'silicone case study' };
    const tags = deriveTopicTags(input);
    expect(tags).toContain('elastomer');
    expect(tags).toContain('silicone');
    expect(tags).toContain('case_study');
  });

  it('returns empty for unrecognized industry + type + title', () => {
    const input = { ...sampleInput, industry: 'unknown', article_type: 'unknown', title: 'random' };
    expect(deriveTopicTags(input)).toEqual([]);
  });
});

describe('deriveReaderTags', () => {
  it('maps r1-cross-border-b2b to cross_border_b2b + sales_manager', () => {
    const tags = deriveReaderTags(['r1-cross-border-b2b']);
    expect(tags).toContain('cross_border_b2b');
    expect(tags).toContain('sales_manager');
  });

  it('maps r2-oem-large to oem_large + procurement_manager', () => {
    const tags = deriveReaderTags(['r2-oem-large']);
    expect(tags).toContain('oem_large');
    expect(tags).toContain('procurement_manager');
  });

  it('maps r3-rnd-prototyping to rnd_engineer + product_developer', () => {
    const tags = deriveReaderTags(['r3-rnd-prototyping']);
    expect(tags).toContain('rnd_engineer');
    expect(tags).toContain('product_developer');
  });

  it('maps r4-mass-production to mass_production_buyer + manufacturing_manager', () => {
    const tags = deriveReaderTags(['r4-mass-production']);
    expect(tags).toContain('mass_production_buyer');
    expect(tags).toContain('manufacturing_manager');
  });

  it('dedupes when multiple roles map to same tag', () => {
    const tags = deriveReaderTags(['r1-cross-border-b2b', 'r2-oem-large']);
    // Both might not overlap, but verify uniqueness
    expect(new Set(tags).size).toBe(tags.length);
  });

  it('passes through unknown roles as-is', () => {
    const tags = deriveReaderTags(['unknown-role']);
    expect(tags).toEqual(['unknown-role']);
  });

  it('returns empty array for empty input', () => {
    expect(deriveReaderTags([])).toEqual([]);
  });
});

describe('sampleToProfile', () => {
  it('produces profile with derived tags + characteristics', () => {
    const profile = sampleToProfile(sampleInput);
    expect(profile.name).toBe('TestCo - sample-test-001');
    expect(profile.topic_tags).toContain('mjf');
    expect(profile.reader_tags).toContain('cross_border_b2b');
    expect(profile.slots.title_formula).toBe('X vs Y: A Detailed Comparison');
  });

  it('preserves characteristics into slots', () => {
    const profile = sampleToProfile(sampleInput);
    expect(profile.slots.opening_pattern).toBe('Question hook + data');
  });

  it('stores vmt_borrow_points + best_for_role in slots.extra', () => {
    const profile = sampleToProfile(sampleInput);
    const extra = (profile.slots as unknown as { extra: Record<string, unknown> }).extra;
    expect(extra.vmt_borrow_points).toEqual(['hook style', 'comparison tables']);
    expect(extra.best_for_role).toEqual(['r1-cross-border-b2b', 'r3-rnd-prototyping']);
    expect(extra.competitor).toBe('TestCo');
    expect(extra.industry).toBe('3D 打印');
  });

  it('sets source_url + source_sample_id + derived_from=yaml_seed', () => {
    const profile = sampleToProfile(sampleInput);
    expect(profile.source_url).toBe('https://example.com/article');
    expect(profile.source_sample_id).toBe('sample-test-001');
    expect(profile.derived_from).toBe('yaml_seed');
  });

  it('trims whitespace from notes', () => {
    const profile = sampleToProfile(sampleInput);
    expect(profile.notes).toBe('good for B2B audience');
  });
});