-- V011: Add UNIQUE partial index on memories(bot_id, subject_normalized) where invalidated_at IS NULL
-- Purpose: Prevent new duplicates (DB-level guarantee; complements code dedup)
-- Pre-condition: V012 must run first to clean existing duplicates
-- UP
CREATE UNIQUE INDEX IF NOT EXISTS idx_memories_bot_subject_unique
  ON memories(bot_id, subject_normalized)
  WHERE invalidated_at IS NULL;

-- DOWN
-- DROP INDEX IF EXISTS idx_memories_bot_subject_unique;