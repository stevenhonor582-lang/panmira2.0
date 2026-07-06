-- Plan C: usage_reports 物化视图
-- 加速报表查询,后台调度 REFRESH

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_usage_reports_daily AS
SELECT
  tenant_id,
  date,
  dimension,
  dimension_key,
  SUM(count)::bigint AS count
FROM usage_reports
GROUP BY tenant_id, date, dimension, dimension_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_usage_daily_pk
  ON mv_usage_reports_daily(tenant_id, date, dimension, dimension_key);

CREATE INDEX IF NOT EXISTS idx_mv_usage_daily_tenant_date
  ON mv_usage_reports_daily(tenant_id, date);

-- 刷新函数 (CONCURRENTLY 不锁表)
CREATE OR REPLACE FUNCTION refresh_daily_usage() RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_usage_reports_daily;
END;
$$ LANGUAGE plpgsql;
