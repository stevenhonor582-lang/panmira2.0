-- Clarification Engine 会话表
-- 用于存储问询补全的多轮会话状态
-- 设计依据: docs/superpowers/specs/2026-06-01-clarification-engine-design.md §3.3

CREATE TABLE IF NOT EXISTS clarification_sessions (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  bot_id TEXT NOT NULL,
  target_skill TEXT NOT NULL,
  payload JSONB DEFAULT '{}'::jsonb,
  missing_fields JSONB DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours',
  CONSTRAINT uniq_clarification_session UNIQUE (user_id, bot_id, target_skill)
);

CREATE INDEX IF NOT EXISTS idx_clarification_user_bot
  ON clarification_sessions (user_id, bot_id);

CREATE INDEX IF NOT EXISTS idx_clarification_expires
  ON clarification_sessions (expires_at);

CREATE INDEX IF NOT EXISTS idx_clarification_status
  ON clarification_sessions (status);
