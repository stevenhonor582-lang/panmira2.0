-- V011__memory_subject_dedup_unique.down.sql
-- Rollback for V011__memory_subject_dedup_unique.up.sql

DROP INDEX IF EXISTS idx_memories_bot_subject_unique;
