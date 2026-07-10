-- V026: R42-SCHEMA 物理拆表 agents → agent_templates + agent_instances
-- Date: 2026-07-10
-- Pre-backup: /home/ubuntu/r42-pre-split-backup.sql
--
-- 决策(用户拍板):
-- 1. 命名: agent_templates + agent_instances (复数)
-- 2. 关联表加 target_type enum ('template' | 'instance')
-- 3. 硬切, 不留 UNION 视图, 删 digital_employees 视图
-- 4. is_template 字段彻底删除
-- 5. 6 个现有 agent 全转 instance
-- 6. R42-ROUTES 阶段改路由, R42-FRONTEND 改前端
--
-- 注: model_id 是 text(非 uuid), 因为 provider_configs.id 是 text 类型
-- 注: audit_logs.agent_id 没有 FK 约束(只是列), 无需迁移
-- 注: bot_agent_history 不在用户 spec 中但有 FK 约束, 同样改指 agent_instances
-- 注: agent_mcp_refs.agent_id 的 FK 删除(因 polymorphic target_type 取代单 FK)

BEGIN;

-- 1. 枚举
CREATE TYPE target_type AS ENUM ('template', 'instance');

-- 2. 蓝图表 (agent_templates)
CREATE TABLE agent_templates (
  id uuid PRIMARY KEY,
  tenant_id uuid REFERENCES tenants(id),
  name varchar(255) NOT NULL,
  role_template varchar(255),
  description text,
  capabilities jsonb DEFAULT '[]'::jsonb,
  tools jsonb DEFAULT '[]'::jsonb,
  persona text,
  system_prompt text,
  orchestration jsonb DEFAULT '{}'::jsonb,
  boundary jsonb DEFAULT '{}'::jsonb,
  iron_laws jsonb DEFAULT '[]'::jsonb,
  category varchar(255),
  template_type varchar(255),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES users(id)
);

-- 3. 实例表 (agent_instances) = 蓝图字段 + 全字段
CREATE TABLE agent_instances (
  id uuid PRIMARY KEY,
  tenant_id uuid REFERENCES tenants(id),
  name varchar(255) NOT NULL,
  role_template varchar(255),
  description text,
  capabilities jsonb DEFAULT '[]'::jsonb,
  tools jsonb DEFAULT '[]'::jsonb,
  persona text,
  system_prompt text,
  orchestration jsonb DEFAULT '{}'::jsonb,
  boundary jsonb DEFAULT '{}'::jsonb,
  iron_laws jsonb DEFAULT '[]'::jsonb,
  category varchar(255),
  template_type varchar(255),
  source_template_id uuid,
  channel_ids jsonb DEFAULT '[]'::jsonb,
  owner_user_id uuid REFERENCES users(id),
  working_dir text,
  default_engine varchar(64),
  default_model varchar(128),
  model_id text,
  default_context_window integer,
  default_max_turns integer,
  complexity_level varchar(20),
  status varchar(20) DEFAULT 'active' NOT NULL,
  deployment_type varchar(30),
  temperature double precision DEFAULT 0.7 NOT NULL,
  visibility varchar(20) DEFAULT 'team' NOT NULL,
  avatar_url text,
  avatar_glyph text,
  avatar_hue text,
  display_name text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES users(id)
);

-- 4. 关联表加 target_type 列 (默认 'instance' 因为迁移前都是 instance-pointer)
ALTER TABLE agent_skill_refs ADD COLUMN target_type target_type NOT NULL DEFAULT 'instance';
ALTER TABLE agent_knowledge_refs ADD COLUMN target_type target_type NOT NULL DEFAULT 'instance';
ALTER TABLE agent_mcp_refs ADD COLUMN target_type target_type NOT NULL DEFAULT 'instance';

-- 5. users 加 is_system 字段
ALTER TABLE users ADD COLUMN is_system boolean NOT NULL DEFAULT false;
UPDATE users SET is_system = true WHERE sid = 'MS-GSGNQP' AND name = '管理员';

