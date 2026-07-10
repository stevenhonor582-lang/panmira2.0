# R38 Agent-Centric 完整架构迁移 Spec

**日期**: 2026-07-10
**分支**: r36-tab-basics-fixes
**作者**: R38-A 全量架构梳理(规划阶段,未改代码)
**目标**: 把 panmira 从 "Bot-centric(资源挂在 Bot 上)" 完整切到 "Agent-centric(资源挂在 Agent 实例上,Bot 仅作入口)"

---

## 1. 架构目标

```
顶层  Real User(真人账号 = 身份主体,1 真人 → N Agent)
核心  Agent 实例(Digital Employee, 唯一真相源)
  ✅ LLM Provider/Model  (provider_configs FK via model_id)
  ✅ Skill                (agent_skill_refs)
  ✅ MCP Server           (?? agent_mcp_refs — 表未建)
  ✅ Knowledge Folder/KB  (folders.agent_id, agent_knowledge_refs)
  ✅ Document             (documents.agent_id)
  ✅ Memory (L1/L2/L3)    (?? memories.agent_id — 已删)
  ✅ OAuth Token/API Key  (?? secrets.agent_id — 表未建)
  ✅ Tools/Capabilities   (agents.tools jsonb)
  ✅ Boundary/Iron Laws   (agents.boundary / iron_laws)
  ✅ Pipeline/DAG         (agent_pipelines via nodes)
  ✅ Orchestration/Routing(agents.orchestration jsonb)
  ✅ System Prompt        (agents.system_prompt)
辅助  Agent 模板(is_template=true,只用于生成实例)
入口  Bot(仅作渠道接入端点,本身不挂任何 AI 资源)
  bot_configs.agent_id → agents.id (FK)
  bot_configs.agent_template_id → agents.id (FK, 模板)
  Bot 不再持有: Provider/Key/Skill/MCP/KB/Doc/Memory/System Prompt
```

**已部分达成(R34/R36)**:
- bot_configs.agent_id FK 到 agents
- folders.agent_id / documents.agent_id 迁移
- agents.channel_ids 填充
- agents.model_id FK 到 provider_configs
- R36-1/2/3 切到 tab-basics 编辑 defaultEngine/defaultModel/orchestration

**未达成(R38 必须补)**:
- model_id FK 完全没被运行时使用(核心 bug)
- memories 表 agent_id 列已删,只留 bot_id
- agent_mcp_refs / agent_secrets / agent_doc_refs 等新表未建
- bot_skill_bindings 仍按 bot_id 主索引,而不是 agent_id
- bot_secrets 仍按 bot_name 而非 agent_id
- 双向同步不一致(bot_configs.agent_id 3/5 缺失)
- tab-basics 保存 PATCH 路径未触发下游 Provider 路由失效

---

## 2. 数据表迁移清单

### 2.1 完整表清单(schema.ts vs DB 实际列对比)

> 关键发现: src/db/schema.ts (drizzle ORM schema) 与数据库实际列严重不一致。
> 多张表的列只在 raw SQL 中存在(通过 pool.query),drizzle 看不到。
> 这就是 R33-A "agent 绑 DeepSeek 但跑 Minimax" bug 的根因之一。

| # | 表名 | 隐藏列数 | PK | bot_id? | agent_id? | 当前归属 |
|---|------|---------|----|---------|-----------|----------|
| 1 | tenants | 0 | uuid | N | N | tenant |
| 2 | users | 0 | uuid | N | N | tenant |
| 3 | agents | 17 | uuid | N | Y (主键) | 核心 |
| 4 | audit_logs | 0 | uuid | N | Y FK | tenant |
| 5 | memories | 0 | text | Y uuid FK | N (已删) | bot_id 唯一锚点 |
| 6 | routing_bindings | 0 | uuid | N (text[]) | N | bot-name only |
| 7 | bot_configs | 4 | uuid | Y uuid | Y uuid FK | 入口 1:N agent |
| 8 | bot_secrets | 0 | uuid | Y (bot_name) | N | 应迁 agent |
| 9 | bot_budgets | 0 | uuid | Y (bot_name) | N | 应迁 agent |
| 10 | bot_skill_bindings | 1 (PK) | uuid | Y uuid FK | N | 应迁 agent_skill_refs |
| 11 | bot_agent_history | 0 | uuid | Y FK | Y FK | 审计 |
| 12 | documents | 0 | varchar | Y FK | Y FK | 已迁 |
| 13 | document_chunks | 0 | varchar | N | N | doc 自身 |
| 14 | folders | 0 | varchar | Y FK | Y FK | 已迁 |
| 15 | sessions | 0 | uuid | Y uuid | N | 运行时 |
| 16 | session_messages | 0 | serial | N | N | session 自身 |
| 17 | session_links | 0 | composite | N | N | session 自身 |
| 18 | activity_events | 0 | varchar | Y FK | N | 运行时 bot_id |
| 19 | provider_configs | 0 | text | N | N | system-wide + agents.model_id FK |
| 20 | memory_settings | 0 | text | N | N | system-wide |
| 21 | templates | 0 | uuid | N | N | 老模板(已被 agents.is_template 取代) |
| 22-65 | (其余 44 张) | - | - | - | - | 见附录 B 概览 |

