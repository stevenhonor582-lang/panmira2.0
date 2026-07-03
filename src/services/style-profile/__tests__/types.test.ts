// types.test.ts — type guard helpers for StyleSlots / StyleProfile

import { describe, it, expect } from 'vitest';
import type { StyleSlots, StyleProfile, FetcherResult } from '../types.js';

describe('StyleSlots structure', () => {
  it('has 8 optional keys', () => {
    const slots: StyleSlots = {};
    expect(Object.keys(slots)).toHaveLength(0);
  });

  it('can be partially filled', () => {
    const slots: StyleSlots = {
      title_formula: 'X vs Y',
      opening_pattern: 'Question hook',
    };
    expect(slots.title_formula).toBe('X vs Y');
    expect(slots.body_structure).toBeUndefined();
  });

  it('all 8 keys are recognized', () => {
    const slots: StyleSlots = {
      title_formula: 'a',
      opening_pattern: 'b',
      body_structure: 'c',
      voice_tone: 'd',
      pronoun_usage: 'e',
      paragraph_rhythm: 'f',
      cta_strategy: 'g',
      link_strategy: 'h',
    };
    expect(Object.keys(slots)).toHaveLength(8);
  });
});

describe('StyleProfile structure', () => {
  it('can construct minimal profile with required fields only', () => {
    const profile: StyleProfile = {
      name: 'Test',
      topic_tags: ['mjf'],
      reader_tags: ['rnd_engineer'],
      slots: { title_formula: 'X' },
      source_url: 'https://example.com',
    };
    expect(profile.name).toBe('Test');
    expect(profile.derived_from).toBeUndefined();
    expect(profile.source_sample_id).toBeUndefined();
    expect(profile.notes).toBeUndefined();
  });

  it('supports optional derived_from / source_sample_id / notes', () => {
    const profile: StyleProfile = {
      name: 'Test',
      topic_tags: [],
      reader_tags: [],
      slots: {},
      source_url: 'https://example.com',
      derived_from: 'yaml_seed',
      source_sample_id: 'sample-001',
      notes: 'good for B2B',
    };
    expect(profile.derived_from).toBe('yaml_seed');
    expect(profile.source_sample_id).toBe('sample-001');
    expect(profile.notes).toBe('good for B2B');
  });
});

describe('FetcherResult structure', () => {
  it('contains all extraction fields', () => {
    const result: FetcherResult = {
      url: 'https://example.com',
      title: 'Test',
      h1List: ['H1'],
      h2List: ['H2-1', 'H2-2'],
      h3List: [],
      paragraphs: ['p1', 'p2'],
      wordCount: 1500,
      ctaSnippets: ['Contact us'],
    };
    expect(result.h2List).toHaveLength(2);
    expect(result.wordCount).toBe(1500);
  });
});