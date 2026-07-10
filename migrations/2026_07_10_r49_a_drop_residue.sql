-- R49-A · 删除 6 张残留表(数据层 P0 清理)
-- 用户拍板决策(2026-07-10):所有 6 表可删,不影响业务
--   - bot_skill_bindings(22 行)         已被 agent_skill_refs 替代
--   - templates(4 行)                   已被 agent_templates 完全覆盖
--   - memories_backup_20260705(4174 行) 32MB 老备份,迁移成功后的冗余
--   - _backup_20260608_documents(424 行)
--   - _backup_20260608_folders(55 行)   2026-06-08 schema 迁移前快照,早就稳定
--   - _journal(2 行)                    手工迁移日志,无业务价值
-- 来源:.claude/R49-UPGRADE-PLAN.md §1.1 块 A 数据层保留清单
-- 备份:/home/ubuntu/r49-pre-A-backup.sql(199MB) + .dump(71MB binary)
BEGIN;

DROP TABLE IF EXISTS bot_skill_bindings CASCADE;
DROP TABLE IF EXISTS templates CASCADE;
DROP TABLE IF EXISTS memories_backup_20260705 CASCADE;
DROP TABLE IF EXISTS _backup_20260608_documents CASCADE;
DROP TABLE IF EXISTS _backup_20260608_folders CASCADE;
DROP TABLE IF EXISTS _journal CASCADE;

COMMIT;
