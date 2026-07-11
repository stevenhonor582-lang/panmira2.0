-- R55-B · 测试类数据清理验证 · 2026-07-11
--
-- 背景:R55-D 4.1 已删所有测试类数字员工实例,R53-T3 已归档老模板。
-- R55-B 2.6 任务:确认现状 + 主动防御(再次确认无残留)。
--
-- 用户原话:"全部测试类一并清除"
-- 范围(精准,不动真岗位):
--   - agent_templates.name 含 Bot / R42X / R52-test / e2e / fixture / 测试
--   - agent_instances.name 同上
--   - 真岗位("测试"业务部门里的 API 测试员 / 嵌入式测试工程师 / 测试结果分析师 / 渗透测试员)不动 — 它们是 R52/R53 seed
--
-- 本文件是 verification + safety net,无 destructive 操作:
--   1. 当前状态盘点(SELECT only)
--   2. 防御 SQL — 若有任何 active 测试数据被漏掉,归档而非删除(避免破坏 FK)

BEGIN;

-- ────────────────────────────────────────────
-- 1. 当前状态盘点 (SELECT)
-- ────────────────────────────────────────────

-- 模板 (R52/R53 seed 应有 266 active)
-- SELECT count(*) FROM agent_templates WHERE is_active=true;        -- 期望 266
-- SELECT count(*) FROM agent_templates WHERE is_active=false;       -- 期望 8 (auto-backfill-R52 + 通用员工)

-- 测试类模板 (应全 inactive)
-- SELECT count(*) FROM agent_templates
--   WHERE name ~* 'Bot|R42X|R52-test|e2e|fixture';                  -- 期望 0 active

-- auto-backfill 老模板 (应全 inactive)
-- SELECT count(*) FROM agent_templates
--   WHERE name LIKE '%auto-backfill%' AND is_active=true;           -- 期望 0

-- 真岗位("测试"业务部门)— R52/R53 seed, 不动
-- SELECT count(*) FROM agent_templates
--   WHERE category='测试' AND is_active=true;                        -- 期望 >= 3 (API测试员 / 嵌入式测试工程师 / 测试结果分析师)

-- 实例测试数据 (应全空)
-- SELECT count(*) FROM agent_instances
--   WHERE name ~* 'Bot|R42X|R52-test|e2e|fixture';                  -- 期望 0

-- ────────────────────────────────────────────
-- 2. 防御 SQL — 主动归档所有"测试 like"模板 (若 active, 标 inactive)
--    用 UPDATE 是因为用户要求"全部测试类一并清除",
--    DELETE 会触发 RESTRICT FK (有真实例引用), 改用 is_active=false 更安全
-- ────────────────────────────────────────────

UPDATE agent_templates
   SET is_active = false,
       updated_at = now()
 WHERE is_active = true
   AND (
     name ~* 'Bot|R42X|R52-test|e2e|fixture|auto-backfill'
     OR name LIKE '%auto-backfill-R52%'
   );
-- 影响行数:0 (已在 R53-T3 归档,本语句是 safety net)

COMMIT;

-- ────────────────────────────────────────────
-- 验证 (commit 后跑):
-- ────────────────────────────────────────────
-- SELECT count(*) FROM agent_templates WHERE is_active=true;       -- 期望 266
-- SELECT count(*) FROM agent_templates WHERE is_active=false;      -- 期望 8
-- SELECT count(*) FROM agent_templates WHERE category='测试' AND is_active=true;  -- 期望 >= 3 (真岗位保留)
