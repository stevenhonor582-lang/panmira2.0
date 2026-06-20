-- V008__memory_not_null_safe.down.sql
-- Rollback for V008__memory_not_null_safe.up.sql

ALTER TABLE memories ALTER COLUMN layer DROP NOT NULL;
ALTER TABLE memories ALTER COLUMN type DROP NOT NULL;
