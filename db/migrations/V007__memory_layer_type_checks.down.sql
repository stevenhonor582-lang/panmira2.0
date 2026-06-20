-- V007__memory_layer_type_checks.down.sql
-- Rollback for V007__memory_layer_type_checks.up.sql

ALTER TABLE memories DROP CONSTRAINT memories_layer_check;
ALTER TABLE memories DROP CONSTRAINT memories_type_check;
