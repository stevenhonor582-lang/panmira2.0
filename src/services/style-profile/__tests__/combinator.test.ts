// combinator.test.ts — W2 master+aux overlay logic tests

import { describe, it, expect } from 'vitest';
import { overlay, selectAux, SLOT_KEYS } from '../combinator.js';

describe('SLOT_KEYS', () => {
  it('contains exactly 8 style slots', () => {
    expect(SLOT_KEYS).toHaveLength(8);
    expect(SLOT_KEYS).toEqual([
      'title_formula',
      'opening_pattern',
      'body_structure',
      'voice_tone',
      'pronoun_usage',
      'paragraph_rhythm',
      'cta_strategy',
      'link_strategy',
    ]);
  });
});

describe('overlay', () => {
  it('master alone — all master slots used', () => {
    const master = {
      id: 'm1',
      slots: {
        title_formula: 'X vs Y',
        opening_pattern: 'Question hook',
        body_structure: '4-section',
        voice_tone: 'authoritative',
        pronoun_usage: 'we',
        paragraph_rhythm: 'short',
        cta_strategy: 'consult',
        link_strategy: 'inline',
      },
    };
    const result = overlay(master, []);
    expect(result.empty).toEqual([]);
    expect(Object.values(result.slotProvenance).every((p) => p === 'm1')).toBe(true);
  });

  it('master has empty slots, aux fills them', () => {
    const master = {
      id: 'm1',
      slots: {
        title_formula: 'X vs Y',
        // opening_pattern missing
        body_structure: '4-section',
        // voice_tone missing
      },
    };
    const aux = [{
      id: 'a1',
      slots: {
        opening_pattern: 'Data hook',
        voice_tone: 'casual',
      },
    }];
    const result = overlay(master, aux);
    expect(result.finalSlots.title_formula).toBe('X vs Y');
    expect(result.finalSlots.opening_pattern).toBe('Data hook');
    expect(result.finalSlots.voice_tone).toBe('casual');
    expect(result.slotProvenance.title_formula).toBe('m1');
    expect(result.slotProvenance.opening_pattern).toBe('a1');
    expect(result.slotProvenance.voice_tone).toBe('a1');
    expect(result.empty).toEqual(['pronoun_usage', 'paragraph_rhythm', 'cta_strategy', 'link_strategy']);
  });

  it('aux fills slots in order — first aux wins', () => {
    const master = { id: 'm', slots: {} };
    const aux = [
      { id: 'a1', slots: { opening_pattern: 'first' } },
      { id: 'a2', slots: { opening_pattern: 'second' } },
    ];
    const result = overlay(master, aux);
    expect(result.finalSlots.opening_pattern).toBe('first');
    expect(result.slotProvenance.opening_pattern).toBe('a1');
  });

  it('multiple aux — each fills different missing slots', () => {
    const master = { id: 'm', slots: { title_formula: 'X' } };
    const aux = [
      { id: 'a1', slots: { opening_pattern: 'A1-hook' } },
      { id: 'a2', slots: { body_structure: 'A2-structure' } },
      { id: 'a3', slots: { voice_tone: 'A3-tone' } },
    ];
    const result = overlay(master, aux);
    expect(result.finalSlots.title_formula).toBe('X');
    expect(result.finalSlots.opening_pattern).toBe('A1-hook');
    expect(result.finalSlots.body_structure).toBe('A2-structure');
    expect(result.finalSlots.voice_tone).toBe('A3-tone');
  });

  it('empty master + empty aux = all slots empty', () => {
    const result = overlay({ id: 'm', slots: {} }, []);
    expect(result.empty).toHaveLength(8);
    expect(Object.values(result.slotProvenance).every((p) => p === null)).toBe(true);
  });

  it('master covers everything, aux slots are ignored', () => {
    const master = {
      id: 'm',
      slots: {
        title_formula: 'M-title',
        opening_pattern: 'M-open',
      },
    };
    const aux = [{
      id: 'a',
      slots: {
        title_formula: 'A-title', // master wins
        voice_tone: 'A-tone', // master missing, aux fills
      },
    }];
    const result = overlay(master, aux);
    expect(result.finalSlots.title_formula).toBe('M-title');
    expect(result.finalSlots.opening_pattern).toBe('M-open');
    expect(result.finalSlots.voice_tone).toBe('A-tone');
    expect(result.slotProvenance.title_formula).toBe('m');
    expect(result.slotProvenance.voice_tone).toBe('a');
  });

  it('empty value string in master does NOT block aux from filling', () => {
    // Empty string is falsy — aux should fill it
    const master = { id: 'm', slots: { opening_pattern: '' } };
    const aux = [{ id: 'a', slots: { opening_pattern: 'filled' } }];
    const result = overlay(master, aux);
    expect(result.finalSlots.opening_pattern).toBe('filled');
    expect(result.slotProvenance.opening_pattern).toBe('a');
  });
});

describe('selectAux', () => {
  it('filters by threshold', () => {
    const candidates = [
      { score: 0.5, id: 'a' },
      { score: 0.2, id: 'b' },
      { score: 0.1, id: 'c' },
      { score: 0.05, id: 'd' },
    ];
    expect(selectAux(candidates, 0.15, 10)).toHaveLength(2);
    expect(selectAux(candidates, 0.15, 10).map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('caps at maxAux', () => {
    const candidates = Array.from({ length: 20 }, (_, i) => ({ score: 1.0, id: `c${i}` }));
    expect(selectAux(candidates, 0.1, 3)).toHaveLength(3);
  });

  it('returns empty when no candidates pass threshold', () => {
    expect(selectAux([{ score: 0.05, id: 'x' }], 0.15, 10)).toEqual([]);
  });

  it('respects threshold boundary inclusive', () => {
    expect(selectAux([{ score: 0.15, id: 'x' }], 0.15, 10)).toHaveLength(1);
    expect(selectAux([{ score: 0.149, id: 'x' }], 0.15, 10)).toEqual([]);
  });
});