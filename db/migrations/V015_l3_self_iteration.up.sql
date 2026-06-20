-- V015 v3: L3 self-iteration via tombstone pattern
-- Strategy: new L3 invalidates old L3/L2 (sets invalidated_at), stores chain in metadata
-- This avoids FK conflict and works with V011 partial UNIQUE index

DROP TRIGGER IF EXISTS memories_l3_self_iterate_trigger ON memories;
DROP FUNCTION IF EXISTS l3_self_iterate();

CREATE OR REPLACE FUNCTION l3_self_iterate()
RETURNS TRIGGER AS $$
DECLARE
  old_id text;
BEGIN
  IF NEW.layer = 3 AND NEW.invalidated_at IS NULL AND NEW.superseded_by IS NULL THEN
    -- Find most recent active L3/L2 with same subject (excluding self)
    SELECT id INTO old_id
    FROM memories
    WHERE bot_id = NEW.bot_id
      AND subject_normalized = NEW.subject_normalized
      AND layer IN (2, 3)
      AND invalidated_at IS NULL
      AND id <> NEW.id
    ORDER BY
      CASE WHEN layer = 3 THEN 0 ELSE 1 END,
      created_at DESC
    LIMIT 1;

    IF old_id IS NOT NULL THEN
      -- Mark old as tombstone, store chain in metadata
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
      RAISE NOTICE 'L3 self-iteration: % invalidated, superseded by %', old_id, NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER memories_l3_self_iterate_trigger
  BEFORE INSERT ON memories
  FOR EACH ROW EXECUTE FUNCTION l3_self_iterate();

-- DOWN
-- DROP TRIGGER IF EXISTS memories_l3_self_iterate_trigger ON memories;
-- DROP FUNCTION IF EXISTS l3_self_iterate();