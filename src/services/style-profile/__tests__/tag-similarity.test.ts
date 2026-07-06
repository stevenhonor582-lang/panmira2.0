// tag-similarity.test.ts — pure-function tests for jaccard / weightedTagScore / extractQueryTags
// No external deps; can run without DB

import { describe, it, expect } from 'vitest';
import { jaccard, weightedTagScore, extractQueryTags } from '../tag-similarity.js';

describe('jaccard', () => {
  it('returns 0 for two empty sets', () => {
    expect(jaccard([], [])).toBe(0);
  });

  it('returns 1 for identical sets', () => {
    expect(jaccard(['a', 'b'], ['a', 'b'])).toBe(1);
    expect(jaccard(['MJF'], ['mjf'])).toBe(1); // case-insensitive
  });

  it('returns 0 for disjoint sets', () => {
    expect(jaccard(['a'], ['b'])).toBe(0);
  });

  it('returns intersection/union for partial overlap', () => {
    // {a,b} ∩ {b,c} = {b} → 1
    // {a,b} ∪ {b,c} = {a,b,c} → 3
    expect(jaccard(['a', 'b'], ['b', 'c'])).toBeCloseTo(1 / 3, 5);
  });

  it('is case-insensitive', () => {
    expect(jaccard(['MJF', 'FDM'], ['mjf', 'fdm'])).toBe(1);
    expect(jaccard(['MJF'], ['fdm'])).toBe(0);
  });

  it('handles duplicate tags in one input as a single set element', () => {
    expect(jaccard(['a', 'a', 'b'], ['a', 'b'])).toBe(1);
  });
});

describe('weightedTagScore', () => {
  it('uses default 0.6 topic + 0.4 reader weights', () => {
    // topic: {mjf} ∩ {mjf, fdm} = 1/2 = 0.5
    // reader: {engineer} ∩ {} = 0
    // score = 0.6 * 0.5 + 0.4 * 0 = 0.3
    expect(weightedTagScore(['mjf'], ['engineer'], ['mjf', 'fdm'], [])).toBeCloseTo(0.3, 5);
  });

  it('respects custom weights', () => {
    // topic 0, reader 1, custom {0.2, 0.8}
    // topic: 0
    // reader: {a} ∩ {a} = 1
    // score = 0.2 * 0 + 0.8 * 1 = 0.8
    expect(weightedTagScore(['x'], ['a'], ['y'], ['a'], { topic: 0.2, reader: 0.8 })).toBeCloseTo(0.8, 5);
  });

  it('returns 0 when both topic and reader sets are empty', () => {
    expect(weightedTagScore([], [], [], [])).toBe(0);
  });
});

describe('extractQueryTags', () => {
  it('extracts mjf + fdm + process_comparison from MJF vs FDM query', () => {
    const { topicTags, readerTags } = extractQueryTags('MJF vs FDM 3D printing', 'engineer');
    expect(topicTags).toContain('mjf');
    expect(topicTags).toContain('fdm');
    expect(topicTags).toContain('process_comparison');
    expect(topicTags).toContain('3d_printing');
  });

  it('extracts cnc_machining + 5_axis_machining from 5-axis query', () => {
    const { topicTags } = extractQueryTags('5-axis CNC machining guide', '');
    expect(topicTags).toContain('cnc_machining');
    expect(topicTags).toContain('5_axis_machining');
    expect(topicTags).toContain('complete_guide');
  });

  it('extracts injection_molding from injection query', () => {
    const { topicTags } = extractQueryTags('injection molding case study', '');
    expect(topicTags).toContain('injection_molding');
    expect(topicTags).toContain('case_study');
  });

  it('extracts reader tags for procurement manager', () => {
    const { readerTags } = extractQueryTags('', 'procurement manager buyer');
    expect(readerTags).toContain('procurement_manager');
  });

  it('extracts multiple reader tags for cross-border sales', () => {
    const { readerTags } = extractQueryTags('', 'cross-border B2B sales');
    expect(readerTags).toContain('cross_border_b2b');
    expect(readerTags).toContain('sales_manager');
  });

  it('dedupes topic tags within a single query', () => {
    // "machining" appears in both cnc and standalone; should dedupe
    const { topicTags } = extractQueryTags('CNC machining services', '');
    const occurrences = topicTags.filter((t) => t === 'cnc_machining').length;
    expect(occurrences).toBe(1);
  });

  it('returns empty arrays for unrecognized inputs', () => {
    const { topicTags, readerTags } = extractQueryTags('random unrelated stuff', 'unknown role');
    expect(topicTags).toEqual([]);
    expect(readerTags).toEqual([]);
  });

  it('matches Chinese keywords (增材/加工中心/注塑)', () => {
    const { topicTags } = extractQueryTags('增材制造 加工中心 指南', '');
    expect(topicTags).toContain('3d_printing');
    expect(topicTags).toContain('cnc_machining');
  });

  it('matches Chinese reader roles (采购/工程师/销售)', () => {
    const { readerTags } = extractQueryTags('', '采购经理 工程师 跨境销售');
    expect(readerTags).toContain('procurement_manager');
    expect(readerTags).toContain('manufacturing_manager');
    expect(readerTags).toContain('rnd_engineer');
    expect(readerTags).toContain('cross_border_b2b');
  });
});