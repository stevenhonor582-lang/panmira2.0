// yaml-importer.ts — convert reference-samples.yaml seeds to style_profiles
// Preserves author_notes + vmt_borrow_points + best_for_role in slots.extra
// Derives topic_tags from industry + article_type + title keywords

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pool } from '../../db/index.js';
import type { StyleProfile, StyleSlots } from './types.js';

const _require = createRequire(import.meta.url);
const { parse: parseYaml } = _require('yaml') as { parse: (s: string) => unknown };

interface YamlSample {
  id: string;
  title: string;
  url: string;
  competitor: string;
  industry: string;
  article_type: string;
  word_count_estimate: number;
  h2_count: number;
  h3_count: number;
  characteristics: StyleSlots;
  vmt_borrow_points: string[];
  best_for_role: string[];
  added_by: string;
  added_at: string;
  author_notes: string;
}

interface YamlRoot {
  samples: YamlSample[];
}

export function deriveTopicTags(s: YamlSample): string[] {
  const tags: string[] = [];
  const titleLow = s.title.toLowerCase();

  // Industry → topic
  if (s.industry.includes('3D 打印') || s.industry.includes('增材')) {
    tags.push('3d_printing', 'additive_manufacturing');
  }
  if (s.industry.includes('CNC')) tags.push('cnc_machining');
  if (s.industry.includes('5 轴') || titleLow.includes('5-axis') || titleLow.includes('5 axis')) {
    tags.push('5_axis_machining');
  }
  if (s.industry.includes('弹性体')) tags.push('elastomer', 'silicone');

  // Article type → topic
  if (s.article_type.includes('对比')) tags.push('process_comparison');
  if (s.article_type.includes('完整指南')) tags.push('complete_guide');
  if (s.article_type.includes('客户故事')) tags.push('case_study');
  if (s.article_type.includes('百科')) tags.push('encyclopedia');

  // Title keyword → specific topic
  if (titleLow.includes('mjf')) tags.push('mjf');
  if (titleLow.includes('fdm')) tags.push('fdm');
  if (titleLow.includes('silicone') || titleLow.includes('硅胶')) tags.push('silicone');

  return Array.from(new Set(tags));
}

export function deriveReaderTags(roles: string[]): string[] {
  const map: Record<string, string[]> = {
    'r1-cross-border-b2b': ['cross_border_b2b', 'sales_manager'],
    'r2-oem-large': ['oem_large', 'procurement_manager'],
    'r3-rnd-prototyping': ['rnd_engineer', 'product_developer'],
    'r4-mass-production': ['mass_production_buyer', 'manufacturing_manager'],
  };
  const tags = new Set<string>();
  for (const r of roles) {
    for (const t of map[r] || [r]) tags.add(t);
  }
  return Array.from(tags);
}

export function sampleToProfile(s: YamlSample): StyleProfile & { notes: string } {
  const slots: StyleSlots & { extra: Record<string, unknown> } = {
    ...s.characteristics,
    extra: {
      competitor: s.competitor,
      industry: s.industry,
      article_type: s.article_type,
      word_count_estimate: s.word_count_estimate,
      h2_count: s.h2_count,
      h3_count: s.h3_count,
      vmt_borrow_points: s.vmt_borrow_points,
      best_for_role: s.best_for_role,
      added_by: s.added_by,
      added_at: s.added_at,
    },
  };

  return {
    name: `${s.competitor} - ${s.id}`,
    topic_tags: deriveTopicTags(s),
    reader_tags: deriveReaderTags(s.best_for_role),
    slots: slots as StyleSlots,
    source_url: s.url,
    source_sample_id: s.id,
    derived_from: 'yaml_seed',
    notes: s.author_notes.trim(),
  };
}

export async function importYamlSeeds(yamlPath: string): Promise<{ inserted: number; skipped: number; ids: string[] }> {
  const text = readFileSync(yamlPath, 'utf-8');
  const root = parseYaml(text) as YamlRoot;
  if (!root?.samples?.length) throw new Error('No samples found in YAML');

  let inserted = 0;
  let skipped = 0;
  const ids: string[] = [];

  for (const sample of root.samples) {
    // Idempotency: skip if source_sample_id already in DB
    const exists = await pool.query(
      'SELECT id FROM style_profiles WHERE source_sample_id = $1 LIMIT 1',
      [sample.id],
    );
    if (exists.rows.length > 0) {
      skipped += 1;
      ids.push(exists.rows[0].id);
      continue;
    }

    const profile = sampleToProfile(sample);
    const { rows } = await pool.query(
      `INSERT INTO style_profiles
         (name, topic_tags, reader_tags, slots, derived_from, source_url, source_sample_id, notes)
       VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5, $6, $7, $8)
       RETURNING id`,
      [
        profile.name,
        JSON.stringify(profile.topic_tags),
        JSON.stringify(profile.reader_tags),
        JSON.stringify(profile.slots),
        profile.derived_from,
        profile.source_url,
        profile.source_sample_id,
        profile.notes,
      ],
    );
    inserted += 1;
    ids.push(rows[0].id);
  }

  return { inserted, skipped, ids };
}