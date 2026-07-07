-- Phase 4 Level 4 Fix 3: Rate limit state persistence
-- Defends against pm2 reload bypass: in-memory state was wiped on reload,
-- allowing attackers to reset their daily cap by triggering reloads.

CREATE TABLE IF NOT EXISTS rate_limit_state (
  user_id UUID PRIMARY KEY,
  rate_count INTEGER NOT NULL DEFAULT 0,
  rate_reset_at TIMESTAMPTZ NOT NULL,
  tokens_used INTEGER NOT NULL DEFAULT 0,
  tokens_reset_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_state_updated
  ON rate_limit_state(updated_at DESC);
