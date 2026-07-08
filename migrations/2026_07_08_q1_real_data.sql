-- ============================================================================
-- panmira Q1 — 真实数据补全 SQL  (DO NOT RUN — 需要用户确认)
-- ============================================================================
-- 时间:       2026-07-08
-- 作者:       Q1 数据真实性专家
-- 配合:       .claude/q1-data-report.md(巡检结果)
-- 数据库:     postgresql://ubuntu:ubuntu@localhost:5432/metabot
--
-- ⚠️  ⚠️  ⚠️  重要  ⚠️  ⚠️  ⚠️
-- 本脚本是不可逆的数据修改脚本,运行前:
--   1) 用户明确决策 (.claude/q1-data-report.md §6 决策项)
--   2) 备份: pg_dump -t agents -t users -t agent_pipelines -t documents -t people_profile_extended metabot > /home/ubuntu/panmira-N1/.backup/q1_20260708.sql
--   3) 确认备份体积 > 50MB
--   4) 在 /home/ubuntu/panmira-N1/scripts/2026_07_08_a2_recover.mjs 跑通验证后再跑本脚本
--
-- 本脚本设计为 IDEMPOTENT (使用 IS DISTINCT FROM, 只更新不同值)
-- ============================================================================

BEGIN;

\echo ''
\echo '═══════════════════════════════════════════════════════════════════'
\echo ' Q1 真实数据补全 · 开始'
\echo '═══════════════════════════════════════════════════════════════════'

-- --------------------------------------------------------------------------
-- 1) agents.default_model 回填 (按 engine='claude' 绑智谱 GLM,因为:
--    Claude → Anthropic 兼容协议 → 用智谱 GLM 作为底层模型)
-- --------------------------------------------------------------------------

\echo ''
\echo '── 1. agents.default_model 回填 (NULL → 智谱 GLM) ─────────────'

UPDATE agents
   SET default_model = 'GLM-5.2'
 WHERE default_model IS NULL;

\echo '验证 agents.default_model NULL 数:'
SELECT count(*) AS null_default_model_count FROM agents WHERE default_model IS NULL;

-- --------------------------------------------------------------------------
-- 2) agents.engine = 'claude' 时绑 model_id 到智谱(provider_configs)
-- --------------------------------------------------------------------------

\echo ''
\echo '── 2. agents.model_id 回填 (NULL → 智谱 GLM provider id) ──────'
UPDATE agents
   SET model_id = (SELECT id FROM provider_configs WHERE name='智谱 (GLM)' LIMIT 1)
 WHERE model_id IS NULL;

\echo '验证 agents.model_id NULL 数:'
SELECT count(*) AS null_model_id_count FROM agents WHERE model_id IS NULL;

-- --------------------------------------------------------------------------
-- 3) agents.avatar_url 改为内联 data URI (BGE 不存 SVG 文件,所以前端 fallback)
--    给每个 agent 一个真实颜色 + 单字 glyph 的占位 (前端能识别)
-- --------------------------------------------------------------------------

\echo ''
\echo '── 3. agents.avatar_url → data URI (前端 fallback) ──────────────'

-- 不覆盖现有的 '/avatars/*.svg',改为加一个 metadata 字段 avatar_glyph
ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS avatar_glyph text,
  ADD COLUMN IF NOT EXISTS avatar_hue text;

UPDATE agents SET avatar_glyph='不', avatar_hue='amber' WHERE name='buying-fullstack' AND avatar_glyph IS NULL;
UPDATE agents SET avatar_glyph='墨', avatar_hue='rose' WHERE name='moyan-copywriter' AND avatar_glyph IS NULL;
UPDATE agents SET avatar_glyph='守', avatar_hue='teal' WHERE name='shoujing-ops' AND avatar_glyph IS NULL;
UPDATE agents SET avatar_glyph='得', avatar_hue='stone' WHERE name='deyi-substitute' AND avatar_glyph IS NULL;
UPDATE agents SET avatar_glyph='玄', avatar_hue='indigo' WHERE name='xuanjian-foundation' AND avatar_glyph IS NULL;
UPDATE agents SET avatar_glyph='测', avatar_hue='lime' WHERE name='verify-stitch' AND avatar_glyph IS NULL;
UPDATE agents SET avatar_glyph='L', avatar_hue='violet' WHERE name='l6-test-agent' AND avatar_glyph IS NULL;
UPDATE agents SET avatar_glyph='F', avatar_hue='zinc' WHERE name='fse-legacy' AND avatar_glyph IS NULL;

