// d3-scorer.ts — D3 composite scoring: position + word count + h2 count
// Returns 0-1 score; higher = better reference candidate

import type { SerpResult } from '../../bridge/serp-crawler.js';
import type { LightProbe } from './light-fetcher.js';

/** D3 weights — locked in C plan decision */
export const D3_WEIGHTS = {
  position: 0.5,
  wordCount: 0.3,
  h2Count: 0.2,
} as const;

/** Ideal ranges for normalization (from VMT reference samples analysis) */
export const D3_RANGES = {
  /** Sweet spot 800-3000 words (Protolabs=1800, WayKen=2800, RapidDirect=3200) */
  wordCount: { min: 800, max: 3000 },
  /** Sweet spot 4-12 H2 sections (Protolabs=9, WayKen=13, RapidDirect=6) */
  h2Count: { min: 4, max: 12 },
} as const;

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

/** 0-1 score: 1.0 at position 1, decreases logarithmically */
function positionScore(position: number): number {
  return 1 / Math.log2(position + 1);
}

/** 0-1 score: 1.0 within ideal range, falls off outside */
function rangeScore(value: number, min: number, max: number): number {
  if (value < min) {
    // Penalize too-short proportionally, but cap so we still get a score
    return clamp(value / min, 0, 1) * 0.7;
  }
  if (value > max) {
    // Penalize too-long (likely blog spam / listicles)
    return clamp(max / value, 0, 1) * 0.9;
  }
  return 1.0;
}

export interface ScoredResult extends SerpResult {
  probe: LightProbe | null;
  score: number;
  scoreBreakdown: {
    position: number;
    wordCount: number;
    h2Count: number;
  };
}

export function scoreResults(
  results: SerpResult[],
  probes: LightProbe[],
  topN: number,
): ScoredResult[] {
  const probeMap = new Map(probes.filter((p) => p.ok).map((p) => [p.url, p]));

  const scored: ScoredResult[] = results.map((r) => {
    const probe = probeMap.get(r.url) || null;
    const wordCount = probe?.wordCount ?? 0;
    const h2Count = probe?.h2Count ?? 0;

    const ps = positionScore(r.position);
    const ws = rangeScore(wordCount, D3_RANGES.wordCount.min, D3_RANGES.wordCount.max);
    const hs = rangeScore(h2Count, D3_RANGES.h2Count.min, D3_RANGES.h2Count.max);

    const score = D3_WEIGHTS.position * ps + D3_WEIGHTS.wordCount * ws + D3_WEIGHTS.h2Count * hs;

    return {
      ...r,
      probe,
      score,
      scoreBreakdown: {
        position: Number(ps.toFixed(3)),
        wordCount: Number(ws.toFixed(3)),
        h2Count: Number(hs.toFixed(3)),
      },
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topN);
}