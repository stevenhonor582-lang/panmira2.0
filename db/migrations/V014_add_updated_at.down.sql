-- V014 rollback
ALTER TABLE memories DROP COLUMN IF EXISTS updated_at;
DROP TRIGGER IF EXISTS memories_updated_at_trigger ON memories;
DROP INDEX IF EXISTS idx_memories_updated_at;