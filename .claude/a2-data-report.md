# panmira A2 数据完整性报表

> 生成时间: 2026-07-07 20:25:59 UTC
> 脚本: scripts/2026_07_08_a2_recover.mjs

## 0. 结论

- PASS: **13**
- FAIL: **0**
- INFO: **4**
- 跨表一致性: **OK**

## 1. 核心表 count (5)

| 表 | 实际 | 期望 | 状态 | 备注 |
|---|------|------|------|------|
| agents | 8 | 8 | PASS | 数字员工 (含历史 full-stack-engineer 模板) |
| users | 2 | 2 | PASS | 真人 (admin@panmira.com 已就位) |
| agent_pipelines | 13 | 13 | PASS | 流水线 (含 e2e/test 系列) |
| documents | 2526 | 2526 | PASS | 知识库文档 |
| bot_configs | 5 | 5 | PASS | 飞书 channel binding (玄鉴/守静/信言/得一/不盈) |

## 2. IA v6 view count (4)

| view | 实际 | 期望 | 状态 | 备注 |
|------|------|------|------|------|
| digital_employees | 8 | 8 | PASS | 应 == agents |
| people | 2 | 2 | PASS | 应 == users |
| model_pool | 5 | 5 | PASS | 应 == provider_configs |
| endpoints | 5 | 5 | PASS | 应 == bot_configs |

## 3. Enum 约束校验

| 字段 | 非法值数量 | 期望 | 状态 |
|------|-----------|------|------|
| agents.status | 0 | 0 | PASS |
| agent_pipelines.status | 0 | 0 | PASS |
| documents.module | 0 | 0 | PASS |
| bot_configs.purpose | 0 | 0 | PASS |

## 4. 字段回填情况 (INFO)

| 字段 | 非空数量 | 备注 |
|------|---------|------|
| agents.persona (not null count) | 8 | persona 回填情况 |
| agents.avatar_url (not null count) | 8 | avatar_url 回填情况 |
| agent_pipelines.owner_id (not null count) | 10 | owner_id 回填情况 (从 created_by) |
| users.sid (not null count) | 2 | sid 编号回填 (A1 已加) |

## 5. 跨表一致性 (view 应该 == 底层表)

| 校验项 | 状态 |
|--------|------|
| agents == digital_employees | OK |
| users == people | OK |
| bot_configs == endpoints | OK |
| provider_configs == model_pool | OK |

## 6. 原始数据

```
[PASS] core_tables/agents: actual=8 expect=8 -- 数字员工 (含历史 full-stack-engineer 模板)
[PASS] core_tables/users: actual=2 expect=2 -- 真人 (admin@panmira.com 已就位)
[PASS] core_tables/agent_pipelines: actual=13 expect=13 -- 流水线 (含 e2e/test 系列)
[PASS] core_tables/documents: actual=2526 expect=2526 -- 知识库文档
[PASS] core_tables/bot_configs: actual=5 expect=5 -- 飞书 channel binding (玄鉴/守静/信言/得一/不盈)
[PASS] views/digital_employees: actual=8 expect=8 -- 应 == agents
[PASS] views/people: actual=2 expect=2 -- 应 == users
[PASS] views/model_pool: actual=5 expect=5 -- 应 == provider_configs
[PASS] views/endpoints: actual=5 expect=5 -- 应 == bot_configs
[PASS] enums/agents.status: actual=0 expect=0 -- enum 校验: 0 表示全部合法
[PASS] enums/agent_pipelines.status: actual=0 expect=0 -- enum 校验
[PASS] enums/documents.module: actual=0 expect=0 -- enum 校验
[PASS] enums/bot_configs.purpose: actual=0 expect=0 -- enum 校验
[INFO] fields/agents.persona (not null count): actual=8 expect=- -- persona 回填情况
[INFO] fields/agents.avatar_url (not null count): actual=8 expect=- -- avatar_url 回填情况
[INFO] fields/agent_pipelines.owner_id (not null count): actual=10 expect=- -- owner_id 回填情况 (从 created_by)
[INFO] fields/users.sid (not null count): actual=2 expect=- -- sid 编号回填 (A1 已加)
```
