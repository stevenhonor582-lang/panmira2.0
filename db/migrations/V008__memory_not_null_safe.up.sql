-- V008: Add NOT NULL on safe columns (layer, type)
-- Pre-condition: V007 CHECK constraints must be in place
-- Pre-condition: any NULL rows must be backfilled first (DO block below handles this)
-- UP
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM memories WHERE layer IS NULL) THEN
    UPDATE memories SET layer = 1 WHERE layer IS NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM memories WHERE type IS NULL) THEN
    UPDATE memories SET type = 'event' WHERE type IS NULL;
  END IF;
END $$;

ALTER TABLE memories ALTER COLUMN layer SET NOT NULL;
ALTER TABLE memories ALTER COLUMN type SET NOT NULL;

-- DOWN
-- ALTER TABLE memories ALTER COLUMN layer DROP NOT NULL;
-- ALTER TABLE memories ALTER COLUMN type DROP NOT NULL;