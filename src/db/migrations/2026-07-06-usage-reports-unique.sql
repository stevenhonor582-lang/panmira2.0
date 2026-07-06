-- Plan B-3: usage_reports 唯一索引 (支持 ON CONFLICT 累加)
-- 复合 unique: (tenant_id, date, dimension, dimension_key)

CREATE UNIQUE INDEX IF NOT EXISTS idx_usage_reports_unique
  ON usage_reports(tenant_id, date, dimension, dimension_key);
