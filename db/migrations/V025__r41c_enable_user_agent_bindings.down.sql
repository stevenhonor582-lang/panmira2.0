-- V025__r41c_enable_user_agent_bindings.down.sql
-- Rollback: drop the bindings this migration inserted (role=owner + is_primary=true).
BEGIN;
DELETE FROM user_agent_bindings WHERE role = 'owner' AND is_primary = true;
COMMIT;
