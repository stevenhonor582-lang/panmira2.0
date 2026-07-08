-- R13-D: 任务深化 — 模板 + 协作者
-- 向后兼容: 只加字段, 不改老 schema
BEGIN;

ALTER TABLE agent_pipelines
  ADD COLUMN IF NOT EXISTS is_template boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS collaborators uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS template_category varchar(40),
  ADD COLUMN IF NOT EXISTS parent_template_id uuid;

-- 模板快速过滤
CREATE INDEX IF NOT EXISTS idx_agent_pipelines_is_template
  ON agent_pipelines(is_template) WHERE is_template = true;

-- 协作者反查 (某员工参与哪些任务)
CREATE INDEX IF NOT EXISTS idx_agent_pipelines_collaborators
  ON agent_pipelines USING gin (collaborators);

-- 模板派生关系
CREATE INDEX IF NOT EXISTS idx_agent_pipelines_parent_template
  ON agent_pipelines(parent_template_id) WHERE parent_template_id IS NOT NULL;

COMMIT;
