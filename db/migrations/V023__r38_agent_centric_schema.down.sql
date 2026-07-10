-- R38-C1 rollback
BEGIN;

DROP TABLE IF EXISTS agent_mcp_refs;

ALTER TABLE memories DROP COLUMN IF EXISTS agent_id;
ALTER TABLE bot_secrets DROP COLUMN IF EXISTS agent_id;
ALTER TABLE bot_budgets DROP COLUMN IF EXISTS agent_id;
ALTER TABLE budget_history DROP COLUMN IF EXISTS agent_id;
ALTER TABLE circuit_breaker_states DROP COLUMN IF EXISTS agent_id;
ALTER TABLE activity_events DROP COLUMN IF EXISTS agent_id;
ALTER TABLE sessions DROP COLUMN IF EXISTS agent_id;
ALTER TABLE chat_sessions DROP COLUMN IF EXISTS agent_id;

DROP INDEX IF EXISTS idx_memories_agent_id;
DROP INDEX IF EXISTS idx_bot_secrets_agent;
DROP INDEX IF EXISTS idx_bot_budgets_agent;
DROP INDEX IF EXISTS idx_budget_history_agent;
DROP INDEX IF EXISTS idx_circuit_breaker_states_agent;
DROP INDEX IF EXISTS idx_activity_events_agent;
DROP INDEX IF EXISTS idx_sessions_agent;
DROP INDEX IF EXISTS idx_chat_sessions_agent;

COMMIT;
