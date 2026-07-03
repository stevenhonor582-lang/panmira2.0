// combinator.ts — pure W2 master+aux overlay logic
// Extracted from compositor.ts so it can be unit-tested without DB

import type { StyleSlots } from './types.js';

export const SLOT_KEYS: (keyof StyleSlots)[] = [
  'title_formula',
  'opening_pattern',
  'body_structure',
  'voice_tone',
  'pronoun_usage',
  'paragraph_rhythm',
  'cta_strategy',
  'link_strategy',
];

export interface CombinatorCandidate {
  id: string;
  slots: StyleSlots;
}

export interface CombinatorResult {
  finalSlots: StyleSlots;
  slotProvenance: Record<keyof StyleSlots, string | null>;
  empty: (keyof StyleSlots)[];
}

/** Master takes all slots, aux fills missing slots only */
export function overlay(master: CombinatorCandidate, aux: CombinatorCandidate[]): CombinatorResult {
  const finalSlots = { ...master.slots } as StyleSlots;
  const slotProvenance = Object.fromEntries(
    SLOT_KEYS.map((k) => [k, master.slots[k] ? master.id : null]),
  ) as Record<keyof StyleSlots, string | null>;

  for (const a of aux) {
    for (const key of SLOT_KEYS) {
      if (!finalSlots[key] && a.slots[key]) {
        finalSlots[key] = a.slots[key];
        slotProvenance[key] = a.id;
      }
    }
  }

  const empty = SLOT_KEYS.filter((k) => !finalSlots[k]);
  return { finalSlots, slotProvenance, empty };
}

/** Filter aux candidates: score >= threshold, capped at maxAux */
export function selectAux<T extends { score: number }>(candidates: T[], threshold: number, maxAux: number): T[] {
  return candidates.filter((c) => c.score >= threshold).slice(0, maxAux);
}