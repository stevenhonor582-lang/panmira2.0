-- ═══════════════════════════════════════════════════════════
-- R27 Agent 新建与权限归属规则
-- 规则 1: 实例间 name 唯一(模板可以同名,实例之间不重名)
-- ═══════════════════════════════════════════════════════════
BEGIN;

-- 安全检查:应用约束前,先看有没有已存在的实例重名(不自动修复,只报告)
DO $$
DECLARE
  dup_count integer;
BEGIN
  SELECT count(*) INTO dup_count
  FROM (
    SELECT name FROM agents WHERE is_template = false GROUP BY name HAVING count(*) > 1
  ) t;
  IF dup_count > 0 THEN
    RAISE NOTICE '发现 % 个实例间重名 name,已跳过唯一约束创建 — 请先手动处理', dup_count;
  END IF;
END $$;

-- 实例间 name 唯一(部分唯一索引:只对 is_template=false 生效)
-- IF NOT EXISTS 保证可重复执行
CREATE UNIQUE INDEX IF NOT EXISTS uq_agents_name_instance
  ON agents(name)
  WHERE is_template = false;

COMMIT;
