CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id TEXT NOT NULL,
  bot_name TEXT NOT NULL,
  sdk_session_id TEXT,
  title TEXT,
  initial_prompt TEXT NOT NULL,
  task_summary TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'closed', 'deleted', 'failed_recovery')),
  paused_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  interrupted_at TIMESTAMPTZ,
  interrupt_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cumulative_tokens BIGINT NOT NULL DEFAULT 0,
  cumulative_cost_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
  turn_count INT NOT NULL DEFAULT 0,
  retry_count INT NOT NULL DEFAULT 0,
  output_files JSONB NOT NULL DEFAULT '[]'::jsonb,
  parent_task_id UUID REFERENCES tasks(id),
  teammate_name TEXT,
  close_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_tasks_chat_active ON tasks(chat_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_tasks_chat_paused ON tasks(chat_id) WHERE status = 'paused';
CREATE INDEX IF NOT EXISTS idx_tasks_chat_failed ON tasks(chat_id) WHERE status = 'failed_recovery';
CREATE INDEX IF NOT EXISTS idx_tasks_chat_recent ON tasks(chat_id, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_sdk_session ON tasks(sdk_session_id) WHERE sdk_session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task_id) WHERE parent_task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_status_age ON tasks(status, last_activity_at);
