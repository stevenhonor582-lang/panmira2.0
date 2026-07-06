// index.ts — orchestrator: fetch → extract → insert

import { fetchArticle } from './fetcher.js';
import { extractProfile } from './extractor.js';
import { insertProfile, profileExistsByUrl, type InsertResult } from './store.js';
import type { FetcherResult, StyleProfile } from './types.js';

export interface IngestOptions {
  apiKey: string;
  url: string;
  name?: string;
  model?: string;
  skipIfExists?: boolean;
  derivedFrom?: string;
}

export interface IngestResult {
  inserted: InsertResult | null;
  profile: StyleProfile;
  fetched: FetcherResult;
  skipped?: boolean;
}

export async function ingestFromUrl(opts: IngestOptions): Promise<IngestResult> {
  if (opts.skipIfExists && (await profileExistsByUrl(opts.url))) {
    const fetched = await fetchArticle(opts.url);
    return {
      inserted: null,
      profile: { name: opts.name || '(existing)', topic_tags: [], reader_tags: [], slots: {}, source_url: opts.url },
      fetched,
      skipped: true,
    };
  }

  const fetched = await fetchArticle(opts.url);
  const profile = await extractProfile(opts.apiKey, fetched, opts.model);
  if (opts.name) profile.name = opts.name;
  if (opts.derivedFrom) profile.derived_from = opts.derivedFrom;
  const inserted = await insertProfile(profile);
  return { inserted, profile, fetched };
}

export { fetchArticle } from './fetcher.js';
export { extractProfile } from './extractor.js';
export { insertProfile, profileExistsByUrl } from './store.js';
export type { InsertResult } from './store.js';
export type { FetcherResult, StyleProfile, StyleSlots } from './types.js';