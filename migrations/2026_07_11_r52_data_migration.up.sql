-- ============================================================================
-- R52-MIGRATE · 2026-07-11 · 数据迁移(数字HR 重构收尾)
-- ----------------------------------------------------------------------------
-- 背景:R52 将 agent_templates / agent_instances 双表分离
--      每条 instance 必须能追溯到 1 个 source_template(数字HR / 蓝图)
--      现有 instance 中有 10 条 source_template_id IS NULL
--      1 条历史 R42X 测试 template(R42X-test-del-tpl2)关联了 1 instance
--
-- 目标:
--   1. 注入 1 条 system-source "通用HR" 模板(UUID 固定,幂等)
--   2. 把 source_template_id IS NULL 的 instance 全部挂到这个通用HR
--   3. 历史 R42X 测试 template 标 is_active=false 归档(不删,保留审计)
--   4. 这一步不依赖 R52-SCHEMA:agent_instances.source_template_id 当前是 NULLABLE
--      (R52-SCHEMA 后续会加 NOT NULL,本迁移为它做了前置回填)
--
-- 幂等:三次执行不重复插入 / 不重复回填 / 不重复归档
-- 回滚:见 .down.sql(反向操作,数据可恢复)
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_default_tenant UUID := '491c000f-7e34-4a6e-a561-d8a948c6e429';
  v_system_hr_id  UUID := '00000000-0000-0000-0000-000000000001';
  v_existing_tpl_name TEXT;
BEGIN
  -- ===========================
  -- Step 1: 注入"通用HR" system 模板
  -- 幂等:ON CONFLICT (id) DO NOTHING(UUID 固定)
  -- ===========================
  INSERT INTO agent_templates (
    id, tenant_id, name, role_template, description,
    category, template_type,
    capabilities, tools, persona, system_prompt,
    orchestration, boundary, iron_laws,
    is_active, created_at, updated_at
  ) VALUES (
    v_system_hr_id,
    v_default_tenant,
    '通用员工(系统默认)',
    'generalist',
    'R52 系统注入的兜底 HR。任何 instance 创建时未指定 source_template,默认挂这个。\n- role_template: generalist\n- 用途:兜底,通常被 admin 后续升级到具体模板',
    '通用',
    'standard',
    '[]'::jsonb,
    '[]'::jsonb,
    '通用型数字员工,适合不确定具体岗位时的占位角色',
    '你是一名通用型数字员工。在没有被委派具体岗位前,你应该:(1) 待命接收任务 (2) 主动询问上下文 (3) 保持可解释、可观测的工作方式。',
    '{}'::jsonb,
    '{}'::jsonb,
    '[]'::jsonb,
    true,
    now(),
    now()
  )
  ON CONFLICT (id) DO NOTHING;

  -- 防御:这 UUID 已经被占用了(不是 system 模板),就报错让人修
  SELECT name INTO v_existing_tpl_name
    FROM agent_templates
   WHERE id = v_system_hr_id;
  IF v_existing_tpl_name IS NOT NULL AND v_existing_tpl_name <> '通用员工(系统默认)' THEN
    RAISE EXCEPTION 'UUID % 已被非 system 模板 (%) 占用,请调整 v_system_hr_id', v_system_hr_id, v_existing_tpl_name;
  END IF;

  -- ===========================
  -- Step 2: 回填 agent_instances.source_template_id IS NULL → 通用HR
  -- 只动 NULL 的行,不覆盖手动分配的行(如 R42X-test-inst)
  -- ===========================
  UPDATE agent_instances
     SET source_template_id = v_system_hr_id,
         updated_at = now()
   WHERE source_template_id IS NULL
     AND status <> 'deprecated';

  -- ===========================
  -- Step 3: 历史 R42X 测试 template 归档
  -- 不删(保留审计链),只标 is_active=false
  -- ===========================
  UPDATE agent_templates
     SET is_active = false,
         updated_at = now()
   WHERE name = 'R42X-test-del-tpl2'
     AND is_active = true;
END $$;

COMMIT;

-- 验证输出(供 psql 直接看)
SELECT
  (SELECT count(*) FROM agent_templates)                                  AS templates_total,
  (SELECT count(*) FROM agent_templates WHERE is_active)                  AS templates_active,
  (SELECT count(*) FROM agent_templates WHERE id = '00000000-0000-0000-0000-000000000001') AS system_hr_present,
  (SELECT count(*) FROM agent_instances)                                  AS instances_total,
  (SELECT count(*) FROM agent_instances WHERE source_template_id IS NOT NULL) AS instances_with_hr,
  (SELECT count(*) FROM agent_instances WHERE source_template_id = '00000000-0000-0000-0000-000000000001') AS instances_linked_to_system_hr,
  (SELECT count(*) FROM agent_instances WHERE source_template_id IS NULL AND status <> 'deprecated') AS orphans_remaining;
