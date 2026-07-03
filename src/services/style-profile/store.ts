// store.ts — INSERT style_profile via raw pool (Drizzle to be added later)

import { pool } from '../../db/index.js';
import type { StyleProfile } from './types.js';

export interface InsertResult {
  id: string;
  name: string;
  topic_tags: string[];
  reader_tags: string[];
}

export async function insertProfile(profile: StyleProfile): Promise<InsertResult> {
  const { rows } = await pool.query(
    `INSERT INTO style_profiles
       (name, topic_tags, reader_tags, slots, derived_from, source_url, source_sample_id, notes)
     VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5, $6, $7, $8)
     RETURNING id, name, topic_tags, reader_tags`,
    [
      profile.name,
      JSON.stringify(profile.topic_tags || []),
      JSON.stringify(profile.reader_tags || []),
      JSON.stringify(profile.slots || {}),
      profile.derived_from || profile.source_url || null,
      profile.source_url || null,
      profile.source_sample_id || null,
      profile.notes || null,
    ],
  );
  return rows[0];
}

export async function profileExistsByUrl(url: string): Promise<boolean> {
  const { rows } = await pool.query(
    'SELECT 1 FROM style_profiles WHERE source_url = $1 LIMIT 1',
    [url],
  );
  return rows.length > 0;
}