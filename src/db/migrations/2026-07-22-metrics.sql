-- Stage 3 Task 16: 8 项 H00 辅指标埋点

CREATE TABLE IF NOT EXISTS team_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric TEXT NOT NULL,
  bot_name TEXT,
  chat_id TEXT,
  value NUMERIC NOT NULL,
  metadata_json JSONB,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_team_metrics_metric_time
  ON team_metrics(metric, recorded_at DESC);

COMMENT ON TABLE team_metrics IS 'H00 辅指标埋点 — task 16 (2026-07-22 stage 3). 8 metrics: callback_count, incomplete_rate, first_byte_ms, task_duration_ms, memory_recall_accuracy, search_hit_rate, orchestration_flexibility, pm2_restarts_per_day';