-- 6. 数据迁移: 6 个 agent 全转 instance
INSERT INTO agent_instances (
  id, tenant_id, name, role_template, description, capabilities, tools, persona, system_prompt,
  orchestration, boundary, iron_laws, category, template_type,
  source_template_id, channel_ids, owner_user_id, working_dir,
  default_engine, default_model, model_id, default_context_window, default_max_turns,
  complexity_level, status, deployment_type, temperature, visibility,
  avatar_url, avatar_glyph, avatar_hue, display_name, is_active, created_at, updated_at
)
SELECT
  id, tenant_id, name, role_template, description, capabilities, tools, persona, system_prompt,
  orchestration, boundary, iron_laws, category, template_type,
  source_template_id, channel_ids, owner_user_id, working_dir,
  default_engine, default_model, model_id, default_context_window, default_max_turns,
  complexity_level, status, deployment_type, temperature, visibility,
  avatar_url, avatar_glyph, avatar_hue, display_name, is_active, created_at, updated_at
FROM agents;

-- 6.1 清空 source_template_id (6 个老 agents 都是 is_template=true 顶层模板, 不是从某模板派生的实例)
UPDATE agent_instances SET source_template_id = NULL;

-- 7. 删旧 FK 约束
ALTER TABLE bot_configs DROP CONSTRAINT IF EXISTS bot_configs_agent_id_fkey;
ALTER TABLE user_agent_bindings DROP CONSTRAINT IF EXISTS fk_uab_agent;
ALTER TABLE memories DROP CONSTRAINT IF EXISTS memories_agent_id_fkey;
ALTER TABLE folders DROP CONSTRAINT IF EXISTS folders_agent_id_fkey;
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_agent_id_fkey;
ALTER TABLE bot_agent_history DROP CONSTRAINT IF EXISTS bot_agent_history_agent_id_fkey;
ALTER TABLE agent_mcp_refs DROP CONSTRAINT IF EXISTS agent_mcp_refs_agent_id_fkey;

-- 8. 加新 FK 指向 agent_instances
ALTER TABLE bot_configs ADD CONSTRAINT bot_configs_agent_id_fkey
  FOREIGN KEY (agent_id) REFERENCES agent_instances(id) ON DELETE SET NULL;
ALTER TABLE user_agent_bindings ADD CONSTRAINT fk_uab_agent
  FOREIGN KEY (agent_id) REFERENCES agent_instances(id) ON DELETE CASCADE;
ALTER TABLE memories ADD CONSTRAINT memories_agent_id_fkey
  FOREIGN KEY (agent_id) REFERENCES agent_instances(id) ON DELETE SET NULL;
ALTER TABLE folders ADD CONSTRAINT folders_agent_id_fkey
  FOREIGN KEY (agent_id) REFERENCES agent_instances(id) ON DELETE SET NULL;
ALTER TABLE documents ADD CONSTRAINT documents_agent_id_fkey
  FOREIGN KEY (agent_id) REFERENCES agent_instances(id) ON DELETE SET NULL;
ALTER TABLE bot_agent_history ADD CONSTRAINT bot_agent_history_agent_id_fkey
  FOREIGN KEY (agent_id) REFERENCES agent_instances(id) ON DELETE CASCADE;

-- 8.1 agent_instances.source_template_id → agent_templates.id
ALTER TABLE agent_instances ADD CONSTRAINT agent_instances_source_template_id_fkey
  FOREIGN KEY (source_template_id) REFERENCES agent_templates(id) ON DELETE SET NULL;

-- 9. 删 digital_employees 视图 (硬切, 路由层 R42-ROUTES 改用 agent_instances)
DROP VIEW IF EXISTS digital_employees;

-- 10. 删旧 agents 表
DROP TABLE agents;

COMMIT;
