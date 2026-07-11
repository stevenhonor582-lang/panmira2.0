-- R52-SCHEMA · HR(数字员工模板)/Instance 强约束重构
-- 决策(R52-REFACTOR-PLAN):
--   1. agent_templates 加 style/visibility/source 三字段(蓝图静态描述)
--   2. agent_instances.source_template_id 必填(强约束,无 HR 不能建实例)
--   3. agent_instances.source_type enum('system','custom') 默认 'system'
--   4. source_template_id FK 由 SET NULL 改 RESTRICT(禁止孤儿)
--   5. instance_to_hr 表(实例→HR 提炼关系)
--   6. 回填:11 个 NULL source_template_id 的 instance → 各建一份"自描述"模板
-- 严禁:不要碰 SEED/FRONTEND/MIGRATE agent 范围

BEGIN;

-- 1. agent_templates 加 style/visibility/source
ALTER TABLE agent_templates
  ADD COLUMN IF NOT EXISTS style text,
  ADD COLUMN IF NOT EXISTS visibility varchar(20) NOT NULL DEFAULT 'team',
  ADD COLUMN IF NOT EXISTS source varchar(20) NOT NULL DEFAULT 'system';

-- 1b. visibility CHECK 约束(若已存在则忽略)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'agent_templates_visibility_check'
  ) THEN
    ALTER TABLE agent_templates
      ADD CONSTRAINT agent_templates_visibility_check
      CHECK (visibility IN ('public', 'team', 'private'));
  END IF;
END $$;

-- 1c. source CHECK 约束
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'agent_templates_source_check'
  ) THEN
    ALTER TABLE agent_templates
      ADD CONSTRAINT agent_templates_source_check
      CHECK (source IN ('system', 'custom'));
  END IF;
END $$;

-- 2. agent_instances 加 source_type(默认 'system',与回填一致)
ALTER TABLE agent_instances
  ADD COLUMN IF NOT EXISTS source_type varchar(20) NOT NULL DEFAULT 'system';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'agent_instances_source_type_check'
  ) THEN
    ALTER TABLE agent_instances
      ADD CONSTRAINT agent_instances_source_type_check
      CHECK (source_type IN ('system', 'custom'));
  END IF;
END $$;

-- 3. 回填:11 个 NULL source_template_id 的 instance
DO $$
DECLARE
  rec RECORD;
  new_tpl_id uuid;
BEGIN
  FOR rec IN
    SELECT id, tenant_id, name, role_template, description, capabilities, tools,
           persona, system_prompt, category, template_type,
           orchestration, boundary, iron_laws, created_by
      FROM agent_instances
     WHERE source_template_id IS NULL
  LOOP
    INSERT INTO agent_templates (
      id, tenant_id, name, role_template, description, capabilities, tools,
      persona, system_prompt, category, template_type,
      orchestration, boundary, iron_laws, is_active,
      created_by, source, visibility
    ) VALUES (
      gen_random_uuid(), rec.tenant_id,
      rec.name || ' (auto-backfill-R52)',
      rec.role_template, rec.description,
      COALESCE(rec.capabilities, '[]'::jsonb),
      COALESCE(rec.tools, '[]'::jsonb),
      rec.persona, rec.system_prompt,
      COALESCE(rec.category, 'general'),
      COALESCE(rec.template_type, 'custom'),
      COALESCE(rec.orchestration, '{}'::jsonb),
      COALESCE(rec.boundary, '{}'::jsonb),
      COALESCE(rec.iron_laws, '[]'::jsonb),
      true,
      rec.created_by,
      'system',
      'private'
    )
    RETURNING id INTO new_tpl_id;

    UPDATE agent_instances
       SET source_template_id = new_tpl_id,
           source_type = 'system'
     WHERE id = rec.id;
  END LOOP;
END $$;

-- 4. 改 FK:RESTRICT(禁止孤儿)
ALTER TABLE agent_instances
  DROP CONSTRAINT IF EXISTS agent_instances_source_template_id_fkey;

ALTER TABLE agent_instances
  ADD CONSTRAINT agent_instances_source_template_id_fkey
  FOREIGN KEY (source_template_id)
  REFERENCES agent_templates(id)
  ON DELETE RESTRICT;

-- 5. source_template_id NOT NULL
ALTER TABLE agent_instances
  ALTER COLUMN source_template_id SET NOT NULL;

-- 6. instance_to_hr 表(实例→HR 提炼关系)
CREATE TABLE IF NOT EXISTS instance_to_hr (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL REFERENCES agent_instances(id) ON DELETE CASCADE,
  source_template_id uuid NOT NULL REFERENCES agent_templates(id) ON DELETE RESTRICT,
  new_template_id uuid NOT NULL REFERENCES agent_templates(id) ON DELETE CASCADE,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_ithr_instance ON instance_to_hr(instance_id);
CREATE INDEX IF NOT EXISTS idx_ithr_new_template ON instance_to_hr(new_template_id);

COMMIT;
