-- V009__add_hot_path_indexes.down.sql
-- Rollback for V009__add_hot_path_indexes.up.sql

DROP INDEX IF EXISTS idx_documents_updated_at;
DROP INDEX IF EXISTS idx_documents_hit_count;
DROP INDEX IF EXISTS idx_documents_quality_score;
DROP INDEX IF EXISTS idx_memories_user_id;
