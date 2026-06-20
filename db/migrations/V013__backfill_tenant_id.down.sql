-- V013 rollback: remove tenant_id constraints, restore 'default'
ALTER TABLE memories ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE memories DROP CONSTRAINT IF EXISTS memories_tenant_no_default;
UPDATE memories SET tenant_id = 'default' WHERE invalidated_at IS NULL;