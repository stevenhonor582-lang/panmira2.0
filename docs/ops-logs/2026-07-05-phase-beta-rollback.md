# Phase β Rollback Operations Log

**Date**: 2026-07-05 01:10
**Reason**: ensureIsolatedWorkspace(botName='得一') 重建中文目录，覆盖 Phase β rename
**Action**: Rollback to known stable state (Phase α only)

## 回滚步骤

### 1. Stop panmira
### 2. 移内容从英文目录回中文目录
```
deyi/* → 得一/
xuanjian/* → 玄鉴/
buying/* → 不盈/
shoujing/* → 守静/
xinyan/* → 信言/
```

### 3. UPDATE chat_sessions.working_directory 改回中文
```sql
UPDATE chat_sessions SET working_directory = '/home/ubuntu/workspace/得一' WHERE bot_name LIKE '%得一%';
-- ... 5 bot 全部
```

### 4. Start panmira → online (181.7mb, 0 error)

## 失败原因分析

### 根因
`src/config.ts:299` `ensureIsolatedWorkspace(botName, configuredDir)`:
```typescript
const expectedDir = path.join(workspaceRoot, botName);  // ~/workspace/得一
try { fs.mkdirSync(expectedDir, { recursive: true }); } catch {}  // 重建中文目录
return expectedDir;
```

**botName 是中文**（panmira 1.0 注册 bot 时用中文名），所以：
1. ensureIsolatedWorkspace 返回 ~/workspace/得一（中文路径）
2. panmira 用这个路径作 SDK cwd
3. SDK 编码 cwd：~/workspace/得一 → -home-ubuntu-workspace---（坍缩）

### 为什么 chat_sessions.working_directory 改了没用
chat_sessions 表的 working_directory 被 bot config 的 defaultWorkingDirectory（由 ensureIsolatedWorkspace 计算）覆盖。
chat_sessions 数据不是 source of truth——bot config 才是。

## 保留的内容（Phase α 不受影响）

1. ✅ V021 english_slug 字段保留（Phase γ 用）
2. ✅ session-manager.ts 改用 english_slug 字段（Phase γ 接入时生效）
3. ✅ SDK Core 6 模块 + 6 测试 dormant 保留
4. ✅ task_metrics 表保留
5. ✅ integration-test-query-runner.ts 保留

## Phase γ 正确方案

Phase γ 接入 SDK Core 时：
1. message-bridge.ts 改用 QueryRunner（替代 executor.ts:query()）
2. QueryRunner 内部用 session-manager.resolveBot → 读 english_slug
3. SDK cwd = ~/workspace/deyi/（英文）
4. ensureIsolatedWorkspace 被 bypass（QueryRunner 不走它）

## 教训

1. **chat_sessions 不是 cwd source of truth**——bot config ensureIsolatedWorkspace 才是
2. **rename workspace 目录无效**——ensureIsolatedWorkspace 会 mkdirSync 重建
3. **Phase β cwd 迁移必须先改 ensureIsolatedWorkspace**（Phase γ 一部分）
4. **下次先测一个 bot**（得一），不要 5 bot 同时改

## 备份

完整备份在：/tmp/panmira-phase-beta-backup-20260705-004937/ (727MB)
回滚后状态：/tmp/panmira-phase-beta-backup-20260705-004937/ 可删
