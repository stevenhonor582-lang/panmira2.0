// types.ts — style profile domain types

export interface FetcherResult {
  url: string;
  title: string;
  h1List: string[];
  h2List: string[];
  h3List: string[];
  paragraphs: string[];
  wordCount: number;
  ctaSnippets: string[];
}

export interface StyleSlots {
  title_formula?: string;
  opening_pattern?: string;
  body_structure?: string;
  voice_tone?: string;
  pronoun_usage?: string;
  paragraph_rhythm?: string;
  cta_strategy?: string;
  link_strategy?: string;
}

export interface StyleProfile {
  name: string;
  topic_tags: string[];
  reader_tags: string[];
  slots: StyleSlots;
  source_url: string;
  derived_from?: string;
  source_sample_id?: string;
  notes?: string;
}