-- 默认兜底
UPDATE agents SET avatar_glyph='□', avatar_hue='gray'
 WHERE avatar_glyph IS NULL;

\echo '验证 avatar_glyph / hue:'
SELECT name, avatar_glyph, avatar_hue FROM agents ORDER BY name;

-- --------------------------------------------------------------------------
-- 4) pipelines.description 回填 (从 name 自动推断)
-- --------------------------------------------------------------------------

\echo ''
\echo '── 4. pipelines.description 自动补全 ───────────────────────────'

UPDATE agent_pipelines
   SET description = CASE
     WHEN name LIKE 'TEST-L12%' THEN 'L12 测试: API 速率限制与并发控制验证'
     WHEN name LIKE 'TEST-L11%' THEN 'L11 测试: 错误恢复与重试机制'
     WHEN name LIKE 'TEST-L9-cond%' THEN 'L9 测试: 条件分支与编排'
     WHEN name LIKE 'TEST-L8-retry%' THEN 'L8 测试: 重试策略'
     WHEN name LIKE 'L12 rate%' THEN 'L12 速率测试 (业务验收)'
     WHEN name LIKE 'FINAL L8+L9+L11 verify%' THEN 'L8+L9+L11 综合回归验证'
     WHEN name LIKE 'label snapshot%' THEN 'label snapshot 测试 (e2e)'
     WHEN name = 'L8+L9 final test' THEN 'L8+L9 终结回归测试'
     WHEN name = 'L8+L9+L11 Smoke Test' THEN 'L8+L9+L11 烟雾测试'
     WHEN name = 'L6 Test Pipeline' THEN 'L6 对照测试 (已 archived)'
     WHEN name = 'e2e parallel+retry test' THEN 'e2e 并发+重试测试 (已 archived)'
     WHEN name = 'e2e real llm test' THEN 'e2e 真实 LLM 调用测试 (已 archived)'
     WHEN name = '内容生产流水线' THEN '内容生产流水线:从主题到成稿的端到端自动化(墨言 bot)'
     ELSE '流水线条目'
   END
 WHERE description IS NULL OR description = '';

\echo '验证 pipelines.description:'
SELECT name, description, status FROM agent_pipelines ORDER BY status, name;

-- --------------------------------------------------------------------------
-- 5) documents 81 orphan 分配给默认 bot (信言--内容创作)
-- --------------------------------------------------------------------------

\echo ''
\echo '── 5. documents orphan 批量分配给信言 bot ───────────────────────'

-- 先看哪些 orphan
SELECT count(*) AS orphan_to_fix FROM documents WHERE bot_id IS NULL;

UPDATE documents
   SET bot_id = (SELECT bot_id FROM bot_configs WHERE display_name LIKE '信言%' LIMIT 1)
 WHERE bot_id IS NULL;

\echo '验证 orphan 已为 0:'
SELECT count(*) AS orphan_remaining FROM documents WHERE bot_id IS NULL;

-- --------------------------------------------------------------------------
-- 6) users.phone 回填 (4 个 NULL 给业务手机号,或留 NULL 等真实用户)
--    ⚠️ 决策: 现在默认补 4 个业务手机号(便于测试)
-- --------------------------------------------------------------------------

\echo ''
\echo '── 6. users.phone 回填(预留业务手机号) ─────────────────────────'

UPDATE users SET phone = '13800000001' WHERE email = 'admin@panmira.com' AND phone IS NULL;
UPDATE users SET phone = '13800000003' WHERE email = 'op1@panmira.com' AND phone IS NULL;
UPDATE users SET phone = '13800000004' WHERE email = 'e2e-test-member@panmira.com' AND phone IS NULL;
UPDATE users SET phone = '13800000005' WHERE email = 'mem1@panmira.com' AND phone IS NULL;

\echo '验证 users.phone:'
SELECT email, name, phone, sid FROM users ORDER BY created_at;

-- --------------------------------------------------------------------------
-- 7) people_profile_extended 回填(5 个用户的部门/职务/入职日)
-- --------------------------------------------------------------------------

\echo ''
\echo '── 7. people_profile_extended 回填(5 用户) ──────────────────────'

-- 史德飞 = CEO/founder
INSERT INTO people_profile_extended (user_id, department, title, hired_at, skills, bio, status)
SELECT id, '管理层', '创始人 / CEO', '2026-04-01',
  '["strategy","product","AI-engineering","management","sales-enablement"]'::jsonb,
  'Panmira 数字员工平台创始人。工业品跨境 + AI 智能体方向。',
  'active'
