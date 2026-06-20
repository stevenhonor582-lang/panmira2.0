-- V012: Backfill existing duplicate memories
-- Purpose: Clean up duplicates from missing LLM dedup
-- Strategy: Keep the row with highest (confidence, hit_count, content length), mark others invalidated
-- UP
DO $$
DECLARE
  dup_rec RECORD;
  keep_id TEXT;
BEGIN
  FOR dup_rec IN
    SELECT bot_id, subject_normalized, COUNT(*) AS cnt,
           array_agg(id ORDER BY confidence DESC, hit_count DESC, length(content) DESC) AS ids
    FROM memories
    WHERE invalidated_at IS NULL
    GROUP BY bot_id, subject_normalized
    HAVING COUNT(*) > 1
  LOOP
    keep_id := dup_rec.ids[1];
    UPDATE memories
    SET invalidated_at = NOW(),
        metadata_json = COALESCE(metadata_json, '{}'::jsonb) ||
                        jsonb_build_object('dedup_merged_from', to_jsonb(dup_rec.ids[2:array_length(dup_rec.ids, 1)]))
    WHERE bot_id = dup_rec.bot_id
      AND subject_normalized = dup_rec.subject_normalized
      AND id <> keep_id
      AND invalidated_at IS NULL;
  END LOOP;
END $$;

-- DOWN: Manual review required - extract merged IDs from metadata_json to reinstate