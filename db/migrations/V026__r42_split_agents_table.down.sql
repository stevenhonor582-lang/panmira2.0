-- V026 down: 回退 R42-SCHEMA 拆表
-- WARNING: 回退后 6 个 agent 记录将全部回到单一 agents 表 (is_template=true),
--          agent_templates 内容丢失, target_type 列数据丢失 (因 agents 表无此字段)
--          R42-ROUTES / R42-FRONTEND 改过的代码必须同步回退

BEGIN;

-- 1. 重建 agents 表 (与 V023 一致 + 包含历史 R33/R34/R36/R38 字段)
CREATE TABLE agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id),
  name varchar(255) NOT NULL,
  role_template varchar(255),
  description text,
  system_prompt text,
  capabilities jsonb DEFAULT '[]'::jsonb,
  tools jsonb DEFAULT '[]'::jsonb,
  is_active boolean DEFAULT true,
  category varchar(255) DEFAULT 'general',
  template_type varchar(255) DEFAULT 'custom',
  source_template_id uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  knowledge_folders jsonb DEFAULT '[]'::jsonb,
  skills jsonb DEFAULT '[]'::jsonb,
  orchestration jsonb DEFAULT '{}'::jsonb,
  boundary jsonb DEFAULT '{}'::jsonb,
  iron_laws jsonb DEFAULT '[]'::jsonb,
  version integer DEFAULT 1,
  display_name text,
  default_engine varchar(50) DEFAULT 'claude',
  default_model varchar(100),
  default_context_window integer DEFAULT 200000,
  default_max_turns integer,
  complexity_level varchar(20) DEFAULT 'L1',
  engine text DEFAULT 'anthropic-opus-4-7',
  deployment_type varchar(30) DEFAULT 'bot',
  persona text,
  avatar_url text,
  status varchar(20) DEFAULT 'active' NOT NULL,
  model_id text,
  owner_user_id uuid REFERENCES users(id),
  avatar_glyph text,
  avatar_hue text,
  is_template boolean NOT NULL DEFAULT false,
  working_dir text,
  channel_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
  visibility varchar(20) DEFAULT 'team' NOT NULL,
  temperature double precision DEFAULT 0.7 NOT NULL
);

-- 2. 数据回灌 (6 个 instance → 6 个 is_template=true 的 agent)
INSERT INTO agents (
  id, tenant_id, name, role_template, description, capabilities, tools, persona, system_prompt,
  orchestration, boundary, iron_laws, category, template_type,
  channel_ids, owner_user_id, working_dir,
  default_engine, default_model, model_id, default_context_window, default_max_turns,
  complexity_level, status, deployment_type, temperature, visibility,
  avatar_url, avatar_glyph, avatar_hue, display_name, is_active, created_at, updated_at
)
SELECT
  id, tenant_id, name, role_template, description, capabilities, tools, persona, system_prompt,
  orchestration, boundary, iron_laws, category, template_type,
  channel_ids, owner_user_id, working_dir,
  default_engine, default_model, model_id, default_context_window, default_max_turns,
  complexity_level, status, deployment_type, temperature, visibility,
  avatar_url, avatar_glyph, avatar_hue, display_name, is_active, created_at, updated_at
FROM agent_instances;
UPDATE agents SET is_template = true;  -- R42 决策: 6 个全当 template

-- 3. 删 FK 约束
ALTER TABLE agent_instances DROP CONSTRAINT IF EXISTS agent_instances_source_template_id_fkey;
ALTER TABLE bot_configs DROP CONSTRAINT IF EXISTS bot_configs_agent_id_fkey;
ALTER TABLE user_agent_bindings DROP CONSTRAINT IF EXISTS fk_uab_agent;
ALTER TABLE memories DROP CONSTRAINT IF EXISTS memories_agent_id_fkey;
ALTER TABLE folders DROP CONSTRAINT IF EXISTS folders_agent_id_fkey;
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_agent_id_fkey;
ALTER TABLE bot_agent_history DROP CONSTRAINT IF EXISTS bot_agent_history_agent_id_fkey;

-- 4. FK 改回指 agents
ALTER TABLE bot_configs ADD CONSTRAINT bot_configs_agent_id_fkey
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL;
ALTER TABLE user_agent_bindings ADD CONSTRAINT fk_uab_agent
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE;
ALTER TABLE memories ADD CONSTRAINT memories_agent_id_fkey
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL;
ALTER TABLE folders ADD CONSTRAINT folders_agent_id_fkey
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL;
ALTER TABLE documents ADD CONSTRAINT documents_agent_id_fkey
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL;
ALTER TABLE bot_agent_history ADD CONSTRAINT bot_agent_history_agent_id_fkey
  FOREIGN KEY (agent_id) REFERENCES agents(id);

-- 5. 重建 agent_mcp_refs FK (无 target_type 字段了, 用单 FK)
ALTER TABLE agent_mcp_refs ADD CONSTRAINT agent_mcp_refs_agent_id_fkey
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE;

-- 6. 删 target_type 列 + 关联表数据可能丢 (用户必须重跑关联数据恢复脚本)
ALTER TABLE agent_skill_refs DROP COLUMN IF EXISTS target_type;
ALTER TABLE agent_knowledge_refs DROP COLUMN IF EXISTS target_type;
ALTER TABLE agent_mcp_refs DROP COLUMN IF EXISTS target_type;

-- 7. 删 is_system 字段
ALTER TABLE users DROP COLUMN IF EXISTS is_system;

-- 8. 删 agent_instances / agent_templates
DROP TABLE IF EXISTS agent_instances;
DROP TABLE IF EXISTS agent_templates;

-- 9. 删 target_type 枚举
DROP TYPE IF EXISTS target_type;

-- 10. (可选) 重建 digital_employees 视图 (用 agents 表)
--     实际生产回退时建议先确认 R42-ROUTES 已回退, 否则此 view 是死重
-- CREATE VIEW digital_employees AS SELECT * FROM agents WHERE status::text <> 'deprecated'::text;

COMMIT;
