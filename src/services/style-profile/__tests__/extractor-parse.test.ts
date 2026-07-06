// extractor-parse.test.ts — LLM response parsing + profile normalization

import { describe, it, expect } from 'vitest';
import { parseLLMJson, normalizeProfile, parseAndNormalize } from '../extractor-parse.js';
import type { FetcherResult } from '../types.js';

const fetched: FetcherResult = {
  url: 'https://example.com/article',
  title: 'MJF vs FDM Comparison',
  h1List: ['H1'],
  h2List: ['H2-1', 'H2-2'],
  h3List: [],
  paragraphs: ['p1', 'p2'],
  wordCount: 1500,
  ctaSnippets: [],
};

describe('parseLLMJson', () => {
  it('parses clean JSON', () => {
    const out = parseLLMJson('{"title_formula":"X vs Y"}');
    expect(out).toEqual({ title_formula: 'X vs Y' });
  });

  it('parses JSON wrapped in ```json fences', () => {
    const content = '```json\n{"title_formula":"X vs Y"}\n```';
    const out = parseLLMJson(content);
    expect(out).toEqual({ title_formula: 'X vs Y' });
  });

  it('parses JSON wrapped in ``` fences (no language tag)', () => {
    const content = '```\n{"a":1}\n```';
    const out = parseLLMJson(content);
    expect(out).toEqual({ a: 1 });
  });

  it('handles extra whitespace + newlines in fences', () => {
    const content = '```json\n\n  {"x":1}  \n\n```';
    const out = parseLLMJson(content);
    expect(out).toEqual({ x: 1 });
  });

  it('throws on garbage input', () => {
    expect(() => parseLLMJson('not json at all')).toThrow();
  });

  it('throws on partial JSON (missing closing brace)', () => {
    expect(() => parseLLMJson('{"a":1')).toThrow();
  });

  it('prefers direct parse over fence fallback', () => {
    // Valid JSON with curly braces should be parsed directly, not regex-matched
    const content = '{"a":1, "b":"x}"}'; // } inside string
    const out = parseLLMJson(content);
    expect(out).toEqual({ a: 1, b: 'x}' });
  });
});

describe('normalizeProfile — valid input', () => {
  it('produces all 8 slots when LLM returns complete JSON', () => {
    const raw = {
      name: 'Protolabs Guide',
      title_formula: 'X vs Y',
      opening_pattern: 'Question hook',
      body_structure: '4-section',
      voice_tone: 'authoritative',
      pronoun_usage: 'we',
      paragraph_rhythm: 'short',
      cta_strategy: 'consult',
      link_strategy: 'inline',
      topic_tags: ['mjf', 'fdm', '3d_printing'],
      reader_tags: ['engineer', 'procurement_manager'],
    };
    const profile = normalizeProfile(raw, fetched);
    expect(profile.name).toBe('Protolabs Guide');
    expect(profile.slots.title_formula).toBe('X vs Y');
    expect(profile.topic_tags).toEqual(['mjf', 'fdm', '3d_printing']);
    expect(profile.reader_tags).toEqual(['engineer', 'procurement_manager']);
    expect(profile.source_url).toBe('https://example.com/article');
  });

  it('lowercases all topic/reader tags', () => {
    const raw = {
      topic_tags: ['MJF', 'FDM', '3D_Printing'],
      reader_tags: ['Engineer', 'Buyer'],
    };
    const profile = normalizeProfile(raw, fetched);
    expect(profile.topic_tags).toEqual(['mjf', 'fdm', '3d_printing']);
    expect(profile.reader_tags).toEqual(['engineer', 'buyer']);
  });

  it('caps topic_tags at 8, reader_tags at 6', () => {
    const raw = {
      topic_tags: Array.from({ length: 20 }, (_, i) => `t${i}`),
      reader_tags: Array.from({ length: 20 }, (_, i) => `r${i}`),
    };
    const profile = normalizeProfile(raw, fetched);
    expect(profile.topic_tags).toHaveLength(8);
    expect(profile.reader_tags).toHaveLength(6);
  });

  it('truncates name to 200 chars', () => {
    const longName = 'a'.repeat(500);
    const raw = { name: longName };
    const profile = normalizeProfile(raw, fetched);
    expect(profile.name).toHaveLength(200);
  });

  it('falls back to fetched.title when name is missing', () => {
    const profile = normalizeProfile({}, fetched);
    expect(profile.name).toBe('MJF vs FDM Comparison');
  });
});

describe('normalizeProfile — defensive against bad input', () => {
  it('handles null input', () => {
    const profile = normalizeProfile(null, fetched);
    expect(profile.slots).toEqual({});
    expect(profile.topic_tags).toEqual([]);
    expect(profile.name).toBe('MJF vs FDM Comparison');
  });

  it('handles non-array topic_tags', () => {
    const profile = normalizeProfile({ topic_tags: 'not an array' }, fetched);
    expect(profile.topic_tags).toEqual([]);
  });

  it('handles mixed-type array in topic_tags (number → string)', () => {
    const profile = normalizeProfile({ topic_tags: ['a', 1, null, 'b'] }, fetched);
    expect(profile.topic_tags).toEqual(['a', '1', 'b']);
  });

  it('skips empty string slot values', () => {
    const raw = {
      title_formula: '',
      opening_pattern: '  ', // whitespace-only
      body_structure: '4-section',
    };
    const profile = normalizeProfile(raw, fetched);
    expect(profile.slots.title_formula).toBeUndefined();
    expect(profile.slots.opening_pattern).toBeUndefined();
    expect(profile.slots.body_structure).toBe('4-section');
  });

  it('skips non-string slot values', () => {
    const raw = {
      title_formula: 123,
      opening_pattern: null,
      body_structure: ['array', 'not', 'string'],
    };
    const profile = normalizeProfile(raw, fetched);
    expect(profile.slots.title_formula).toBeUndefined();
    expect(profile.slots.opening_pattern).toBeUndefined();
    expect(profile.slots.body_structure).toBeUndefined();
  });

  it('trims whitespace from slot values', () => {
    const raw = { title_formula: '  X vs Y  ' };
    const profile = normalizeProfile(raw, fetched);
    expect(profile.slots.title_formula).toBe('X vs Y');
  });
});

describe('parseAndNormalize — end-to-end', () => {
  it('parses clean JSON → full profile', () => {
    const content = JSON.stringify({
      name: 'Test',
      title_formula: 'X vs Y',
      opening_pattern: 'hook',
      body_structure: '4-section',
      voice_tone: 'pro',
      pronoun_usage: 'you',
      paragraph_rhythm: 'short',
      cta_strategy: 'consult',
      link_strategy: 'inline',
      topic_tags: ['mjf'],
      reader_tags: ['engineer'],
    });
    const profile = parseAndNormalize(content, fetched);
    expect(profile.name).toBe('Test');
    expect(profile.slots.title_formula).toBe('X vs Y');
    expect(profile.topic_tags).toEqual(['mjf']);
  });

  it('parses fenced JSON → full profile', () => {
    const content = '```json\n' + JSON.stringify({ name: 'Fenced', title_formula: 'X' }) + '\n```';
    const profile = parseAndNormalize(content, fetched);
    expect(profile.name).toBe('Fenced');
    expect(profile.slots.title_formula).toBe('X');
  });

  it('throws on garbage content', () => {
    expect(() => parseAndNormalize('garbage', fetched)).toThrow();
  });
});