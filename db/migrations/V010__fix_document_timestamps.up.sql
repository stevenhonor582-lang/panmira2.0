-- V010: Convert documents.created_at and documents.updated_at from TEXT to timestamptz
-- Purpose: Allow proper time-based queries, indexes, and recency calculations
-- Pre-condition: All existing values must be valid ISO 8601 strings (verified by DO block)
-- UP
DO $$
DECLARE
  bad_count INT;
BEGIN
  SELECT COUNT(*) INTO bad_count FROM documents
    WHERE created_at IS NOT NULL AND created_at <> ''
      AND created_at::timestamptz IS NULL;
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'Cannot convert: % rows have unparseable created_at', bad_count;
  END IF;
  SELECT COUNT(*) INTO bad_count FROM documents
    WHERE updated_at IS NOT NULL AND updated_at <> ''
      AND updated_at::timestamptz IS NULL;
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'Cannot convert: % rows have unparseable updated_at', bad_count;
  END IF;
END $$;

ALTER TABLE documents
  ALTER COLUMN created_at TYPE timestamptz USING NULLIF(created_at, '')::timestamptz,
  ALTER COLUMN updated_at TYPE timestamptz USING NULLIF(updated_at, '')::timestamptz;

-- DOWN
-- ALTER TABLE documents
--   ALTER COLUMN created_at TYPE text USING created_at::text,
--   ALTER COLUMN updated_at TYPE text USING updated_at::text;