### 2.2 关键表 schema/DB 列差异

agents 表 17 个隐藏列:
```
category, template_type, source_template_id, knowledge_folders, skills,
persona, default_context_window, default_max_turns, complexity_level,
engine, status, model_id, owner_user_id,
avatar_url, avatar_glyph, avatar_hue, display_name
```

bot_configs 表 4 个隐藏列:
```
english_slug, purpose, is_healthy, last_health_check_at
```

bot_skill_bindings 老主键: (bot_name text, skill_name text) — bot_id uuid 是后加的 nullable。

### 2.3 迁移 SQL 概要

| 目标 | 阶段 | SQL 概要 | 风险 |
|------|------|----------|------|
| memories.agent_id 重建 | 2 | ALTER TABLE memories ADD COLUMN agent_id uuid REFERENCES agents(id); UPDATE memories m SET agent_id = bc.agent_id FROM bot_configs bc WHERE m.bot_id = bc.bot_id; | 老数据找不回 agent — 保留 bot_id 兼存 |
| bot_skill_bindings → agent_skill_refs 双轨 | 2 | INSERT INTO agent_skill_refs (agent_id, skill_id) SELECT bc.agent_id, bsb.skill_id FROM bot_skill_bindings bsb JOIN bot_configs bc ON bc.bot_id = bsb.bot_id; | 重复数据,保留回滚 |
| bot_secrets.agent_id | 2 | 加列+回填 ALTER TABLE bot_secrets ADD COLUMN agent_id uuid; UPDATE bot_secrets bs SET agent_id = bc.agent_id FROM bot_configs bc WHERE bs.bot_name = bc.name; | bot_name unique + agent_id nullable — 两套定位 |
| bot_budgets.agent_id | 2 | 同 bot_secrets | 同上 |
| budget_history.agent_id | 2 | 同上 | 历史回填覆盖风险 |
| circuit_breaker_states.agent_id | 2 | 同上 | 实时写,迁移 race |
| activity_events.agent_id | 2 | 同上 | 写量大,加列锁 |
| agent_mcp_refs(新表) | 1 | CREATE TABLE agent_mcp_refs (id uuid PK, agent_id uuid FK, mcp_server_id uuid FK, params jsonb); | 无 |
| providers.model_id 校验 | 5 | 验证 agents.model_id 全部对应真 provider_configs 行 | 墨言矛盾需修 |

---

## 3. API 路由迁移清单

### 3.1 路由清单

