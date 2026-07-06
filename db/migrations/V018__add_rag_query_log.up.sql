-- V018: Add RAG query log for monitoring topScore trends
-- 2026-06-27 commit 5: 解决"6/27 类事件 5 分钟内发现"

CREATE TABLE IF NOT EXISTS rag_query_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_name text NOT NULL,
  chat_id text,
  query text,
  query_length int,
  top_score real,
  top_cosine real,
  result_count int,
  recall_path text,
  extraction_status text,
  duration_ms int,
  created_at timestamptz DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rag_query_log_created ON rag_query_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rag_query_log_bot ON rag_query_log (bot_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rag_query_log_top_score ON rag_query_log (top_score) WHERE top_score IS NOT NULL;

CREATE OR REPLACE VIEW v_rag_top_score_p50 AS
SELECT
  bot_name,
  DATE_TRUNC('hour', created_at) AS hour,
  COUNT(*) AS n_queries,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY top_score) AS p50_score,
  PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY top_score) AS p25_score,
  PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY top_score) AS p75_score,
  AVG(result_count)::int AS avg_result_count
FROM rag_query_log
WHERE created_at > NOW() - INTERVAL '7 days'
  AND top_score IS NOT NULL
GROUP BY bot_name, hour;
