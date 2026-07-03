// layer1-acquire.ts — Layer 1 orchestrator
// serpFetch → light probe (D3) → score top N → ingestFromUrl each → DB

import { serpFetch } from './serp-fetcher.js';
import { lightFetchAll, closeLightBrowser } from './light-fetcher.js';
import { scoreResults, type ScoredResult } from './d3-scorer.js';
import { ProviderConfigStore } from '../../db/provider-config-store.js';
import { ingestFromUrl } from './index.js';

export interface Layer1Options {
  query: string;
  num?: number;
  topN?: number;
  apiKey?: string;
  region?: string;
}

export interface Layer1Result {
  query: string;
  totalSerp: number;
  filteredBlacklist: number;
  probedOk: number;
  probedFailed: number;
  topScored: ScoredResult[];
  ingested: Array<{ url: string; id: string | null; name: string; skipped?: boolean }>;
}

async function getApiKey(): Promise<string> {
  const store = new ProviderConfigStore();
  await store.init();
  const provider = await store.findByName('MiniMax');
  if (!provider) throw new Error('MiniMax provider not configured');
  const key = await store.getDecryptedApiKey(provider.id);
  if (!key) throw new Error('MiniMax API key missing');
  return key;
}

export async function layer1Acquire(opts: Layer1Options): Promise<Layer1Result> {
  const num = opts.num ?? 10;
  const topN = opts.topN ?? 5;
  const apiKey = opts.apiKey ?? (await getApiKey());

  // 1. SERP fetch (with blacklist + DB dedup)
  const serp = await serpFetch({ query: opts.query, num, ...(opts.region ? { region: opts.region } : {}) });
  const totalSerp = serp.totalRaw;
  const filteredBlacklist = serp.filtered;
  const urls = serp.results.map((r) => r.url);

  // 2. Light probe in parallel for D3 scoring
  const probes = urls.length > 0 ? await lightFetchAll(urls, 5) : [];
  const probedOk = probes.filter((p) => p.ok).length;
  const probedFailed = probes.length - probedOk;

  // 3. D3 score + rank
  const topScored = scoreResults(serp.results, probes, topN);

  // 4. Ingest each top result
  const ingested: Layer1Result['ingested'] = [];
  for (const r of topScored) {
    try {
      const ing = await ingestFromUrl({
        apiKey,
        url: r.url,
        name: `${r.title.slice(0, 80)} (auto ${new Date().toISOString().slice(0, 10)})`,
        skipIfExists: true,
        derivedFrom: 'auto_serp',
      });
      ingested.push({
        url: r.url,
        id: ing.inserted?.id ?? null,
        name: ing.profile.name,
        skipped: ing.skipped,
      });
    } catch (e) {
      ingested.push({
        url: r.url,
        id: null,
        name: `FAILED: ${(e as Error).message.slice(0, 100)}`,
      });
    }
  }

  // 5. Close shared browser
  await closeLightBrowser();

  return {
    query: opts.query,
    totalSerp,
    filteredBlacklist,
    probedOk,
    probedFailed,
    topScored,
    ingested,
  };
}