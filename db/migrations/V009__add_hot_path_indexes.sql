-- V009: Add indexes on hot-path columns
-- Purpose: Speed up search/sort queries
-- UP
CREATE INDEX IF NOT EXISTS idx_memories_user_id ON memories(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_quality_score ON documents(quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_documents_hit_count ON documents(hit_count DESC) WHERE hit_count > 0;
CREATE INDEX IF NOT EXISTS idx_documents_updated_at ON documents(updated_at DESC);

-- DOWN
-- DROP INDEX IF EXISTS idx_documents_updated_at;
-- DROP INDEX IF EXISTS idx_documents_hit_count;
-- DROP INDEX IF EXISTS idx_documents_quality_score;
-- DROP INDEX IF EXISTS idx_memories_user_id;