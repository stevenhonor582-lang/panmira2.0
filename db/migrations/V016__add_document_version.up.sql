-- V016: Add version + version_group columns to documents table
-- Goal: structured storage for multi-version materials so bots can answer
-- "give me v3" / "list all versions" without scraping title strings.
--
-- This migration is purely additive:
--   * version       text — e.g. "v1", "v2", "v3", "final", "draft"
--   * version_group text — e.g. an md5 of title or a UUID linking related versions
-- Existing rows get NULL for both columns; backward-compatible.

ALTER TABLE documents ADD COLUMN IF NOT EXISTS version text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS version_group text;

-- Fast lookup by version within a group
CREATE INDEX IF NOT EXISTS idx_documents_version
  ON documents(version_group, version)
  WHERE version_group IS NOT NULL;

-- Fast lookup of all versions for a given group
CREATE INDEX IF NOT EXISTS idx_documents_version_group
  ON documents(version_group)
  WHERE version_group IS NOT NULL;

COMMENT ON COLUMN documents.version IS 'Semantic version label (v1/v2/final/draft). Optional; NULL means "unversioned".';
COMMENT ON COLUMN documents.version_group IS 'Stable ID linking related versions of the same material. Optional.';
