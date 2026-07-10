-- V024 down: revert data backfill
-- DROP COLUMN not used (data loss); SET agent_id = NULL only
BEGIN;
UPDATE memories SET agent_id = NULL;
UPDATE bot_secrets SET agent_id = NULL;
UPDATE bot_budgets SET agent_id = NULL;
UPDATE budget_history SET agent_id = NULL;
UPDATE circuit_breaker_states SET agent_id = NULL;
UPDATE activity_events SET agent_id = NULL;
-- bot_configs reverse fill cannot be perfectly undone; leave as-is
UPDATE agents SET default_model = 'MiniMax-M3' WHERE name = '墨言--全能文案秘书';
COMMIT;
