// extractor-parse.ts — pure JSON parsing + normalization for extractor
// Extracted from extractor.ts so it's testable without HTTP / API

import type { FetcherResult, StyleProfile, StyleSlots } from './types.js';

const SLOT_KEYS: (keyof StyleSlots)[] = [
  'title_formula',
  'opening_pattern',
  'body_structure',
  'voice_tone',
  'pronoun_usage',
  'paragraph_rhythm',
  'cta_strategy',
  'link_strategy',
];

/** Parse LLM response text into raw JSON object. Handles ```json fences. */
export function parseLLMJson(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
    if (match) return JSON.parse(match[1]);
    throw new Error(`Failed to parse LLM JSON: ${content.slice(0, 300)}`);
  }
}

/** Normalize raw LLM JSON into a clean StyleProfile. Defensive against bad input. */
export function normalizeProfile(raw: unknown, fetched: FetcherResult): StyleProfile {
  const obj = raw as Record<string, unknown> | null;
  const safe = obj ?? {};

  const slots: StyleSlots = {};
  for (const k of SLOT_KEYS) {
    const v = safe[k];
    if (typeof v === 'string' && v.trim()) slots[k] = v.trim();
  }

  const topicTags = Array.isArray(safe.topic_tags)
    ? (safe.topic_tags as unknown[]).map((t) => (t == null ? '' : String(t).toLowerCase())).filter((t) => t.length > 0).slice(0, 8)
    : [];
  const readerTags = Array.isArray(safe.reader_tags)
    ? (safe.reader_tags as unknown[]).map((t) => (t == null ? '' : String(t).toLowerCase())).filter((t) => t.length > 0).slice(0, 6)
    : [];

  const name = String(safe.name ?? fetched.title).slice(0, 200);

  return {
    name,
    topic_tags: topicTags,
    reader_tags: readerTags,
    slots,
    source_url: fetched.url,
  };
}

/** Convenience: parse LLM content + normalize into StyleProfile */
export function parseAndNormalize(content: string, fetched: FetcherResult): StyleProfile {
  const raw = parseLLMJson(content);
  return normalizeProfile(raw, fetched);
}