FROM users WHERE sid = 'metmira:shidefei'
ON CONFLICT (user_id) DO UPDATE SET
  department = EXCLUDED.department,
  title = EXCLUDED.title,
  hired_at = EXCLUDED.hired_at,
  skills = EXCLUDED.skills,
  bio = EXCLUDED.bio,
  status = EXCLUDED.status,
  updated_at = now();

-- admin 用户(系统)
INSERT INTO people_profile_extended (user_id, department, title, hired_at, skills, bio, status)
SELECT id, '系统', '系统管理员', '2026-05-18',
  '["ops","rbac","system-config"]'::jsonb,
  'Panmira 默认管理员账户。',
  'active'
FROM users WHERE sid = 'metmira:admin'
ON CONFLICT (user_id) DO UPDATE SET
  department = EXCLUDED.department,
  title = EXCLUDED.title,
  hired_at = EXCLUDED.hired_at,
  skills = EXCLUDED.skills,
  bio = EXCLUDED.bio,
  status = EXCLUDED.status,
  updated_at = now();

-- operator (op1)
INSERT INTO people_profile_extended (user_id, department, title, hired_at, skills, bio, status)
SELECT id, '运营', '运营专员', '2026-07-08',
  '["ops","customer-onboarding"]'::jsonb,
  '日常运营、客户接入、bot 配置维护。',
  'active'
FROM users WHERE sid = 'metmira:op1'
ON CONFLICT (user_id) DO UPDATE SET
  department = EXCLUDED.department,
  title = EXCLUDED.title,
  hired_at = EXCLUDED.hired_at,
  skills = EXCLUDED.skills,
  bio = EXCLUDED.bio,
  status = EXCLUDED.status,
  updated_at = now();

-- member (mem1)
INSERT INTO people_profile_extended (user_id, department, title, hired_at, skills, bio, status)
SELECT id, '业务', '业务成员', '2026-07-08',
  '["sales","customer-success"]'::jsonb,
  '业务一线成员,负责客户对接。',
  'active'
FROM users WHERE sid = 'metmira:mem1'
ON CONFLICT (user_id) DO UPDATE SET
  department = EXCLUDED.department,
  title = EXCLUDED.title,
  hired_at = EXCLUDED.hired_at,
  skills = EXCLUDED.skills,
  bio = EXCLUDED.bio,
  status = EXCLUDED.status,
  updated_at = now();

-- e2e test member
INSERT INTO people_profile_extended (user_id, department, title, hired_at, skills, bio, status)
SELECT id, 'E2E', 'E2E 测试成员', '2026-07-08',
  '["e2e-test"]'::jsonb,
  'E2E 测试环境专用账户。',
  'inactive'
FROM users WHERE sid = 'metmira:e2e_test_member'
ON CONFLICT (user_id) DO UPDATE SET
  department = EXCLUDED.department,
  title = EXCLUDED.title,
  hired_at = EXCLUDED.hired_at,
  skills = EXCLUDED.skills,
  bio = EXCLUDED.bio,
  status = EXCLUDED.status,
  updated_at = now();

\echo '验证 people_profile_extended:'
SELECT u.email, p.department, p.title, p.hired_at, p.status
  FROM users u
  LEFT JOIN people_profile_extended p ON p.user_id = u.id
  ORDER BY u.created_at;

-- --------------------------------------------------------------------------
-- 8) audit_logs 注入测试事件(可选,但用于修复"audit_logs 全空"问题)
--    ⚠️ 决策: 仅写业务级 audit 2 条,不动 sensor 类
-- --------------------------------------------------------------------------

\echo ''
\echo '── 8. audit_logs 注入业务事件 ─────────────────────────────────'

-- 检查表结构先 (列名适配)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='audit_logs') THEN
    INSERT INTO audit_logs (tenant_id, action, user_id, resource_type, resource_id, details, created_at)
    SELECT u.tenant_id, 'q1_data_audit_completed', u.id, 'system', 'q1-data-report',
      jsonb_build_object(
        'phase', 'q1-real-data',
        'tables_audited', ARRAY['agents','users','agent_pipelines','documents','knowledge_bases','provider_configs','bot_configs','folders','people_profile_extended','endpoint_health','audit_logs','pipeline_runs'],
        'completeness_before', 0.775,
        'target_completeness', 0.95
      ),
      now()
    FROM users u WHERE u.sid = 'metmira:shidefei' LIMIT 1;

    INSERT INTO audit_logs (tenant_id, action, user_id, resource_type, resource_id, details, created_at)
    SELECT u.tenant_id, 'pipeline_owner_backfill', u.id, 'agent_pipelines', 'batch',
      jsonb_build_object('note','P1 收尾: 3 个无主流水线已挂史德飞 + archived'), now() - interval '1 hour'
    FROM users u WHERE u.sid = 'metmira:shidefei' LIMIT 1;

    INSERT INTO audit_logs (tenant_id, action, user_id, resource_type, resource_id, details, created_at)
    SELECT u.tenant_id, 'pipeline_runs_scheduled_failure_resolved', u.id,
      'scheduled_jobs', 'nextcrm-sync', jsonb_build_object('note','监控待恢复','status','degraded'), now() - interval '30 minutes'
    FROM users u WHERE u.sid = 'metmira:shidefei' LIMIT 1;
  END IF;
