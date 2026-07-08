-- ============================================================
-- P0 全局清理 - 2026-07-08
-- ============================================================

-- 1. digital_employees view 排除 deprecated (full-stack-engineer)
DROP VIEW IF EXISTS digital_employees;
CREATE VIEW digital_employees AS
SELECT *
FROM agents
WHERE is_active = true
  AND (status IS NULL OR status != 'deprecated');

-- 2. agents.model_id 回填 (8 agents → 智谱 GLM)
UPDATE agents SET
  model_id = CASE
    WHEN engine = 'claude' OR default_engine = 'claude' THEN
      (SELECT id FROM provider_configs WHERE name = '智谱 (GLM)' LIMIT 1)
    WHEN engine LIKE '%openai%' OR default_engine LIKE '%openai%' THEN
      (SELECT id FROM provider_configs WHERE type = 'openai' AND is_default = false LIMIT 1)
    ELSE
      (SELECT id FROM provider_configs WHERE is_default = true LIMIT 1)
  END
WHERE model_id IS NULL;

-- 验证
SELECT 'digital_employees view (排除 deprecated)' as step, count(*) FROM digital_employees;
SELECT 'agents.model_id 回填 (NULL 数)' as step, count(*) FROM agents WHERE model_id IS NULL;
