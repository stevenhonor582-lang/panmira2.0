-- V010__fix_document_timestamps.down.sql
-- Rollback for V010__fix_document_timestamps.up.sql

ALTER TABLE documents
ALTER COLUMN created_at TYPE text USING created_at::text,
ALTER COLUMN updated_at TYPE text USING updated_at::text;
