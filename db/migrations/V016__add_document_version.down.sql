-- DOWN: drop indexes + columns
DROP INDEX IF EXISTS idx_documents_version;
DROP INDEX IF EXISTS idx_documents_version_group;
ALTER TABLE documents DROP COLUMN IF EXISTS version_group;
ALTER TABLE documents DROP COLUMN IF EXISTS version;