| 路由前缀 | 主体 | 状态 | 备注 |
|----------|------|------|------|
| /api/v1/agent/* | bot 中心 | legacy | agent-routes.ts — 读 botName,用 botAgentRegistry,与 agents 表无关 |
| /api/v2/admin/agents | agent 中心 | 主路径 | agents-crud-routes.ts — AgentStore |
| /api/v2/employees | agent 中心 | 主路径 | employees-routes.ts — 但 PATCH 走 AgentStore.update,模型字段未触发下游 |
| /api/v1/employees | 重复实现 | 部分重叠 | http-server.ts 也有 PATCH /api/v1/employees/:id |
| /api/providers | provider 中心 | 独立 | provider-routes.ts |
| /api/v2/admin/skills | skill 中心 | bot_skill_bindings 仍按 bot | skill-hub-routes.ts |
| /api/v1/memory/* | bot 中心 | bot_id only | memory-routes.ts |
| /api/v1/bot/* | bot 中心 | legacy | bot-routes.ts — 读 bot_configs,channelIds=[] 修复中 |
| /api/v1/foundation/memory/* | memory | bot_id | foundation-memory-routes.ts |
| /api/v2/admin/foundation/kb/* | KB | agent_knowledge_refs | foundation-kb-routes.ts |
| /api/v1/foundation/kb/* | KB | 重复 | foundation-kb-routes.ts |

### 3.2 关键路由改造表

| 路由 | 当前主体 | 目标主体 | 改造方式 | 风险 |
|------|----------|----------|----------|------|
| PATCH /api/v2/employees/:id | agent + AgentStore.update | agent + 联级更新 provider_configs/memory_index/cache | 步骤1: UPDATE agents 行(已做). 步骤2: defaultEngine/defaultModel 变 → UPDATE provider_configs (is_default 切换) 或仅更新 model_id FK. 步骤3: invalidate model routing cache. 步骤4: 重算 chat_sessions.model | 中 — 跨表事务 |
| PATCH /api/v2/employees/:id { channelIds } | agents.channel_ids | agent + 同步 bot_configs.agent_id 双向 | 已有部分(R35):解绑旧 bot、清空 bot_configs.agent_id. 漏: 新增 channelId 时未同步写 bot_configs.agent_id → 3/5 bot_configs.agent_id=NULL 的根因 | 高 — 双向一致性 |
| POST /api/v2/admin/agents | agents | agents + 创建默认 channel | http-server.ts:600+ 已支持 channelIds. 漏: 未同时创建 bot_configs 行 | 低 — 模板无 bot 是预期 |
| POST /api/v2/admin/employees/:id/clone | agents.createInstanceFromTemplate | agents + 深拷贝所有 agent 资源 | AgentStore 已有,但只克隆 agent 字段,不克隆 agent_skill_refs/agent_knowledge_refs/bot_secrets/agent_secret | 中 — 副本实例运行时空资源 |
| GET /api/v1/memory/store | bot_id | agent_id (从 agent 反查 bot) | 加 agentId 入参,服务端 JOIN 反查 bot_id = (SELECT bot_id FROM bot_configs WHERE agent_id=$1) | 低 |
| GET /api/v1/memory/retrieve | 不按 bot_id | agent_id (过滤该 agent 下所有 bot) | 同上 | 低 |
| POST /api/v1/bot/switch-agent | 无 | 新建 — instance 切换 bot(将 bot_configs.agent_id 从旧 agent 改到新 agent,事务) | 新路由 | 中 |
| POST /api/v2/admin/agents/:id/promote | 无 | 新建 — 实例 → 模板(is_template=true,清 channel_ids) | 新路由 | 低 |
| POST /api/v2/admin/agents/:id/demote | 无 | 新建 — 模板 → 实例(is_template=false) | 新路由 | 低 |
| POST /api/v2/admin/templates/:id/instantiate | 部分(克隆) | 新建 — 模板生成实例(name override) | http-server.ts 已有 createInstanceFromTemplate 路由 | 低 |

---

## 4. 前端组件迁移清单

### 4.1 页面/组件主体分布

| 路径 | 资源主体 | 状态 | 备注 |
|------|----------|------|------|
| (app)/employees/page.tsx | agent 列表 | agent 中心 | 用 /api/v2/employees |
| (app)/employees/[id]/page.tsx | agent 详情 | agent 中心 | 同上 |
| (app)/employees/[id]/_components/tab-basics.tsx | agent 默认模型 + 上下文窗口 | R36-1/2/3 已迁 | PATCH /api/v2/employees/:id { defaultEngine, defaultModel, orchestration, defaultContextWindow } |
| (app)/employees/[id]/_components/tab-skills.tsx | agent 技能 | 读 /api/v1/bot/skill/list?bot=... | 仍按 bot 拉 |
| (app)/employees/[id]/_components/tab-memory.tsx | agent 记忆 | 跳到 /foundation/memory/*?botId=... | botId 而非 agentId |
| (app)/employees/[id]/_components/tab-collab.tsx | agent 协作 | 部分 agent 中心 | |
| (app)/employees/[id]/_components/tab-logs.tsx | agent 日志 | bot_id 过滤 | |
| (app)/employees/new/_components/step-7.tsx | agent 新建表单 | agent 中心 | 但提交 /api/v2/admin/agents 失败时检查 model_id FK — 已报错 |
| (app)/channels/skills/page.tsx | bot 中心 | bot 视角 | 仍按 bot 路由 |
| (app)/channels/mcp/page.tsx | bot 中心 | bot 视角 | |
| (app)/channels/llm/page.tsx | provider 中心 | provider 独立 | |
| (app)/channels/endpoints/page.tsx | bot 中心 | bot 视角 | |
| (app)/channels/routing/page.tsx | 路由中心 | bot target | |
| (app)/overview/people/[id]/_components/person-tabs.tsx | 真人-agents 关联 | agent 中心 | patchPersonAgents |
| (app)/foundation/memory/l{1,2,3}/page.tsx | bot 中心 | bot_id only | 列、过滤、详情全 bot_id |
| (app)/foundation/knowledge/page.tsx | KB | 部分 bot_id | |

### 4.2 关键组件改造表

| 组件 | 现状 | 目标 | 改动方式 |
|------|------|------|----------|
| tab-basics.tsx 上下文窗口卡片 | PATCH agent 字段 OK,但不触发下游 Provider 失效 | PATCH 成功后 invalidate loadDefaultLlmProvider cache | fetch wrappers 或加 /api/v2/admin/cache/invalidate 调用 |
| tab-basics.tsx 专属大模型卡片 | PATCH { defaultEngine, defaultModel, model_id? } | PATCH 同时写 agents.model_id FK + defaultModel text(双源同步) | buildModelBindingPatch 已有 defaultEngine/defaultModel;加 modelId 字段 |
| tab-memory.tsx 跳链 | ?botId=<id> | ?agentId=<id>(服务端再 JOIN 到 bot) | 路由改成 /foundation/memory/{l}?agentId=...,服务端 agent_id → 所有 bot_id 子查询 |
| tab-skills.tsx | /api/v1/bot/skill/list?bot=... | /api/v2/admin/agents/:id/skills | 加新路由,前端改 endpoint |
| tab-collab.tsx | 部分 agent_id 部分 bot_id | 全 agent_id | |

---

## 5. 唯一真相源(Agent 实例)挂载模型

agents.id (uuid) —— 一切资源的归集点

├── 模型/LLM
│   ├── agents.default_engine            varchar  ← 文本(冗余,显示用)
│   ├── agents.default_model             varchar  ← 文本(冗余,显示用)
│   ├── agents.model_id                  uuid FK → provider_configs.id (主权威,但运行时不用!)
│   └── agents.orchestration.useModelRouting  boolean  ← 锁定开关
│
├── 技能
│   └── agent_skill_refs.agent_id         uuid FK (plan-B1 已建)
│
├── MCP
│   └── agent_mcp_refs.agent_id           uuid FK (表未建,需新建)
│
├── 知识库
│   ├── agent_knowledge_refs.agent_id     uuid FK (plan-B2 已建)
│   └── documents.agent_id               uuid FK (R34-A 已迁)
│
├── 文件夹
│   └── folders.agent_id                 uuid FK (R34-A 已迁)
│
├── 记忆
│   ├── memories.bot_id                  uuid FK (仅 bot;agent_id 已删)
│   └── memories.agent_id                (已删,需重建)
│
├── 密钥/Token
│   ├── bot_secrets.bot_name             text    (应迁到 agent_secrets)
│   └── (新表) agent_secrets.agent_id    uuid FK (未建)
│
├── 预算/速率
│   ├── bot_budgets.bot_name             text    (应迁)
│   ├── budget_history.bot_name          text    (应迁)
│   └── circuit_breaker_states.bot_name  text    (应迁)
│
├── Pipeline / DAG
│   └── agent_pipelines.nodes[].agentTemplateId  uuid FK (通过 JSONB 引用)
│
├── 调度任务
│   └── scheduled_jobs.agentTemplateId   uuid FK (已迁)
│
├── 审计
│   └── audit_logs.agent_id              uuid FK (已建)
│
├── 模板/实例关系
│   ├── agents.is_template               boolean (R15-A)
│   ├── agents.source_template_id        uuid FK → agents.id (R15-A)
│   └── agents.channel_ids               jsonb   (R34-A)
│
└── 入口(bot)
    └── bot_configs.agent_id              uuid FK (R34-A;但同步不彻底)

---

## 6. 模板/实例规则

### 6.1 名称重名校验

| 类型 | 互斥规则 | 校验位置 |
|------|----------|----------|
| 实例(is_template=false) | 同 tenant 下 name 唯一 | DB: uq_agents_name_instance 部分唯一索引 + AgentStore.assertInstanceNameUnique |
| 模板(is_template=true) | 允许重名(同人可复制多份) | DB: 部分唯一索引 WHERE is_template=false 跳过 |
| 模板 ↔ 实例 | 允许同名(各走各的索引) | 同上 |

### 6.2 模板 → 实例
- 入口: POST /api/v2/admin/agents/:id/instantiate body {name: string, ownerId?: string}
- AgentStore.createInstanceFromTemplate 已实现
- 行为: 深拷贝 persona/system_prompt/skills/iron_laws/orchestration/boundary,分配新 id,is_template=false,生成新 working_dir
- R38 需补: 克隆时同步克隆 agent_skill_refs / agent_knowledge_refs(目前不克隆)

### 6.3 实例 → 模板
- 入口: POST /api/v2/admin/agents/:id/promote (新)
- 行为: is_template=true, 清空 channel_ids, 清空 model_id(模板不绑定 provider), 清空 working_dir(每个实例独立生成)
- 副作用: 若该实例此前绑了 bot,需先解绑(否则 bot 引用消失)

### 6.4 实例复制(同模板 → 多个实例)
- 同 6.2,可多次调用

### 6.5 跨模板复制
- 入口: POST /api/v2/admin/agents/:srcId/copy-as-template (新)
- 行为: 源 agent 复制成新模板(is_template=true,新 id),源不变

---

## 7. 迁移执行顺序(分阶段)

### 阶段 1: 数据表 schema(无业务影响)
- [ ] 1.1 ALTER TABLE memories ADD COLUMN agent_id uuid REFERENCES agents(id) ON DELETE SET NULL
- [ ] 1.2 CREATE TABLE agent_mcp_refs(...) (新)
- [ ] 1.3 ALTER TABLE bot_secrets ADD COLUMN agent_id uuid
- [ ] 1.4 ALTER TABLE bot_budgets ADD COLUMN agent_id uuid
- [ ] 1.5 ALTER TABLE budget_history ADD COLUMN agent_id uuid
- [ ] 1.6 ALTER TABLE circuit_breaker_states ADD COLUMN agent_id uuid
- [ ] 1.7 ALTER TABLE activity_events ADD COLUMN agent_id uuid
- [ ] 1.8 ALTER TABLE sessions ADD COLUMN agent_id uuid(可选)
- [ ] 1.9 ALTER TABLE chat_sessions ADD COLUMN agent_id uuid(可选)
- [ ] 1.10 全部 + 索引
- [ ] 1.11 同步 src/db/schema.ts 加这些列(否则 drizzle 代码看不见)

### 阶段 2: 旧数据迁移 SQL
- [ ] 2.1 回填 memories.agent_id = bot_configs.agent_id for m.bot_id = bc.bot_id
- [ ] 2.2 回填 bot_secrets.agent_id 同理
- [ ] 2.3 同步所有 bot_configs.agent_id = agents.channel_ids 反向(根因修复)
  - SQL: 对每个 agent(channel_ids 非空),UPDATE bot_configs.agent_id
  - 注意独占校验:多个 agent 共享同一 bot_id 需先人工确认
- [ ] 2.4 跑双向一致性 SQL:每个 bot_configs.agent_id 必须 ∈ agent.channel_ids
- [ ] 2.5 修墨言数据矛盾: agents.default_model='MiniMax-M3' vs agents.model_id=GLM id
  - 选项 A: 把 model_id 改成真 MiniMax 的 provider id
  - 选项 B: 把 defaultModel 改回 'GLM-5.2'

### 阶段 3: API 改造
- [ ] 3.1 PATCH /api/v2/employees/:id 联级: defaultEngine/defaultModel 变化 → 同步写 model_id + invalidate cache
- [ ] 3.2 PATCH channelIds 联级: 新增 bot_id → UPDATE bot_configs.agent_id(根因修复)
- [ ] 3.3 新增 POST /api/v2/admin/agents/:id/promote / :id/demote
- [ ] 3.4 POST /api/v2/admin/agents/:srcId/copy-as-template
- [ ] 3.5 POST /api/v2/admin/agents/:id/instantiate 补克隆 agent_skill_refs / agent_knowledge_refs
- [ ] 3.6 /api/v1/memory/* 加 agentId 入参,服务端 JOIN 反查 bot_id
- [ ] 3.7 /api/v2/admin/agents/:id/mcp-refs / /skills / /knowledge-refs CRUD
- [ ] 3.8 模型路由失效 hook(PATCH defaultEngine 后清 loadDefaultLlmProvider cache)

### 阶段 4: 前端改造
- [ ] 4.1 tab-basics.tsx 保存后立即拉最新 agent 并刷新 UI
- [ ] 4.2 tab-memory.tsx 跳链参数 botId → agentId
- [ ] 4.3 tab-skills.tsx endpoint /api/v1/bot/skill/list → /api/v2/admin/agents/:id/skills
- [ ] 4.4 tab-basics.tsx 专属大模型卡片保存后写 modelId 字段
- [ ] 4.5 (app)/employees/new/_components/step-7.tsx 校验 modelId 服务端返回
- [ ] 4.6 (app)/employees/templates/_components 加 promote 按钮
- [ ] 4.7 (app)/overview/people/[id]/_components 展示真人下的 agent 列表

### 阶段 5: 验证
- [ ] 5.1 端到端:新建 agent → 绑 provider → 绑 skill → 绑 KB → 绑 MCP → 加 bot → 触发对话
- [ ] 5.2 一致性 SQL: SELECT count(*) FROM bot_configs WHERE agent_id IS NULL 应 = 0(除测试 bot)
- [ ] 5.3 模板流程: promote 实例 → instantiate 多次 → 验证 name/clone
- [ ] 5.4 跨 instance 改 defaultModel,触发对话,确认模型换了(墨言场景回归)
- [ ] 5.5 删 instance 级联: agent 删除 → bot_configs.agent_id SET NULL → memory.agent_id SET NULL
- [ ] 5.6 删 template 不影响已生成的 instance

---

## 8. 风险评估

### 8.1 数据丢失风险

| 风险 | 严重度 | 缓解 |
|------|--------|------|
| 历史 memories 的 bot_id 在 bot_configs 已删后,无法反查 agent | 中 | 保留 bot_id 列兼存,agent_id 可空 |
| bot_secrets.bot_name 重名后 agent_id 回填歧义 | 低 | bot_name 已有 unique 约束,无歧义 |
| 模型切换:墨言 defaultModel vs model_id 不一致 → 切换后跳错 provider | 高 | 阶段 2.5 必修;前端 PATCH 路径阶段 3.1 必修 |
| channel_ids 双向同步:多 agent 共享同一 bot(独占校验已实现) | 中 | R35 已加独占校验 |

### 8.2 API 兼容性
- agent_id 列新建后,所有读 memories 用 bot_id 的 API 必须保留(向后兼容)
- model_id 写入:新增字段,旧代码不写不影响;但运行时必须用 model_id(新增)

### 8.3 前端回归
- tab-basics PATCH 改写后,可能影响 defaultContextWindow 等字段的渲染
- tab-memory 跳链参数名变更:需全栈同步(否则跳到 /foundation/memory?botId=... 404)
- 模型路由 cache 失效:若 PATCH 后未失效,UI 显示新模型但实际跑旧 provider

### 8.4 回滚方案
- 阶段 1 (schema):所有 ALTER 可逆(DROP COLUMN)
- 阶段 2 (数据):迁移前备份 pg_dump -t memories -t bot_secrets ... → 回滚 UPDATE ... SET agent_id=NULL
- 阶段 3 (API):前端 Feature Flag 控制;若线上挂,git revert PR
- 阶段 4 (前端):灰度 10% → 50% → 100%

---

## 9. 验收清单

### 阶段 1 完成
- [ ] \d agents / \d memories / \d bot_secrets 等列存在
- [ ] src/db/schema.ts 已同步
- [ ] drizzle-kit generate 无 diff
- [ ] 服务起动无 SQL error

### 阶段 2 完成
- [ ] 双向一致性 SQL: SELECT count(*) FROM bot_configs bc WHERE bc.agent_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM agents a WHERE a.id = bc.agent_id AND a.channel_ids @> to_jsonb(bc.bot_id::text)) 应 = 0
- [ ] 墨言 defaultModel vs model_id 一致
- [ ] 所有 bot_configs.agent_id NOT NULL(除 1 测试 bot)

### 阶段 3 完成
- [ ] PATCH defaultModel 后,新对话用新 provider(墨言回归)
- [ ] PATCH channelIds 新增 → bot_configs.agent_id 自动写
- [ ] promote / demote / instantiate 三个路由通

### 阶段 4 完成
- [ ] tab-basics 保存后 UI 立即刷新
- [ ] tab-memory 跳链用 agentId 不再 404
- [ ] 模板页加 promote 按钮

### 阶段 5 完成
- [ ] E2E:新建→绑→触发对话,模型/KB/Skill/MCP 全部生效
- [ ] 数据一致性 100%
- [ ] R37 协作画布跟随保持
- [ ] R38 工单已开,可后续清理重复代码

---

## 附录 A: 墨言案例完整复现

数据库状态(2026-07-10 现场):

```
agent 墨言--全能文案秘书:
  default_engine = openai
  default_model  = MiniMax-M3
  model_id       = d2e3c8c5-...-3df7ff755443  (这是 智谱 GLM provider 的 id!)
  orchestration  = {"autoCompress": {...}, "useModelRouting": false}

provider_configs:
  861ace80-...  MiniMax        LLM    MiniMax-M3    is_default=false
  b7256506-...  MiniMax-luoxuan openai MiniMax-M3    is_default=true ← 实际 default
  d2e3c8c5-...  智谱 (GLM)     LLM    GLM-5.2       is_default=false
```

运行时路径(玄鉴 Bot 飞书消息 → 墨言 agent 接收):

1. 飞书 → bot_configs(玄鉴).agent_id = 玄鉴 agent (R34 1:1 绑定)
2. 但用户改的是「墨言」 agent 的 defaultModel
3. 玄鉴 agent 不受影响,继续用 玄鉴 的 model_id(若 set)
4. 若玄鉴触发下游调墨言 → callLlm({model: 'MiniMax-M3'})
5. → loadLlmProviderByModel('MiniMax-M3') → 命中 'MiniMax-luoxuan' provider (openai,MiniMax-M3)
6. → 端点 = MiniMax-luoxuan.baseUrl,key = MiniMax-luoxuan.api_key
7. model_id 字段完全没被读!它指向 GLM 但运行时用 MiniMax-luoxuan

核心矛盾:
- agents.model_id FK 是 DB 层"权威绑定"声明(应该决定 provider)
- 但 llm-client.ts:loadLlmProviderByModel 只用 defaultModel text 反查
- → 改 model_id 不会触发下游变化(用户原话:"前端切换大模型配置,Bot 并未实际生效")
- → 改 defaultModel 才会触发(但不读 model_id)

R38 必做: llm-client.ts 增加"先用 model_id FK 直查,失败回退到 model text"的二级路径。

## 附录 B: drizzle schema 严重漂移清单

src/db/schema.ts 与实际 DB 差异(只列影响 R38 的):

| 表 | 漂移列数 | 主要影响 |
|----|----------|----------|
| agents | 17 | drizzle select 看不到 category/template_type/skills/persona/default_context_window 等,所有路由用 raw SQL |
| bot_configs | 4 | drizzle 看不到 english_slug/purpose/is_healthy,bot 路由也用 raw SQL |
| bot_skill_bindings | 1 | schema 声明的 PK 与 DB 不同(老 PK = bot_name+skill_name) |
| provider_configs | 1 | context_window 列未声明,新 schema 已加 |

R38 建议: 阶段 1 同步后,跑 drizzle-kit generate --strict,确保零 diff。

---

## 附录 C: 双向同步现场数据(2026-07-10)

bot_configs 实际数据:
```
  玄鉴 → agent_id=0253fff5-... ✓ (与 agent.channel_ids 一致)
  守静 → agent_id=1af80186-... ✓
  得一 → agent_id=NULL ✗ (但 agent 得一--替补模板 的 channel_ids=[092816d0...])
  不盈 → agent_id=NULL ✗ (但 agent 不盈--全栈开发 的 channel_ids=[fb2af5ea...])
  信言 → agent_id=NULL ✗ (但 agent 墨言--全能文案秘书 的 channel_ids=[7c53b85b...] 信言 bot 改名墨言 agent)
```

agents.channel_ids 全部填充 ✓
bot_configs.agent_id 3/5 缺失 ✗
R34-A migration 只填了 agents.channel_ids,没回填 bot_configs.agent_id。

---

END R38-MIGRATION-SPEC.md
