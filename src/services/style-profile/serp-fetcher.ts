// serp-fetcher.ts — wrapper around existing serp-crawler.ts
// Adds: blacklist filter (VMT competitors + own domains) + already-fetched URL dedup
// Returns: top N clean results ready for Layer 1 ingest

import { serpSearch, type SerpResult } from '../../bridge/serp-crawler.js';
import { pool } from '../../db/index.js';

// Default blacklist: direct competitors + VMT own domains
const DEFAULT_BLACKLIST = [
  'protolabs.com',
  'xometry.com',
  'waykenrm.com',
  'rapiddirect.com',
  'vmtcnc.com',
  'machining-custom.com',
  'stratasys.com',
  '3dsystems.com',
  'materialise.com',
  'shapeways.com',
  'hubs.com',
];

export interface SerpFetchOptions {
  query: string;
  num?: number;
  region?: string;
  engine?: 'auto' | 'serpapi' | 'ddg';
  blacklist?: string[];
  /** Skip URLs already in style_profiles.source_url (avoid re-ingest) */
  dedupAgainstDb?: boolean;
}

export interface SerpFetchResult {
  query: string;
  totalRaw: number;
  filtered: number;
  results: SerpResult[];
}

/** Case-insensitive substring match against URL hostname */
function isBlacklisted(url: string, blacklist: string[]): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return blacklist.some((d) => host === d.toLowerCase() || host.endsWith('.' + d.toLowerCase()));
  } catch {
    return false;
  }
}

async function getIngestedUrls(): Promise<Set<string>> {
  const { rows } = await pool.query('SELECT source_url FROM style_profiles WHERE source_url IS NOT NULL');
  return new Set(rows.map((r: { source_url: string }) => r.source_url));
}

export async function serpFetch(opts: SerpFetchOptions): Promise<SerpFetchResult> {
  const num = opts.num ?? 10;
  const blacklist = opts.blacklist ?? DEFAULT_BLACKLIST;

  // 1. raw SERP call (existing logic with SerpAPI 3-key + DDG fallback)
  const engine = opts.engine === 'auto' ? undefined : opts.engine;
  const raw = await serpSearch(opts.query, { num, ...(opts.region ? { region: opts.region } : {}), ...(engine ? { engine } : {}) });
  const totalRaw = raw.length;

  // 2. dedup against DB (optional)
  const ingested = opts.dedupAgainstDb !== false ? await getIngestedUrls() : new Set<string>();

  // 3. filter: blacklist + already ingested
  const filtered = raw.filter((r) => {
    if (isBlacklisted(r.url, blacklist)) return false;
    if (ingested.has(r.url)) return false;
    return true;
  });

  return {
    query: opts.query,
    totalRaw,
    filtered: totalRaw - filtered.length,
    results: filtered,
  };
}

export { DEFAULT_BLACKLIST, isBlacklisted };