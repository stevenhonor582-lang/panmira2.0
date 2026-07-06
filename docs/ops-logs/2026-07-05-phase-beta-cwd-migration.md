# Phase β Operations Log: 5 bot cwd 英文 slug 迁移

**Date**: 2026-07-05 00:49 - 00:58
**Operator**: 善建 (Forge)
**Risk**: HIGH (production panmira restart)
**Backup**: /tmp/panmira-phase-beta-backup-20260705-004937/ (509MB DB + 218MB jsonl)

## 执行步骤

### 1. 备份
- DB: `pg_dump metabot > metabot.sql` (509 MB)
- jsonl: `tar -czf claude-projects.tgz -C ~/.claude projects` (218 MB)

### 2. Stop panmira
- `pm2 stop panmira`

### 3. Rename workspace 目录
```
/home/ubuntu/workspace/得一 → /home/ubuntu/workspace/deyi
/home/ubuntu/workspace/玄鉴 → /home/ubuntu/workspace/xuanjian
/home/ubuntu/workspace/不盈 → /home/ubuntu/workspace/buying
/home/ubuntu/workspace/守静 → /home/ubuntu/workspace/shoujing
/home/ubuntu/workspace/信言 → /home/ubuntu/workspace/xinyan
```

### 4. UPDATE chat_sessions.working_directory
```sql
UPDATE chat_sessions SET working_directory = '/home/ubuntu/workspace/deyi' WHERE working_directory LIKE '%得一%';
UPDATE chat_sessions SET working_directory = '/home/ubuntu/workspace/xuanjian' WHERE working_directory LIKE '%玄鉴%';
UPDATE chat_sessions SET working_directory = '/home/ubuntu/workspace/buying' WHERE working_directory LIKE '%不盈%';
UPDATE chat_sessions SET working_directory = '/home/ubuntu/workspace/shoujing' WHERE working_directory LIKE '%守静%';
UPDATE chat_sessions SET working_directory = '/home/ubuntu/workspace/xinyan' WHERE working_directory LIKE '%信言%';
```

7 行更新（含 bot_name 变体如 "得一--随时替补"）。

### 5. Start panmira
- `pm2 start panmira`
- 启动成功（10s uptime, online, 190 MB, 0 error）

## 已知 trade-off（接受）

1. **334 老 jsonl 在 `-home-ubuntu-workspace---/` 保留**
   - 老 session_id 仍可查 chat_sessions
   - SDK resume 找不到 jsonl（cwd 已改）
   - 任务列表里老 task → failed_recovery 状态
   - 30 天后归档（按 v2.1 决策）

2. **chat_sessions.working_directory 2 行异常路径未单独修**
   - "workspace-得一--随时替补"（缺 /）已被 LIKE '%得一%' UPDATE 覆盖
   - 现在所有行都是标准 /home/ubuntu/workspace/<english_slug>/

## 验证（待用户飞书实测）

- [ ] 得一 bot 在飞书收到消息后用 cwd=/home/ubuntu/workspace/deyi/
- [ ] SDK 在 ~/.claude/projects/-home-ubuntu-workspace-deyi/ 创建新 jsonl
- [ ] 不再写入老 -home-ubuntu-workspace---/ 坍缩目录

## 回滚方案

如失败，30 天内可回滚：
1. `pm2 stop panmira`
2. Rename 目录回中文
3. `psql metabot < /tmp/panmira-phase-beta-backup-20260705-004937/metabot.sql`
4. `tar -xzf /tmp/panmira-phase-beta-backup-20260705-004937/claude-projects.tgz -C ~/.claude/`
5. `pm2 start panmira`

V021 migration 可 down: `bash scripts/migrate.sh V020` (回到 V020)
