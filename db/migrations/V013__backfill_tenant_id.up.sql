-- V013 (v2): Backfill tenant_id + partial CHECK (active rows only)
-- UP
DO $$
BEGIN
  UPDATE memories SET tenant_id = 'user:' || user_id
    WHERE tenant_id = 'default' AND user_id LIKE 'ou_%' AND invalidated_at IS NULL;
  UPDATE memories SET tenant_id = 'tenant:backfill'
    WHERE tenant_id = 'default' AND user_id = 'backfill' AND invalidated_at IS NULL;
  UPDATE memories SET tenant_id = 'tenant:e2e-test'
    WHERE tenant_id = 'default' AND user_id = 'e2e-test' AND invalidated_at IS NULL;
  UPDATE memories SET tenant_id = 'tenant:system'
    WHERE tenant_id = 'default' AND user_id = 'sys' AND invalidated_at IS NULL;
  UPDATE memories SET tenant_id = 'tenant:legacy'
    WHERE tenant_id = 'default' AND invalidated_at IS NULL;
END $$;

-- Partial CHECK: only active rows must not be 'default'
-- (invalidated rows are tombstones, can keep their original value)
ALTER TABLE memories
  ADD CONSTRAINT memories_tenant_no_default
  CHECK (tenant_id != 'default' OR invalidated_at IS NOT NULL);

ALTER TABLE memories ALTER COLUMN tenant_id SET NOT NULL;

-- DOWN
-- ALTER TABLE memories ALTER COLUMN tenant_id DROP NOT NULL;
-- ALTER TABLE memories DROP CONSTRAINT IF EXISTS memories_tenant_no_default;
-- UPDATE memories SET tenant_id = 'default' WHERE invalidated_at IS NULL;