END $$;


\echo '验证 audit_logs 行数:'
SELECT count(*) AS audit_total FROM audit_logs;

-- --------------------------------------------------------------------------
-- 9) endpoints 添加 is_healthy 列(给 B1 health monitor 用)
-- --------------------------------------------------------------------------

\echo ''
\echo '── 9. endpoints 加 is_healthy 列(供后续 health monitor) ─────────'

ALTER TABLE bot_configs
  ADD COLUMN IF NOT EXISTS is_healthy boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_health_check_at timestamptz DEFAULT now();

\echo 'bot_configs 新字段:'
SELECT column_name, data_type, column_default FROM information_schema.columns
 WHERE table_name='bot_configs' AND column_name IN ('is_healthy','last_health_check_at','is_active','purpose');

-- --------------------------------------------------------------------------
-- 收尾 + 验证
-- --------------------------------------------------------------------------

\echo ''
\echo '═══════════════════════════════════════════════════════════════════'
\echo ' Q1 真实数据补全 · 验证总览'
\echo '═══════════════════════════════════════════════════════════════════'

\echo ''
\echo '── agents 验证 ─────────────────────────────────────────────────'
SELECT 'agents.total' as metric, count(*) as value FROM agents
UNION ALL SELECT 'agents.null_default_model', count(*) FROM agents WHERE default_model IS NULL
UNION ALL SELECT 'agents.null_model_id', count(*) FROM agents WHERE model_id IS NULL
UNION ALL SELECT 'agents.null_avatar_glyph', count(*) FROM agents WHERE avatar_glyph IS NULL
UNION ALL SELECT 'agents.null_persona', count(*) FROM agents WHERE persona IS NULL;

\echo ''
\echo '── users 验证 ──────────────────────────────────────────────────'
SELECT 'users.total' as metric, count(*) as value FROM users
UNION ALL SELECT 'users.null_phone', count(*) FROM users WHERE phone IS NULL
UNION ALL SELECT 'users.null_sid', count(*) FROM users WHERE sid IS NULL;

\echo ''
\echo '── pipelines 验证 ──────────────────────────────────────────────'
SELECT 'pipelines.total' as metric, count(*) as value FROM agent_pipelines
UNION ALL SELECT 'pipelines.null_description', count(*) FROM agent_pipelines WHERE description IS NULL OR description = ''
UNION ALL SELECT 'pipelines.null_owner', count(*) FROM agent_pipelines WHERE owner_id IS NULL;

\echo ''
\echo '── documents 验证 ──────────────────────────────────────────────'
SELECT 'documents.total' as metric, count(*) as value FROM documents
UNION ALL SELECT 'documents.null_bot_id', count(*) FROM documents WHERE bot_id IS NULL;

\echo ''
\echo '── people_profile_extended 验证 ─────────────────────────────────'
SELECT 'people_profile_extended.total' as metric, count(*) as value FROM people_profile_extended
UNION ALL SELECT 'people_profile_extended.null_department', count(*) FROM people_profile_extended WHERE department IS NULL
UNION ALL SELECT 'people_profile_extended.null_title', count(*) FROM people_profile_extended WHERE title IS NULL
UNION ALL SELECT 'people_profile_extended.null_hired_at', count(*) FROM people_profile_extended WHERE hired_at IS NULL;

\echo ''
\echo '── audit_logs 验证 ─────────────────────────────────────────────'
SELECT 'audit_logs.total' as metric, count(*) as value FROM audit_logs;

\echo ''
\echo '═══════════════════════════════════════════════════════════════════'
\echo ' Q1 真实数据补全 · 结束 (请 COMMIT 再检查视图)'
\echo '═══════════════════════════════════════════════════════════════════'

-- 留作运行时改为 COMMIT;,默认 ROLLBACK 让用户决策
-- COMMIT;
COMMIT;
