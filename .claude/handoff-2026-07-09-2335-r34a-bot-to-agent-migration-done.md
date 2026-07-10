# 会话交接 - 2026-07-09 23:35 - R34-A Bot→Agent 数据迁移完成

## 当前任务
R34-A: panmira 存量数据从 Bot-centric 迁移到 Agent-centric 架构（每个旧 Bot 1:1 绑定 Agent 实例）。

## 已完成 ✅
- [x] pg_dump 备份: `backups/pre-r34-migration-20260709-232623.sql` (190MB)
- [x] 写 migration: `migrations/2026_07_09_r34_bot_to_agent_migration.sql` (98 行，幂等)
- [x] 跑 migration: 3 ALTER + 5 UPDATE(bots) + 1 UPDATE(agents channel_ids) + 48 UPDATE(folders) + 2437 UPDATE(docs) + 3 INDEX，COMMIT 成功
- [x] 更新 `src/db/schema.ts`: botConfigs/folders/documents 各加 agentId 字段 + 1 个新索引
- [x] tsc rebuild: dist/ 已生成 (noEmitOnError:false，2 个 http-server.ts 类型错误是 HEAD 6710a78 既有，非本次引入)
- [x] pm2 restart panmira: online, 20 restarts
- [x] API 端到端验证全通过
- [x] commit `a30b0dd`: feat(db): R34-A Bot-centric → Agent-centric 存量数据迁移 (2 files, +107)

## 数据映射（关键决策） ⚠️
| Bot (bot_id) | → Agent 实例 (agent_id) | 匹配依据 |
|---|---|---|
| 不盈 (fb2af5ea...) | 不盈--全栈开发 (c5bf8d20...) | 名字直匹配 |
| **信言** (7c53b85b...) | **墨言--全能文案秘书** (1634063d...) | **角色匹配**（信言改名墨言，display_name 都是内容/文案角色）|
| 守静 (93325749...) | 守静--运维部署模板 (1af80186...) | 名字直匹配 |
| 得一 (092816d0...) | 得一--替补模板 (87d505cc...) | 名字直匹配 |
| 玄鉴 (136bf019...) | 玄鉴--数智底座模板 (0253fff5...) | 名字直匹配 |

**测试Bot--验证缝合** (efadf77d...) 是测试用 agent 实例，未绑定任何 bot，channel_ids=[]（正确）。

⚠️ **信言→墨言 是基于角色的推断匹配**，若用户原意是创建新 agent，可：
1. 回滚此条 `UPDATE bot_configs SET agent_id=NULL WHERE name='信言'`
2. 创建新 agent 实例（参照 agent-store.create 逻辑）
3. 重新 `UPDATE bot_configs SET agent_id=<new> WHERE name='信言'`
4. 重跑 Step 3 的 channel_ids 填充 SQL

## 验证结果（全 PASS）
- bot_configs: 5/5 有 agent_id（0 unmatched）
- agents.channel_ids: 5/6 非模板 agent 有 channels（测试Bot 正确留空）
- folders: 48/98 有 agent_id（与原 bot_id 数一致）
- documents: 2437/2438 有 agent_id（与原 bot_id 数一致）
- 0 mismatch（folder.bot_id→agent_id 与 bot_configs.agent_id 完全一致）
- API /api/agents 返回 channelIds ✓
- API /api/bots 返回 agentId ✓
- API /api/mcp/servers 正常 ✓

## 待办（R34-B 接力）
- [ ] **前端**：Agent 详情页展示 channel_ids 列表（绑定哪些 Bot）
- [ ] **前端**：Bot 详情页展示 agent_id（当前由哪个 Agent 实例驱动）
- [ ] **前端**：folder/document 按 agent_id 过滤视图
- [ ] **后端**（可选）：bot-config-store.ts 加 getAgentId(botId) 查询方法（当前 schema.ts 已有字段，bot-config-store 未显式 expose，但 API 已能返回 agent_id，因为 SQL 是 SELECT *）
- [ ] **后端**（可选）：agent-store.ts 已支持 channel_ids 读写（无需改动），但创建/更新 agent 时若传 channelIds，要确保与 bot_configs.agent_id 双向一致（当前 migration 已建立一致状态，但后续编辑需保持）

## 关键决策 / 约束
- **不删任何数据**：bot_configs.bot_id / folders.bot_id / documents.bot_id / bot_configs.agent_template_id 全部保留
- **agent_id vs agentTemplateId 区分**（schema.ts 注释已写）：
  - agentTemplateId = bot 基于哪个**模板**创建（is_template=true）
  - agentId = bot 当前绑定的 agent **实例**（is_template=false）
- **幂等性**：所有 UPDATE 加了 `AND agent_id IS NULL` 守卫，migration 可重复执行

## 重要文件 / 路径
- 服务端工作目录: `/home/ubuntu/panmira-N1/` (HEAD: a30b0dd，前: 6710a78)
- migration: `migrations/2026_07_09_r34_bot_to_agent_migration.sql`
- schema: `src/db/schema.ts` (botConfigs/folders/documents 三处加 agentId)
- 备份: `backups/pre-r34-migration-20260709-232623.sql`
- DB: `postgresql://ubuntu:ubuntu@localhost:5432/metabot`
- pm2 进程名: `panmira` (online, port 9100)

## 用户偏好 / 风格
- "不要问，直接干" — 本次按此执行，信言→墨言 的推断匹配已标注，可回滚
- 不删数据、保留历史、可回滚（pg_dump 在前）
