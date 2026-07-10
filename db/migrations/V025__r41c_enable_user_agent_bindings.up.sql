-- V025__r41c_enable_user_agent_bindings.up.sql
-- R41-C: enable user_agent_bindings (m:n) as canonical binding source of truth.
-- The table was created earlier via raw SQL but never tracked in drizzle schema.
-- Backfill from agents.owner_user_id (legacy single-tenant cache) into the m:n
-- table so the new filter (filter=unassigned excludes anyone with a binding)
-- works without losing the existing owner_user_id state.
--
-- Idempotent: every change uses IF NOT EXISTS / ON CONFLICT DO NOTHING.
BEGIN;

-- 1. Ensure the table exists with the canonical shape (defensive -- matches DB).
CREATE TABLE IF NOT EXISTS user_agent_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  user_id uuid NOT NULL,
  agent_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'user',
  is_primary boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. Backfill from agents.owner_user_id (legacy single-tenant cache).
INSERT INTO user_agent_bindings (tenant_id, user_id, agent_id, role, is_primary, created_at, updated_at)
SELECT
  COALESCE(a.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid),
  a.owner_user_id,
  a.id,
  'owner',
  true,
  now(),
  now()
FROM agents a
WHERE a.owner_user_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- 3. Helpful indexes (already exist per DB inspection, defensive).
CREATE INDEX IF NOT EXISTS idx_uab_agent ON user_agent_bindings(agent_id);
CREATE INDEX IF NOT EXISTS idx_uab_user  ON user_agent_bindings(user_id);

COMMIT;
