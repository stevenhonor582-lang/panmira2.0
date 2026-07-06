// compositor.ts — W2 主辅叠加组合器
// Input: topic + reader → derive query tags
// Process: query DB → score profiles → pick 1 master + N aux → combine slots
// Output: StyleSpec with 8 slot values + provenance (which profile each slot came from)

import { pool } from '../../db/index.js';
import { extractQueryTags, weightedTagScore, jaccard } from './tag-similarity.js';
import type { StyleSlots } from './types.js';

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

export interface CompositorOptions {
  topic: string;
  reader: string;
  auxThreshold?: number;  // Jaccard ≥ this to qualify as aux candidate
  maxAux?: number;        // max aux profiles to pick
  /** Optional explicit style_profile IDs to include (operator override) */
  pinProfileIds?: string[];
}

export interface ProfileMatch {
  id: string;
  name: string;
  topicTags: string[];
  readerTags: string[];
  slots: StyleSlots;
  score: number;
  sourceUrl: string | null;
  derivedFrom: string | null;
  hitCount: number;
}

export interface StyleSpec {
  topic: string;
  reader: string;
  queryTags: { topic: string[]; reader: string[] };
  master: ProfileMatch | null;
  aux: ProfileMatch[];
  slots: StyleSlots;
  slotProvenance: Record<keyof StyleSlots, string | null>;
  empty: (keyof StyleSlots)[];
}

async function loadCandidates(opts: CompositorOptions, queryTopic: string[], queryReader: string[]): Promise<ProfileMatch[]> {
  // Load all active profiles (hit_count will be added in task 8)
  const { rows } = await pool.query(`
    SELECT id, name, topic_tags, reader_tags, slots, source_url, derived_from
    FROM style_profiles
    WHERE is_active = true
  `);

  const matches: ProfileMatch[] = rows.map((r: {
    id: string;
    name: string;
    topic_tags: string[];
    reader_tags: string[];
    slots: StyleSlots;
    source_url: string | null;
    derived_from: string | null;
  }) => ({
    id: r.id,
    name: r.name,
    topicTags: r.topic_tags || [],
    readerTags: r.reader_tags || [],
    slots: r.slots || {},
    score: weightedTagScore(queryTopic, queryReader, r.topic_tags || [], r.reader_tags || []),
    sourceUrl: r.source_url,
    derivedFrom: r.derived_from,
    hitCount: 0,  // placeholder until task 8
  }));

  // Boost pinned profiles (operator override)
  if (opts.pinProfileIds?.length) {
    for (const m of matches) {
      if (opts.pinProfileIds.includes(m.id)) m.score = Math.max(m.score, 1.0);
    }
  }

  matches.sort((a, b) => b.score - a.score);
  return matches;
}

export async function compose(opts: CompositorOptions): Promise<StyleSpec> {
  const auxThreshold = opts.auxThreshold ?? 0.15;
  const maxAux = opts.maxAux ?? 3;

  const { topicTags: queryTopic, readerTags: queryReader } = extractQueryTags(opts.topic, opts.reader);
  const candidates = await loadCandidates(opts, queryTopic, queryReader);

  if (candidates.length === 0) {
    return {
      topic: opts.topic,
      reader: opts.reader,
      queryTags: { topic: queryTopic, reader: queryReader },
      master: null,
      aux: [],
      slots: {},
      slotProvenance: Object.fromEntries(SLOT_KEYS.map((k) => [k, null])) as Record<keyof StyleSlots, string | null>,
      empty: [...SLOT_KEYS],
    };
  }

  // 1 master = top 1
  const master = candidates[0];

  // N aux = next candidates with score >= threshold, capped at maxAux
  const aux = candidates.slice(1).filter((c) => c.score >= auxThreshold).slice(0, maxAux);

  // Compose slots: master takes all, aux fills only missing
  const finalSlots = { ...master.slots } as StyleSlots;
  const finalProvenance = Object.fromEntries(
    SLOT_KEYS.map((k) => [k, master.slots[k] ? master.id : null]),
  ) as Record<keyof StyleSlots, string | null>;

  for (const a of aux) {
    for (const key of SLOT_KEYS) {
      if (!finalSlots[key] && a.slots[key]) {
        finalSlots[key] = a.slots[key];
        finalProvenance[key] = a.id;
      }
    }
  }

  const empty = SLOT_KEYS.filter((k) => !finalSlots[k]);

  return {
    topic: opts.topic,
    reader: opts.reader,
    queryTags: { topic: queryTopic, reader: queryReader },
    master,
    aux,
    slots: finalSlots,
    slotProvenance: finalProvenance,
    empty,
  };
}