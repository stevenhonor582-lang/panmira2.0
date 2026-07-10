-- R48-W1 P1.4 bot_id NULL 治理
-- 改前:无 CHECK 约束,bot_id NULL 时 unique index 退化,允许重复
-- 改后:加 CHECK 约束 + 测试数据清理(用户授权)
-- 回滚见 scripts/r48/r48-p1-bot-id-null-rollback.sql

BEGIN;

-- 1. CHECK 约束:bot_id 必须非 NULL,除非已 invalidated
-- (兼容性:历史脏数据允许 invalidated_at NOT NULL 时 bot_id 仍 NULL)
ALTER TABLE memories DROP CONSTRAINT IF EXISTS memories_bot_id_required;
ALTER TABLE memories ADD CONSTRAINT memories_bot_id_required
  CHECK (bot_id IS NOT NULL OR invalidated_at IS NOT NULL);

COMMIT;

-- 2. 验证约束
SELECT conname, pg_get_constraintdef(oid)
  FROM pg_constraint WHERE conname = 'memories_bot_id_required';

-- 3. 当前 NULL 行统计(应该 = 0)
SELECT 'bot_id NULL active' AS check, count(*)
  FROM memories WHERE bot_id IS NULL AND invalidated_at IS NULL;
