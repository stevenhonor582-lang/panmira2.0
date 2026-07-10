-- R38-C1: Agent-centric schema migration
-- Adds agent_id to runtime tables + new agent_mcp_refs join table
-- Idempotent: every change uses IF NOT EXISTS / DROP IF EXISTS — safe to re-run.

BEGIN;

-- 1.1 memories.agent_id (FK to agents.id, nullable for legacy bot_id-only rows)
ALTER TABLE memories
  ADD COLUMN IF NOT EXISTS agent_id uuid REFERENCES agents(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_memories_agent_id ON memories(agent_id);

-- 1.2 agent_mcp_refs new join table (agent x mcp_servers, with per-binding params jsonb)
-- Safe to re-run: CREATE TABLE IF NOT EXISTS is a no-op when table already exists.
CREATE TABLE IF NOT EXISTS agent_mcp_refs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  mcp_server_id uuid NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
  params jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(agent_id, mcp_server_id)
);
-- Guard column additions for cases where agent_mcp_refs was created by an earlier
-- partial run without updated_at.
ALTER TABLE agent_mcp_refs ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_agent_mcp_refs_agent ON agent_mcp_refs(agent_id);

-- 1.3 bot_secrets.agent_id
ALTER TABLE bot_secrets ADD COLUMN IF NOT EXISTS agent_id uuid;
CREATE INDEX IF NOT EXISTS idx_bot_secrets_agent ON bot_secrets(agent_id);

-- 1.4 bot_budgets.agent_id
ALTER TABLE bot_budgets ADD COLUMN IF NOT EXISTS agent_id uuid;
CREATE INDEX IF NOT EXISTS idx_bot_budgets_agent ON bot_budgets(agent_id);

-- 1.5 budget_history.agent_id
ALTER TABLE budget_history ADD COLUMN IF NOT EXISTS agent_id uuid;
CREATE INDEX IF NOT EXISTS idx_budget_history_agent ON budget_history(agent_id);

-- 1.6 circuit_breaker_states.agent_id
ALTER TABLE circuit_breaker_states ADD COLUMN IF NOT EXISTS agent_id uuid;
CREATE INDEX IF NOT EXISTS idx_circuit_breaker_states_agent ON circuit_breaker_states(agent_id);

-- 1.7 activity_events.agent_id
ALTER TABLE activity_events ADD COLUMN IF NOT EXISTS agent_id uuid;
CREATE INDEX IF NOT EXISTS idx_activity_events_agent ON activity_events(agent_id);

-- 1.8 sessions.agent_id
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS agent_id uuid;
CREATE INDEX IF NOT EXISTS idx_sessions_agent ON sessions(agent_id);

-- 1.9 chat_sessions.agent_id
ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS agent_id uuid;
CREATE INDEX IF NOT EXISTS idx_chat_sessions_agent ON chat_sessions(agent_id);

COMMIT;
