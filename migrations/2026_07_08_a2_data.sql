-- ============================================================================
-- panmira A2 — 数据再分配 + sid 编号 + 完整性约束
-- 2026-07-08
--
-- 背景:
--   - IA v6 已就绪 (people/digital_employees/model_pool/endpoints views)
--   - A1 已加 users.phone/sid/verification/lock 字段 + admin sid=metmira:admin
--   - 本脚本: agents / agent_pipelines / documents / bot_configs 补字段+回填
--   - 不动已存在的 4 view 和 2 新表
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. agents — 数字员工字段补全 + status 三态
-- ---------------------------------------------------------------------------

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS persona text,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS status varchar(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','paused','deprecated'));

CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status) WHERE status <> 'deprecated';

-- 回填: 老 agents 按 is_active 决定 status
UPDATE agents
   SET status = CASE WHEN is_active THEN 'active' ELSE 'deprecated' END
 WHERE status IS DISTINCT FROM (CASE WHEN is_active THEN 'active' ELSE 'deprecated' END);

-- 回填 avatar_url: 用 display_name 前缀做 emoji fallback, 给前端占位用
UPDATE agents
   SET avatar_url = COALESCE(avatar_url,
     CASE
       WHEN display_name LIKE '不盈%' THEN '/avatars/buying.svg'
       WHEN display_name LIKE '守静%' THEN '/avatars/shoujing.svg'
       WHEN display_name LIKE '信言%' THEN '/avatars/xinyan.svg'
       WHEN display_name LIKE '得一%' THEN '/avatars/deyi.svg'
       WHEN display_name LIKE '玄鉴%' THEN '/avatars/xuanjian.svg'
       WHEN display_name LIKE '墨言%' THEN '/avatars/moyan.svg'
       ELSE '/avatars/default.svg'
     END)
 WHERE avatar_url IS NULL;

-- 回填 persona: 缺失就拿 description 顶上, 给前端展示用
UPDATE agents
   SET persona = COALESCE(persona, LEFT(COALESCE(description,''), 240))
 WHERE persona IS NULL OR persona = '';


-- ---------------------------------------------------------------------------
-- 2. agent_pipelines — 状态/所有者补字段 (别名 owner_id 指向 created_by)
-- ---------------------------------------------------------------------------

ALTER TABLE agent_pipelines
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status varchar(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','paused','archived'));

CREATE INDEX IF NOT EXISTS idx_agent_pipelines_owner ON agent_pipelines(owner_id);
CREATE INDEX IF NOT EXISTS idx_agent_pipelines_status ON agent_pipelines(status);

-- 回填 owner_id = created_by (历史已经这样挂)
UPDATE agent_pipelines
   SET owner_id = created_by
 WHERE owner_id IS NULL AND created_by IS NOT NULL;

-- 回填 status: enabled=true 视作 active, 否则 archived
UPDATE agent_pipelines
   SET status = CASE WHEN enabled THEN 'active' ELSE 'archived' END
 WHERE status IS DISTINCT FROM (CASE WHEN enabled THEN 'active' ELSE 'archived' END);


-- ---------------------------------------------------------------------------
-- 3. documents — module 枚举 (knowledge / feedback / log / other)
-- ---------------------------------------------------------------------------

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS module varchar(20) NOT NULL DEFAULT 'knowledge'
    CHECK (module IN ('knowledge','feedback','log','other'));

CREATE INDEX IF NOT EXISTS idx_documents_module ON documents(module);

-- 所有 2526 docs 标 knowledge (历史全是 KB 内容)
UPDATE documents
   SET module = 'knowledge'
 WHERE module IS DISTINCT FROM 'knowledge';


-- ---------------------------------------------------------------------------
-- 4. bot_configs — purpose 三态 (outbound / inbound / both)
-- ---------------------------------------------------------------------------

ALTER TABLE bot_configs
  ADD COLUMN IF NOT EXISTS purpose varchar(20) NOT NULL DEFAULT 'outbound'
    CHECK (purpose IN ('outbound','inbound','both'));

CREATE INDEX IF NOT EXISTS idx_bot_configs_purpose ON bot_configs(purpose);

-- 默认所有 feishu bots 视为 outbound (我们接飞书发消息给用户)
UPDATE bot_configs
   SET purpose = 'outbound'
 WHERE purpose IS DISTINCT FROM 'outbound';


-- ---------------------------------------------------------------------------
-- 5. 数字员工 → model_id 软引用 (现有 default_model 字段, 这里补一列统一外键)
--    留 nullable 兼容老 agent, 让前端按 default_model 字符串渲染
-- ---------------------------------------------------------------------------

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS model_id text REFERENCES provider_configs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_agents_model ON agents(model_id);


-- ---------------------------------------------------------------------------
-- 6. 验证报表 (写进 _migration_log 供 A2 脚本读取)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_agents INT; v_users INT; v_pipelines INT; v_documents INT; v_bot_configs INT;
  v_de INT; v_people INT; v_mp INT; v_ep INT;
BEGIN
  SELECT count(*) INTO v_agents FROM agents;
  SELECT count(*) INTO v_users FROM users;
  SELECT count(*) INTO v_pipelines FROM agent_pipelines;
  SELECT count(*) INTO v_documents FROM documents;
  SELECT count(*) INTO v_bot_configs FROM bot_configs;

  SELECT count(*) INTO v_de FROM digital_employees;
  SELECT count(*) INTO v_people FROM people;
  SELECT count(*) INTO v_mp FROM model_pool;
  SELECT count(*) INTO v_ep FROM endpoints;

  INSERT INTO _migration_log(migration_name, details) VALUES (
    '2026_07_08_a2_data',
    jsonb_build_object(
      'description', 'A2: data migration (agents.status, pipelines.status/owner_id, documents.module, bot_configs.purpose)',
      'agents', v_agents,
      'users', v_users,
      'agent_pipelines', v_pipelines,
      'documents', v_documents,
      'bot_configs', v_bot_configs,
      'view_digital_employees', v_de,
      'view_people', v_people,
      'view_model_pool', v_mp,
      'view_endpoints', v_ep
    )
  );
END $$;

COMMIT;
