# 会话交接 - A2 数据迁移完成 - 2026-07-08

## 当前任务
A2: 老数据重新分配到 IA v6 模块 + sid 编号 + 数据完整性验证

## 已完成
- [x] 数据现状摸底 (agents=8 / users=2 / agent_pipelines=13 / documents=2526 / bot_configs=5)
- [x] A1 字段冲突检查 (users.phone/sid/lock 字段已存在, 跳过)
- [x] 写数据迁移 SQL: `/home/ubuntu/panmira-N1/migrations/2026_07_08_a2_data.sql` (153 行)
- [x] 写验证脚本: `/home/ubuntu/panmira-N1/scripts/2026_07_08_a2_recover.mjs` (297 行)
- [x] 执行迁移成功 + persona 增强回填
- [x] 运行验证: PASS=13 / FAIL=0 / INFO=4
- [x] 跨表一致性 OK (4/4)
- [x] 生成报表: `/home/ubuntu/panmira-N1/.claude/a2-data-report.md`

## A2 加了什么字段

| 表 | 新字段 | 类型 | 默认/枚举 |
|---|---|---|---|
| agents | persona | text | description 前 240 字 / display_name+role_template fallback |
| agents | avatar_url | text | 按 display_name 前缀映射 /avatars/*.svg |
| agents | status | varchar(20) | active/paused/deprecated (按 is_active 回填) |
| agents | model_id | text | FK -> provider_configs(id) (soft reference) |
| agent_pipelines | owner_id | uuid | FK -> users(id), 从 created_by 回填 |
| agent_pipelines | status | varchar(20) | active/paused/archived (按 enabled 回填) |
| documents | module | varchar(20) | knowledge/feedback/log/other, 默认 knowledge (2526 docs) |
| bot_configs | purpose | varchar(20) | outbound/inbound/both, 默认 outbound (5 bots) |

## 数据快照 (验证后)

| 实体 | 实际 | 备注 |
|---|---|---|
| agents | 8 | 不盈/守静/信言/得一/玄鉴/墨言/测试Bot + 1 deprecated (full-stack-engineer 标准模板) |
| users | 2 | admin@panmira.com (admin), op1@panmira.com (operator, A1 创建) |
| agent_pipelines | 13 | 10 个有 owner_id (admin) + 3 个空 owner_id (e2e/test 历史) |
| documents | 2526 | 全部标 module='knowledge' |
| bot_configs | 5 | 玄鉴/守静/信言/得一/不盈, 全部 feishu + outbound |

## IA v6 view 状态
- digital_employees: 8 (== agents) ✓
- people: 2 (== users) ✓
- model_pool: 5 (== provider_configs) ✓
- endpoints: 5 (== bot_configs) ✓

## 关键决策 / 约束

### 与 A1 协同
- A1 已加 `users.phone`, `users.sid`, `users.verification_code`, `users.code_expires_at`, `users.failed_attempts`, `users.locked_until`
- A2 不重复加这些字段; 直接复用
- A1 创建了 operator 用户 op1@panmira.com (sid=metmira:op1) → users 从 1 -> 2, 已更新验证脚本期望值

### 与 IA v6 协同
- 不动 4 个 view + 2 个新表
- view 内部依赖的字段 (model_id, status, purpose) 都已补齐

### model_id 软引用
- provider_configs.id 是 `text` 不是 `uuid`, A2 也用 `text` 保持一致
- 暂时不强制 backfill (老 agent 的 default_model 字符串可能与 provider_configs 不对应, 让 UI 端按 default_model 渲染)

### owner_id vs created_by
- 两者并存 (指向 users.id)
- owner_id 语义 = 当前所有者; created_by 语义 = 创建者
- 历史数据 owner_id = created_by, 后续如果所有权转移可以只改 owner_id

## 待办 / 后续任务
- [ ] A3: 前端 pages 渲染 (people/digital_employees/model_pool/endpoints)
- [ ] 老 full-stack-engineer 模板 (id=ce0de8dc) is_active=false → status=deprecated, 决策: 是否从 digital_employees view 排除? (当前 view 是 SELECT *, 会包含)
- [ ] model_id 没回填 (缺 default_model -> provider_configs 映射), 可后续做
- [ ] 3 个 agent_pipelines 没有 owner_id (e2e/test 无主), 决策: 是否挂到 admin 头下?
- [ ] avatar_url 是 /avatars/*.svg 假路径, 前端需要做 fallback

## 用户偏好 / 风格
- 字段别名策略: owner_id (新) + created_by (老) 同时保留, 不重命名避免破坏 FK 引用
- enum 全部用 varchar(20) + CHECK, 不用 postgres enum type (迁移成本低)
- backfill 用 IS DISTINCT FROM 防误改, 加 WHERE 守卫只更新 NULL/不同值

## 重要文件 / 路径

| 文件 | 路径 | 说明 |
|---|---|---|
| 迁移 SQL | `/home/ubuntu/panmira-N1/migrations/2026_07_08_a2_data.sql` | 153 行, idempotent (IF NOT EXISTS) |
| 验证脚本 | `/home/ubuntu/panmira-N1/scripts/2026_07_08_a2_recover.mjs` | 297 行, Node + pg, 17 项检查 |
| 数据报表 | `/home/ubuntu/panmira-N1/.claude/a2-data-report.md` | Markdown, 自动生成 |
| 本交接 | `/home/ubuntu/panmira-N1/.claude/handoff-2026-07-08-a2-data-done.md` |  |

## 重跑命令

```bash
# 跑迁移 (idempotent, 已执行过不会再改)
psql metabot -f migrations/2026_07_08_a2_data.sql

# 跑验证
node scripts/2026_07_08_a2_recover.mjs

# 查看报表
cat .claude/a2-data-report.md
```

## 验证结论

```
PASS=13  FAIL=0  INFO=4
跨表一致性: OK (agents==digital_employees / users==people / bot_configs==endpoints / provider_configs==model_pool)
```
