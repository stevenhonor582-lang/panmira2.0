-- 回滚 l3_self_iterate trigger 到只用 metadata_json 写 superseded_by
BEGIN;

CREATE OR REPLACE FUNCTION l3_self_iterate() RETURNS trigger AS $$
DECLARE
  old_id text;
BEGIN
  IF NEW.layer = 3 AND NEW.invalidated_at IS NULL AND NEW.superseded_by IS NULL THEN
    SELECT id INTO old_id
    FROM memories
    WHERE bot_id = NEW.bot_id
      AND subject_normalized = NEW.subject_normalized
      AND layer IN (2, 3)
      AND invalidated_at IS NULL
      AND id <> NEW.id
    ORDER BY CASE WHEN layer = 3 THEN 0 ELSE 1 END, created_at DESC
    LIMIT 1;

    IF old_id IS NOT NULL THEN
      UPDATE memories
      SET invalidated_at = NOW(),
          updated_at = NOW(),
          metadata_json = COALESCE(metadata_json, '{}'::jsonb) ||
                          jsonb_build_object(
                            'superseded_by', NEW.id,
                            'superseded_at', NOW()::text,
                            'superseded_reason', 'new L3 with same subject_normalized'
                          )
      WHERE id = old_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMIT;
