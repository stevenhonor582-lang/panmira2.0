-- ============================================================================
-- panmira IA v6 — DB views + new tables (FIXED v2)
-- ============================================================================

-- 1. People 扩展档案 1-1 表
CREATE TABLE IF NOT EXISTS people_profile_extended (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  department VARCHAR(100),
  title VARCHAR(100),
  hired_at DATE,
  skills JSONB DEFAULT '[]'::jsonb,
  status VARCHAR(20) DEFAULT 'active',
  rate_per_min INT,
  daily_tokens BIGINT DEFAULT 0,
  bio TEXT,
  updated_at TIMESTAMP DEFAULT now()
);

-- 2. Endpoint 健康监测表
CREATE TABLE IF NOT EXISTS endpoint_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id UUID NOT NULL,
  checked_at TIMESTAMP DEFAULT now(),
  latency_ms INT,
  healthy BOOLEAN,
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_endpoint_health_checked ON endpoint_health(endpoint_id, checked_at DESC);

-- 3. People 视图(组织部查询用)
CREATE OR REPLACE VIEW people AS
  SELECT u.id, u.tenant_id, u.email, u.feishu_user_id, u.name, u.avatar_url,
         u.role, u.is_active, u.created_at, u.updated_at,
         p.department, p.title, p.hired_at, p.skills, p.status,
         p.rate_per_min, p.daily_tokens, p.bio,
         COALESCE(
           (SELECT array_agg(ut.team_id) FROM user_teams ut WHERE ut.user_id = u.id),
           ARRAY[]::uuid[]
         ) AS team_ids
    FROM users u
    LEFT JOIN people_profile_extended p ON p.user_id = u.id;

-- 4. Model pool 视图(资源频道·LLM)
CREATE OR REPLACE VIEW model_pool AS
  SELECT id, name, type, base_url, model,
         is_default,
         CASE WHEN is_default THEN 'active' ELSE 'available' END AS status,
         created_at, updated_at
    FROM provider_configs;

-- 5. Endpoints 视图(资源频道·接入点,统一不同 channel)
CREATE OR REPLACE VIEW endpoints AS
  SELECT id, name, display_name, platform,
         CASE
           WHEN platform = 'feishu' THEN 'feishu'
           WHEN platform = 'telegram' THEN 'telegram'
           WHEN platform = 'wechat' OR platform = 'wecom' THEN 'wechat'
           WHEN platform = 'webhook' THEN 'webhook'
           WHEN platform = 'cli' THEN 'cli'
           ELSE 'custom'
         END AS endpoint_type,
         config_json AS config, is_active, remark,
         created_at, updated_at
    FROM bot_configs;

-- 6. Employees 视图(数字员工,兼容 agents 表)
CREATE OR REPLACE VIEW digital_employees AS
  SELECT * FROM agents;
