// d3-scorer.test.ts — D3 composite scoring tests
// Tests: positionScore, rangeScore, scoreResults

import { describe, it, expect } from 'vitest';
import { scoreResults, D3_WEIGHTS, D3_RANGES } from '../d3-scorer.js';
import type { SerpResult } from '../../bridge/serp-crawler.js';
import type { LightProbe } from '../light-fetcher.js';

function serpResult(url: string, position: number, title = 'Test'): SerpResult {
  return { url, title, position, snippet: '' };
}

function probe(url: string, wordCount: number, h2Count: number, ok = true): LightProbe {
  return { url, ok, wordCount, h2Count, paragraphCount: 10, error: ok ? undefined : 'fail' };
}

describe('D3_WEIGHTS / D3_RANGES constants', () => {
  it('weights sum to 1.0 (locked-in C plan decision)', () => {
    expect(D3_WEIGHTS.position + D3_WEIGHTS.wordCount + D3_WEIGHTS.h2Count).toBeCloseTo(1.0, 5);
  });

  it('position has highest weight', () => {
    expect(D3_WEIGHTS.position).toBeGreaterThan(D3_WEIGHTS.wordCount);
    expect(D3_WEIGHTS.wordCount).toBeGreaterThan(D3_WEIGHTS.h2Count);
  });
});

describe('scoreResults — position-only scoring', () => {
  it('position 1 gets highest position score', () => {
    const results = [
      serpResult('https://a.com', 1),
      serpResult('https://b.com', 5),
    ];
    const probes: LightProbe[] = [];
    const scored = scoreResults(results, probes, 10);
    expect(scored[0].url).toBe('https://a.com');
    expect(scored[0].scoreBreakdown.position).toBeGreaterThan(scored[1].scoreBreakdown.position);
  });

  it('position score decreases logarithmically (1/log2(n+1))', () => {
    const probes: LightProbe[] = [];
    const scored1 = scoreResults([serpResult('a', 1)], probes, 10);
    const scored2 = scoreResults([serpResult('b', 7)], probes, 10);
    const scored3 = scoreResults([serpResult('c', 100)], probes, 10);
    expect(scored1[0].scoreBreakdown.position).toBeGreaterThan(scored2[0].scoreBreakdown.position);
    expect(scored2[0].scoreBreakdown.position).toBeGreaterThan(scored3[0].scoreBreakdown.position);
    // Verify exact formula at known points: 1/log2(2)=1, 1/log2(8)=1/3
    expect(scored1[0].scoreBreakdown.position).toBeCloseTo(1, 3);
    expect(scored2[0].scoreBreakdown.position).toBeCloseTo(1 / 3, 3);
  });
});

describe('scoreResults — word count scoring', () => {
  it('wordCount 1500 (mid-range) scores higher than 200 (too short)', () => {
    const probes = [probe('a', 1500, 8), probe('b', 200, 8)];
    const scored = scoreResults([serpResult('a', 1), serpResult('b', 1)], probes, 10);
    expect(scored[0].url).toBe('a');
    expect(scored[0].scoreBreakdown.wordCount).toBeCloseTo(1, 3);
    expect(scored[1].scoreBreakdown.wordCount).toBeLessThan(0.7); // too short penalized
  });

  it('wordCount 4000 (above max 3000) gets penalized but not zero', () => {
    const probes = [probe('a', 4000, 8)];
    const scored = scoreResults([serpResult('a', 1)], probes, 10);
    expect(scored[0].scoreBreakdown.wordCount).toBeGreaterThan(0);
    expect(scored[0].scoreBreakdown.wordCount).toBeLessThan(1);
  });

  it('wordCount 0 (probe failed) scores 0', () => {
    const probes = [probe('a', 0, 0, false)];
    const scored = scoreResults([serpResult('a', 1)], probes, 10);
    expect(scored[0].scoreBreakdown.wordCount).toBe(0);
    expect(scored[0].scoreBreakdown.h2Count).toBe(0);
  });
});

describe('scoreResults — composite + sort + topN', () => {
  it('sorts by composite score descending', () => {
    const results = [
      serpResult('low-everything', 10),
      serpResult('high-everything', 1),
      serpResult('mid', 5),
    ];
    const probes = [
      probe('low-everything', 100, 1),
      probe('high-everything', 2000, 8),
      probe('mid', 1500, 6),
    ];
    const scored = scoreResults(results, probes, 10);
    expect(scored[0].url).toBe('high-everything');
    expect(scored[0].score).toBeGreaterThan(scored[1].score);
    expect(scored[1].score).toBeGreaterThan(scored[2].score);
  });

  it('caps output at topN', () => {
    const results = Array.from({ length: 20 }, (_, i) => serpResult(`url${i}`, i + 1));
    const probes: LightProbe[] = [];
    const scored = scoreResults(results, probes, 5);
    expect(scored).toHaveLength(5);
  });

  it('returns topN by score, not topN by input order', () => {
    const results = [
      serpResult('bad-position-good-content', 100),
      serpResult('good-position-bad-content', 1),
    ];
    const probes = [
      probe('bad-position-good-content', 2500, 10),
      probe('good-position-bad-content', 50, 1),
    ];
    const scored = scoreResults(results, probes, 1);
    expect(scored).toHaveLength(1);
    // position weight is 0.5, content weight is 0.5
    // good-position-bad-content: 0.5*1 + 0.3*~0.06 + 0.2*~0.18 = ~0.55
    // bad-position-good-content: 0.5*~0.15 + 0.3*1 + 0.2*1 = ~0.65
    // bad-position-good-content should win on content even at position 100
    expect(scored[0].url).toBe('bad-position-good-content');
  });

  it('skips probes with ok=false', () => {
    const probes = [probe('a', 1500, 8, false)];
    const scored = scoreResults([serpResult('a', 1)], probes, 10);
    expect(scored[0].probe).toBeNull();
    expect(scored[0].scoreBreakdown.wordCount).toBe(0);
  });
});