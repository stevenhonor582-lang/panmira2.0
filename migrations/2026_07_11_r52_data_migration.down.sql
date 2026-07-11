-- ============================================================================
-- R52-MIGRATE · 2026-07-11 · 数据迁移 REVERSE(回滚到迁移前)
-- ----------------------------------------------------------------------------
-- 与 .up.sql 完全镜像。回滚后:
--   1. 系统通用HR 模板被删除
--   2. 之前回填的 10 条 instance 的 source_template_id 会被清回 NULL
--      (因为不可逆还原回哪个原模板,所以"回滚 = 清 NULL")
--      R42X-test-inst 那条历史链接保留(本来就不在回填范围)
--   3. R42X-test-del-tpl2 模板恢复 is_active=true
--
-- 注意:这是一次演示/应急回滚,生产环境的真实回滚应该用 pg_dump 备份
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_system_hr_id UUID := '00000000-0000-0000-0000-000000000001';
BEGIN
  -- ===========================
  -- Step 1 reverse: 清空被回填的 source_template_id
  -- 只清"挂的是 system HR"的行,保留用户手动关联(如 R42X-test-inst)
  -- ===========================
  UPDATE agent_instances
     SET source_template_id = NULL,
         updated_at = now()
   WHERE source_template_id = v_system_hr_id;

  -- ===========================
  -- Step 3 reverse: R42X 测试 template 恢复 active
  -- ===========================
  UPDATE agent_templates
     SET is_active = true,
         updated_at = now()
   WHERE name = 'R42X-test-del-tpl2';

  -- ===========================
  -- Step 1 reverse: 删 system HR
  -- ===========================
  DELETE FROM agent_templates WHERE id = v_system_hr_id;
END $$;

COMMIT;

-- 验证:回滚后应该看到 orphans 重新出现(不等于 0)
SELECT
  (SELECT count(*) FROM agent_templates)                                  AS templates_total,
  (SELECT count(*) FROM agent_templates WHERE is_active)                  AS templates_active,
  (SELECT count(*) FROM agent_templates WHERE id = '00000000-0000-0000-0000-000000000001') AS system_hr_present,
  (SELECT count(*) FROM agent_instances WHERE source_template_id IS NULL AND status <> 'deprecated') AS orphans_returned;
