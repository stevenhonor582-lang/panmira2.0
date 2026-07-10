# Panmira 修改记录（R35 - R44 全阶段）

> 用途：快速回顾每个阶段改了什么 / 为什么改 / 发现了什么
> 生成时间：2026-07-10
> 当前 HEAD：894235b（R44-1 提升为模板）
> Commit 范围：7ab2879..894235b（32 个 commit）
> 分支：main
> 工作目录：/home/ubuntu/panmira-N1

---

## 目录

- [R35 入口管理（基线）](#r35-入口管理基线)
- [R36 全量需求（11 commit）](#r36-全量需求11-commit)
- [R37 协作画布（1 commit）](#r37-协作画布1-commit)
- [R38 墨言根因 + Agent-centric（17 commit）](#r38-墨言根因--agent-centric17-commit)
- [R39 PATCH 响应（1 commit）](#r39-patch-响应1-commit)
- [R40 e2e cleanup（1 commit）](#r40-e2e-cleanup1-commit)
- [R41 唯一真相源（5 commit）](#r41-唯一真相源5-commit)
- [R42 物理拆表（5 commit）](#r42-物理拆表5-commit)
- [R43 真修复（1 commit）](#r43-真修复1-commit)
- [R44-1 提升为模板（1 commit）](#r44-1-提升为模板1-commit)
- [关键事件回顾](#关键事件回顾)
- [数据迁移历史](#数据迁移历史)
- [教训沉淀（R44 方法论）](#教训沉淀r44-方法论)

---

## R35 入口管理（基线）

> R35-B 已经是 commit 7ab2879 之前的边界，本次未改动。本节只标基线参考。

**R35-B 入口管理 分类显示 + 解绑二次确认 + 占用置灰**
- **目标**：入口列表按"已绑/空闲/占用"三段显示，已绑需二次确认解绑
- **背景**：用户报"我直接点就直接绑定了，没有报警，二次确认"
- **基线结果**：UnbindConfirmDialog / SwitchConfirmDialog 已存在，行为已稳定
- **后续引用**：R36-3 / R37 / R38 等多处复用该 dialog 组件

---

## R36 全量需求（11 commit）

### a368423 R36-A PATCH 500 + recharts width(-1)/height(-1) 警告
- **目标**：修复 PATCH /api/v2/employees 500 错误 + 9 个 recharts 容器警告
- **改动**：
  - `src/db/agent-store.ts` 末尾删除 2 行重复 `push`（`default_context_window` / `persona` 各两行）
  - 9 个 `.tsx` 文件加 `minWidth={0} minHeight={0}`（overview/diagnosis/logs/people/billing/extraction 等直接用 ResponsiveContainer 的页面）
- **发现**：
  - PostgreSQL 报 `multiple assignments to same column`
  - 触发条件：PATCH 任意含 `default_context_window` / `persona` 的字段组合
  - `ui/chart.tsx` 的 ChartContainer wrapper 在 7ccde35 已修，但直接用 ResponsiveContainer 的页面未受益
- **原因**：用户浏览器报 500 + chart width 警告
- **验证**：
  - PATCH name + default_context_window + persona → 200
  - pm2 reload panmira + web-next 均 online
  - next build 通过

### e49c28b R36-1 全局路由 + 模型选择 联动绑定
- **目标**：模型选择与全局路由（provider/region/model）联动
- **改动**：前端 tab-basics + ModelBindingCard

### 86fcfd8 R36-3 写作模块空闲入口状态逻辑（落地）
- **目标**：写作模块入口状态以 `b.agent_id` 为权威
- **改动**：
  - 后端 `/api/bots` JOIN `bot_configs.agent_id` + `agents.name`，注入 `agent_id` / `agent_name`
  - 前端 `tab-collab.tsx` 重写 EntryManagement 分类逻辑：
    - `b.agent_id == null` → 空闲
    - `b.agent_id == 当前实例` → 已绑
    - `b.agent_id != 当前实例` → 占用
  - channelIds 仅作兜底；占方名字优先用后端注入的 `agent_name`

### 7bcfb3c R36-2 上下文窗口 512K 保存
- **目标**：前端表单保存后传入 512K 数值

### c05a00e R36-3 自动压缩阈值/比例可配置化
- **目标**：自动压缩阈值与比例变可配置项
- **改动**：配置 UI + 后端 schema

### 8564343 R36-3 自动压缩配置保存后即时生效
- **目标**：保存自动压缩配置后无需 reload 即时生效

### 82df2dd R36-1 保留未保存模型选择
- **目标**：切换路由/页面时不丢失已选但未保存的模型

### 0af1e04 R36-4 Agent 新建文件夹三层权限过滤
- **目标**：文件夹按 `/组织公共区/*` `/群协作区/*` `/数字员工/*` 分段
- **改动**：
  - 后端 `/api/knowledge/folders` 按 path 根分段 → `accessTier ∈ {organization, group, agent, other}`
  - 前端 step-5.tsx 三段折叠视图（emerald / sky / amber 配色）
  - admin/operator 全开；member 仅看自己有权的群 + 自己的 agent

### c39fa72 R36-5 任务列表新建页布局（画布左 + 表单右）
- **目标**：新建任务页布局改为 grid
- **改动**：`/tasks/new` 改为 `grid lg:grid-cols-[1fr_320px]`，左侧画布右侧 sticky 表单
- **响应式**：lg 以下自动 stacked（form 优先 order-1）

---

## R37 协作画布（1 commit）

### bc497b3 R37 协作画布跟随 agent 切换同步
- **目标**：修复 R36-3 后 Canvas 节点过滤漏改 + 防脏数据
- **改动**：
  - Canvas 节点过滤 `b.agentId` → `(b as any).agent_id`（snake_case，对齐后端 JOIN `bot_configs.agent_id`）
  - 切换 agent 时清零 `bots / related / pipelinesOfAgent / agentRows`（防旧数据闪一帧）
  - EditPane id 变化时重置 `editing / saving / error`（防 A 编辑态泄漏到 B）
- **原因**：R36-3 后端改了权威字段（`bot_configs.agent_id`），前端漏改一行；同文件 #880/#897/#1136 已对齐

---

## R38 墨言根因 + Agent-centric（17 commit）

> 这是 R35-R44 期间**最大的一次架构迁移**：从 Bot-centric 切到 Agent-centric，并修复墨言"前端切换大模型配置 Bot 未生效"的根因。

### 1dbc067 merge R36+R37+R38（17 commit 合并）— 顶层索引
- 包含：R36-A / R36-1-5 / R37 / R38-A（spec 454 行）/ R38-C1-6 / R38-E（字段修复 + e2e 自愈）
- 后续逐项展开

### 25fb680 R38-C4 新路由 + memory agentId 反查
- **新增路由**：promote / demote / copy-as-template / mcp-refs
- **memory agentId 反查**：MEMORY 表加 agent_id 反查索引

### 65445d9 BotConfigRow 缺 4 字段 + bot-routes 改读 camelCase（隐性 R36-3 漏修）
- **目标**：补 4 字段（botId / agentId / displayName / remark）
- **发现问题**：
  - 前端收到 `bot_id = ''` → PATCH `channel_ids` 时写入空字符串（用户原 bug 看不到）
  - 后端 SELECT * 拿到 `bot_id`，但 `mapRow` 丢掉，`row.bot_id` 永远是 `undefined`
- **修复**：
  1. BotConfigRow 接口加 4 字段（mapRow 从 `r.bot_id` / `r.agent_id` / `r.display_name` / `r.remark` 读 snake_case 列）
  2. `bot-routes.ts` 把 `(row as any).bot_id` 改为 `row.botId`
- **清理 R34-A 残留**：墨言--全能文案秘书.channel_ids 包含不盈但 bot_configs.agent_id=NULL → 清空墨言.channel_ids
- **验证**：5 个 bot 现在都返回真 UUID bot_id

### R38-A 全量架构梳理（455 行 spec，无 commit）
- **产出**：`/home/ubuntu/panmira-N1/.claude/R38-MIGRATION-SPEC.md`（454 行，9 节 + 3 附录）
- **核心结论**：
  - panmira 仍 Bot-centric（bot_configs / bot_secrets / bot_budgets 等）
  - drizzle schema 严重漂移（agents 17 列 / bot_configs 4 列 / bot_skill_bindings PK 漂移）
  - **墨言 bug 根因**：`llm-client.ts:loadLlmProviderByModel(model)` 用 `LOWER(model) = LOWER($1)` 查 `provider_configs`，**完全忽略 `agents.model_id` FK**
    - `agents.model_id` FK 是声明的，但运行时完全不读
    - 改 `model_id` 不会触发下游变化
    - 改 `defaultModel` 才会触发（但不读 model_id）
  - **双向同步不一致**：5 个 bot 有 3 个 `bot_configs.agent_id = NULL`（R34-A migration 漏回填）

### 0f0cbe9 R38-C3 集成（墨言根因修复 + PATCH 联级 + schema 迁移）— **核心 commit**
- **墨言根因修复**：
  - `llm-client.ts:loadLlmProviderByModel` 加 `agentId` 入参，优先用 `agents.model_id` FK 直查 `provider_configs`，失败回退 model 文本匹配
  - `LlmCallOptions` 加 `agentId` 字段，`callLlm` 透传给 `loadLlmProviderByModel`
- **PATCH /api/v2/employees/:id 联级（阶段 3.1-3.2）**：
  - `model_id` / `defaultEngine` / `defaultModel` 任意变化 → 同步写 `agents` 行 + `chat_sessions`
  - 只传 `modelId` 时反查 `provider_configs` → 自动同步 `defaultEngine / defaultModel`
- **channelIds 双向同步**：
  - 新增 → 写 `bot_configs.agent_id`（根因 R34-A 漏一半，3/5 bot NULL）
  - 解绑 → 旧 `channelIds` 中不出现的 → `bot_configs.agent_id = NULL`
  - 独占校验后置：新增 channelId 不会写其它 agent 的 bot
- **清理重复块**：`employees-routes.ts` 删除 GET handler 内错位的 cascade block（原 C3 agent 超时后留下的 88 行重复代码），保留 PATCH handler 内正确的 1 处
- **schema 迁移（V023 / V024）**：
  - V023：新增 `agent_mcp_refs` 表 + 8 张运行表加 `agent_id` 列（memories / bot_secrets / bot_budgets / budget_history / circuit_breaker_states / activity_events / sessions / chat_sessions）
  - V024：阶段 2.1-2.7 基于 `bot_configs.agent_id` 反向回填 + 阶段 2.9 墨言数据矛盾修复（VERIFIED）
- **验证（墨言 curl）**：
  - pre: `default_engine=llm, model_id=d2e3...`（GLM FK，BUG）
  - PATCH `model_id=861ace80`（MiniMax-M3 provider）
  - post: `default_engine=LLM, model_id=861ace80`（cascade 写入正确）
  - HTTP 200, FK 直生效

### 5bd92db R38-C5 tab-basics/memory/skills 切到 Agent 中心
- **改动**：
  - tab-basics：保存后用 updateAgent 返回直接 setAgent（不依赖 reload）
  - tab-memory：跳链 `?botId=` → `?agentId=<id>&botId=<id>`（保留 botId 兼容）
  - tab-skills：仍走 agent-agnostic `/api/skills`
  - tab-basics：专属大模型卡片 PATCH body 加 `modelId` 字段
  - step-7：提交前拉 `/api/providers` 校验，失效时禁用发布按钮 + 红色 banner

### e43ba99 R38-C6 templates promote/copy/instantiate + 真人页 agent 列表
- **templates 页**：
  - employees/_lib/data.ts 加 `promoteAgent / demoteAgent / copyAsTemplate` helpers
  - agent-card：实例下拉加 "提升为模板" + "复制为模板"；模板下拉加 "生成实例" + "复制为模板" + "转为实例"
  - 复制为模板对话框（CopyAsTemplateModal）
- **真人页**：person-tabs EmployeesTab 加 agent 卡片 dropdown menu（提升 / 复制 / 解绑）
- **e2e**：`r38-templates-promote.spec.ts`（5 用例）+ `r38-people-agents.spec.ts`（3 用例）— 全部通过

### c2dfbce R38-E tab-basics PATCH 字段名 modelId → model_id
- **目标**：前端 form 字段对齐后端 snake_case（`model_id` 而非 `modelId`）

### 2ba1d7a R38-E templates-promote e2e fixture 自愈（动态 query）
- **目标**：e2e 测试每次跑都新增 agent → 用动态 query 而非硬编码 name

---

## R39 PATCH 响应（1 commit）

### 87d8821 R39 PATCH 联级后重拉 agent，响应返回 DB 最新状态
- **问题**：R38-C3 联级修复后，AgentStore.update 返回的是入参 data 拼的对象，不是 DB 真实最新行。PATCH model_id 后前端看到的 defaultModel 是旧值（误导）。
- **实测**：
  - PATCH model_id=GLM → 响应 defaultModel=MiniMax-M3（旧值）→ DB 实际 GLM-5.2
  - PATCH model_id=MiniMax → 响应 defaultModel=GLM-5.2（旧值）→ DB 实际 MiniMax-M3
- **修法**：cascade try 块结束 + jsonResponse 之前重拉 `agentStore.findById(id)`，失败兜底不影响主流程
- **验证**：
  - PATCH GLM → 响应 defaultModel=GLM-5.2 ✓
  - PATCH MiniMax → 响应 defaultModel=MiniMax-M3 ✓

---

## R40 e2e cleanup（1 commit）

### db5c439 R40-A e2e afterAll cleanup helper + trackAgent/trackTemplate
- **问题**：R38-C6 e2e 跑完留 12 个测试残留（`守静-R38C6-E2E-*` 等），`r38-templates-promote.spec.ts` + `r38-people-agents.spec.ts` 没有 afterAll hook
- **改动**：
  - 新增 `apps/web-next/e2e/helpers/cleanup.ts` — 导出 `trackAgent / trackTemplate / cleanupTrackedResources`
  - 3 个 R38 spec 改为：用 `page.waitForResponse(status === 201)` 替代 `page.on('response')`，LIFO 清理注册表
- **验证**：
  - 8 passed（43.5s）
  - 残留 SELECT count(*) = 0
- **未涉及**：DB schema / pm2 reload / 后端 API（现有 `DELETE /api/v2/admin/agents/:id` 已够用）

---

## R41 唯一真相源（5 commit）

### 6aa36e7 R41-C 启用 user_agent_bindings（m:n） + 分配过滤修复
- **R41-A 诊断**：`user_agent_bindings` 表存在但未挂载到 drizzle schema；实际绑定靠 `agents.owner_user_id` 单字段；`filter=unassigned` 只看 `owner_user_id`，导致多人场景下 A 绑过的实例仍出现在 B 的选择器中
- **修复**：
  - schema.ts：新增 `userAgentBindings` 表模型 + 把 `ownerUserId` 加回 agents 表（schema 漂移修复）
  - employees-routes.ts：`filter=unassigned` 改 `NOT EXISTS user_agent_bindings` + owner_user_id 兜底
  - agents-crud-routes.ts：新增 `POST/DELETE /api/v2/admin/agents/:id/assign`
  - people-routes.ts PATCH：同步写 `user_agent_bindings`（两条路径结果一致）
  - V025 migration：创建 `user_agent_bindings`（IF NOT EXISTS）+ 从 `agents.owner_user_id` 回填 4 行
- **端到端验证**：
  - POST `assign`：unassigned 6 → 5, bound 4 → 5 ✓
  - DELETE 同 agent：bound 5 → 4, unassigned 5 → 6 ✓
  - 跨用户场景：A 绑 agent 后 B 的 unassigned 列表自动隐藏 ✓
- **回归**：web-next person-tabs.tsx 未改，前端 filter URL 与后端契约保持兼容

### 51a123b R41-D 英文 UI 标识 → 中文（第 1 批，7 处）
- 改 `owner → 所有者` 等 7 处
- 注：前一个 agent 跑一半中断，工作树未 commit

### 3bca623 R41-D 英文 UI 标识 → 中文（第 2 批，23 文件 60+ 处）
- **改动范围**：
  - admin/settings（Users / Bots / Agents / Knowledge / Skills / Projects / Coordinator / Chain Editor / Bot Permissions / Providers / Embedding / Tenant）
  - admin/runtime（Runtime Console → 运行时控制台）
  - admin/voice / admin/agents（Agent → 数字员工）
  - admin/integrations/webhook（Webhook URL → 回调地址）
  - admin/knowledge/kb-dialog（Chunk Size → 切片大小 / Chunk Overlap → 切片重叠）
  - admin/models/model-dialog（Base URL → 基础 URL）
  - admin/oauth-clients（Revoke OAuth Client → 撤销 OAuth 客户端）
  - admin/resources / admin/logs / channels/endpoints / channels/mcp / channels/oauth
- **保持英文**（不当 UI 翻译）：
  - 技术协议 / 品牌名（HTTP / SSE / OAuth / GitHub / DeepSeek / Anthropic / Google / OpenAI / Telegram / Slack / Edge / Microsoft）
  - 技术字段（URL / Token / Cron / SID / STT / TTS / DialogHeader / Field）
  - 模块名（LLM / MCP / Skill / Pipeline）
- **结果**：R38 e2e 10/11 通过（1 个 pre-existing modelId/model_id 命名问题与本任务无关）

### 85f47ee R41-E 真人卡片重设计
- **布局优化**：
  - 邮箱 + 手机号竖排 → 横排
  - 今日完成：纯数字标识（无文字）
  - 今日异常：符号（✓/✗）+ 异常时变卡片底色（rose-50 / amber-50）
  - 当前状态：统一图标 + 紧凑 badge + tooltip
  - 新增名下数字员工总数（对接 `GET /api/v2/people/:userId/agents` 数组长度）
  - 本周 token 消耗：取消进度横条，直接数值（K/M 缩写）
  - 卡片整体高度压缩
- **附带修复**：ResetPasswordModal 缺失 `useToast()` 调用（pre-existing TS2304）

### 3235a49 R41-B 清理 12 个测试残留 + filter 收敛到单一基准
- **清理（用户授权）**：
  - `e2e-refill-1~9`（9 个）
  - `e2e-fixture-refill-1783649015`（1 个）
  - `full-stack-engineer deprecated`（1 个）
  - `测试Bot--验证缝合`（1 个）
  - 备份到 `/tmp/r41b-deleted-agents.csv`
- **filter 收敛（根因：详情 5 vs 下拉 11 不一致）**：
  - `filter=instance`: `WHERE is_template=false AND status != 'deprecated'`
  - `filter=template`: `WHERE is_template=true AND status != 'deprecated'`
  - `filter=all`: UNION ALL（instance + template）均排除 deprecated
  - `filter=unassigned`: 保留 R41-C `NOT EXISTS user_agent_bindings`
  - `listTemplates()` 同步对齐（单一基准）
- **前端旁路收敛**：
  - overview `fetchAgents`: `/api/v2/admin/agents` → `/api/v2/employees?filter=all`
  - admin 路径保留 `/api/v2/admin/agents`（admin 语义，需看 deprecated）

---

## R42 物理拆表（5 commit）

> 把 R38-A 提出的 "agent_templates + agent_instances 双表" 架构真正落库。**这是副作用最大的一个 R 阶段**，后续 R43/R44 都在补它遗留的 UI 丢失。

### c0e1aea WIP: R42 uncommitted fixes（同步前快照）
- 改 `src/api/routes/auth-routes.ts` + `src/db/user-store.ts`
- 新增 `.claude/R38-MIGRATION-SPEC.md`
- 目的：防止方案 A 推 gitmira 时丢改

### 046d100 R42-SCHEMA 物理拆表（agents → agent_templates + agent_instances）
- **改造原则**（按 R42-DIAG 决策）：
  - `agent_templates`：蓝图字段（name / role_template / persona / system_prompt / orchestration / boundary / iron_laws / category / template_type / description / capabilities / tools / is_active）
  - `agent_instances`：蓝图 + 全字段（+ source_template_id / channel_ids / owner_user_id / working_dir / model_id / default_engine / default_model / default_context_window / default_max_turns / complexity_level / status / deployment_type / temperature / visibility / avatar_* / display_name / created_by）
- **关联表 polymorphic**：
  - 新增 `target_type` enum：`'template' | 'instance'`
  - `agent_skill_refs` / `agent_knowledge_refs` / `agent_mcp_refs` 三表 polymorphic（target_type 决定）
- **users 加 `is_system`**：
  - 默认 false
  - 管理员 sid=MS-GSGNQP → true（系统内置）
  - 真人管理员（steven 20218181@qq.com）→ false
- **数据迁移**：
  - 6 个现有 agent 全转 instance（不盈 / 信言 / 墨言 / 守静 / 得一 / 数智底座管理）
  - FK 重建（原 agents 表 FK → agent_instances.id）：bot_configs SET NULL / user_agent_bindings CASCADE / memories SET NULL / folders SET NULL / documents SET NULL / bot_agent_history CASCADE / audit_logs 改指 agent_instances
- **DROP**：
  - 旧 `agents` 表 DROP（CASCADE → `digital_employees` view 也 DROP，硬切不留 UNION）
  - `idx_agents_is_template` 索引随表 DROP
- **回滚能力**：V026 down.sql 保留完整回滚（注意：6 个 instance 会回到 `is_template=true` 单一 agents）
- **Pre-backup**：`/home/ubuntu/r42-pre-split-backup.sql`（15790 行，12 张表全量）
- **未做**：pm2 未 reload（路由未改，留 R42-ROUTES 一起 reload）

### 1740942 R42-ROUTES 路由改造（拆 agent_templates / agent_instances 两表）
- **改动范围**：26 个源文件
- **关键改动**：
  - `agent-store.ts`：拆 `findTemplateById / findInstanceById / createTemplate / createInstance`，新增 `createInstanceFromTemplate`
  - 路由：
    - **删**：`POST /api/v2/admin/agents/:id/promote` / `demote` / `copy-as-template`（语义消失）
    - **新增**：`POST /api/v2/admin/agent-templates/:id/instantiate` + `GET / POST /api/v2/admin/agent-templates` + `GET /api/v2/admin/agent-instances`
  - `/api/v2/employees?filter=instance/template/all`：改查对应表 + UNION ALL 公共列
  - `/api/v2/employees/:id` PATCH：自动 dispatch 到 template 或 instance
  - `digital_employees` 视图引用 → 直接查 `agent_instances`
  - memory / llm-client / people 路由改指 `agent_instances.id`
- **结果**：R38 墨言根因仍有效（C3 联级 + C5 + this），但前端 UI 端点契约变了

### 0a2725a R42-FRONTEND 前端适配 + 卡片 label + 星标归属
- **适配 R42-SCHEMA + R42-ROUTES**：
  - data.ts：`fetchTemplates` 改走 `/api/v2/agent-templates`；`createInstanceFromTemplate` 改走新 instantiate 端点
  - agent-card.tsx：**删** dropdown 里 "提升为模板 / 复制为模板 / 转为实例" 三项（后端对应端点 404）
  - templates-board.tsx：**删** "复制" 按钮（对应 copy-as-template R42 删除）
  - person-tabs.tsx：**删** employees tab 下拉 "提升为模板 / 复制为模板" + 复制对话框 + handlePromote / openCopy / submitCopy / Dialog 全删
  - person-card.tsx：数据条 4 列每列加显式 label（0/2 等数字一眼可读）
- **星标 + 权限**：
  - `Person.isSystem` 字段已加
  - `isSystem=true → ⭐`（Star 图标，amber 配色）
- **E2E 调整（R42 移除端点适配）**：
  - r15a-employees：替换 endpoint 为 `/api/v2/agent-templates`
  - r38-people-agents：删除 R38-C6 模板相关断言（只剩解绑验证）
  - r38-templates-promote：完全重写为 R42 路径
- **R44 复盘发现**：这次的 "删按钮" + R42-ROUTES 的 "删 promote 端点" 共同导致 **4 个 UI 入口永久丢失**（详见 R44-1）

### 6d3fa77 R42-X e2e cleanup 适配 R42 双表 + test 前缀黑名单
- **问题**：R42 拆表后 cleanup helper 仍只清 `agent_instances`，漏了 `agent_templates`；R42-FRONTEND e2e 在 templates 表留了 `R42E2E-*` 残留
- **改动**：
  - cleanup helper 加 type 字段：`trackTemplate / trackInstance`（`trackAgent` 保留为 deprecated alias）
  - 后端加 `DELETE /api/v2/admin/agent-templates/:id` + `/agent-instances/:id`（事务内解绑 `user_agent_bindings` + 清关联 + 删行）
  - e2e 启动时跑 test 前缀黑名单 sweep（`R\d+e2e|R\d+test|R\d+refill|R\d+debug|e2e-|test-|fixture-`），写在 `sweepTestResidue()`
  - 2 个 R42 e2e spec 改用新 helper + 注入 admin bearer
- **验证**：0 residue；9/10 r38 e2e 通过（1 个 pre-existing）

---

## R43 真修复（1 commit）

### dc40d67 R43 真修复 4 个回归
- **用户反馈**：R42-FRONTEND 提交后没真生效，根因是 **web-next 没 rebuild**
- **修复内容**：
  - **rebuild .next 强制生效**（BUILD_ID 11:48 → 16:24）
  - 后端 `sanitizeUser` 真暴露 `isSystem`（已在 c0e1aea WIP 提交）
  - 4 列布局统一（loading 时 4 列都显示 `—`，避免 admin 卡缺一列的视觉错觉）
  - **数字员工 tab 恢复 "复制为模板"**（后端 `POST /api/v2/admin/agent-templates` 端点已支持，R42 误删后前端也跟着删了）
  - **steven 卡（非系统管理员）显示 "标记停用" / "标记离职" 按钮**（待后端 `isSystem` 生效后自动启用）
  - AuthUser 类型加 `isSystem` 字段
- **验证**：
  - `/api/auth/users` 返回 admin@panmira.com `isSystem=true`, 20218181@qq.com `isSystem=false`
  - pm2 reload web-next + panmira 双成功
  - r17-2 · 01/02 测试通过（03 为 pre-existing 失败，与本次无关）

---

## R44-1 提升为模板（1 commit）

### 894235b R44-1 提升为模板 路由+UI（4 个永久丢失功能的第 1 个）
- **背景**：R42 拆表后 promote 端点被删；R42-FRONTEND 误判无对应函数直接删按钮 → **R34 时代 "提升为模板" 功能永久丢失**
- **4 原则遵守**：
  1. 功能清单先行 ✓（详见 R44 handoff 的功能清单点验表）
  2. 旧功能必保 ✓（agent-card.tsx 菜单全部保留：停用 / 启用 / 弃用 / 生成实例；person-tabs.tsx 全部保留：复制为模板 / 解绑）
  3. rebuild 硬约束 ✓（rm -rf .next && npm run build → BUILD_ID MQZvgWsLdsxn3lTZj3UN, 17:56:54；pm2 reload web-next pid 434615 online + panmira pid 431522 online）
  4. 完成后停下 ✓（只做 R44-1，未碰 R44-2 / R44-3 / R44-4）
- **后端**：`POST /api/v2/admin/agent-instances/:id/promote-to-template`
  - **事务**：解绑 `bot_configs` + INSERT `agent_templates`（蓝图字段）+ 复制 skill/kb/mcp refs（`target_type='template'`）
  - **蓝图字段**：12 个（name / role_template / description / capabilities / tools / persona / system_prompt / orchestration / boundary / iron_laws / category / template_type）
  - **不删原 instance**（创建新模板，不是改）
- **前端**：
  - `agent-card.tsx` 加 "提升为模板" 按钮
  - `person-tabs.tsx` 加 "提升为模板" 按钮
  - `data.ts`: `promoteInstanceToTemplate` helper
- **e2e**：`scripts/e2e/test-r44-1-promote.sh`（用户补 TO K 即可跑）
- **验证**：
  - 后端路由注册 OK（curl 返回 401 unauthenticated，不是 404）
  - 后端 build OK（dist 含 promote-to-template）
  - 前端 rebuild OK（BUILD_ID 时间戳验证 + pm2 reload online）
- **端点契约**：
  ```
  POST /api/v2/admin/agent-instances/:id/promote-to-template
  Body: { name?: string }   // 可选，默认 <instance.name>-模板
  Auth: Bearer token + scope: agent:admin
  
  201 { agent, source_instance_id, bots_unbound, refs_copied: { skills, knowledge, mcp } }
  400 { error: "name_taken" }
  404 { error: "agent_not_found" }
  ```

---

## 关键事件回顾

### 事件 1：R36 期间 — 500 错误 + chart 警告
- **症状**：PATCH /api/v2/employees 报 500；recharts `width(-1) height(-1)` 警告
- **根因**：
  - `agent-store.ts update()` 末尾重复 push `default_context_window / persona`
  - 9 个页面直接用 `<ResponsiveContainer>` 没传 minWidth/minHeight
- **教训**：drizzle 看不见 raw SQL 重复列时，PG 会静默扛到崩溃；UI 组件不传安全兜底会让 ResponsiveContainer 在容器未挂载时崩
- **修法**：删 2 行重复 push + 给每个 ResponsiveContainer 加 minWidth=0/minHeight=0

### 事件 2：R38 期间 — 墨言根因
- **用户原话**："前端切换大模型配置，Bot 并未实际生效"
- **根因**：`llm-client.ts:loadLlmProviderByModel(model)` 用 `LOWER(model) = LOWER($1)` 查 `provider_configs`，**完全忽略 `agents.model_id` FK**
  - `agents.model_id` FK 是声明的，但运行时完全不读
  - 改 `model_id` 不会触发下游变化
  - 改 `defaultModel` 才会触发（但不读 model_id）
- **教训**：drizzle schema 17 列漂移 + runtime 完全绕开 FK = 数据看似绑了、实际不绑
- **修法**：
  - llm-client 加 `agentId` 入参，优先 `agents.model_id` FK 直查
  - PATCH /api/v2/employees/:id 联级：model_id / defaultEngine / defaultModel 任意变化 → 同步写 `agents` 行 + `chat_sessions`
  - channelIds 双向同步：解绑时旧值不出现的 → `bot_configs.agent_id = NULL`

### 事件 3：R42 期间 — 7 个 UI + 5 个函数丢失
- **症状**：R42-FRONTEND 提交后，4 个原本 R34 时代有的 UI 功能永久丢失
- **根因**：
  - R42-ROUTES 删了 3 个端点（promote / demote / copy-as-template）
  - R42-FRONTEND 误判"无对应函数"，直接**删按钮**（不是禁用）
  - 同时 drizzle schema 同步时漏掉 5 个函数（`promoteAgent / demoteAgent / copyAsTemplate` 等）
- **教训**：**为了让代码"干净"，把功能当冗余删了**——这是 R36-R43 实战中最严重的反模式
- **修补**：
  - R43 部分恢复 "复制为模板"（后端 `POST /api/v2/admin/agent-templates` 还活着）
  - R44-1 恢复 "提升为模板"（新建 POST `/api/v2/admin/agent-instances/:id/promote-to-template`）
  - **R44-2 / R44-3 / R44-4 待办**：转为实例 / 复制为模板 / 真人创建 UI

### 事件 4：R44 期间 — R44-AUDIT 找回丢失功能 + 4 原则建立
- **结论**：R36-R43 一路走下来，最严重的失败模式是"为代码干净删功能"
- **R44 新方法论 4 核心原则**：
  1. **功能清单先行** — 改前列已有功能，改后逐项点验
  2. **旧功能必保** — 不能为"代码干净"删功能
  3. **rebuild 硬约束** — 动前端必 `rm -rf .next && npm run build && pm2 reload` + 验 BUILD_ID 时间戳
  4. **每功能 1 commit，每 commit 停下让你拍板**
- **辅助 2 条**：
  5. 数据清理独立 commit
  6. 每个 commit 完给"用户操作脚本"

---

## 数据迁移历史

| Migration | R 阶段 | 描述 |
|-----------|--------|------|
| V018 | R33-A (基线) | RAG query log 已有 |
| V023 | R38-C1 | `agent_mcp_refs` 新表 + 9 张表加 `agent_id` 列（memories / bot_secrets / bot_budgets / budget_history / circuit_breaker_states / activity_events / sessions / chat_sessions） |
| V024 | R38-C2 | 数据回填（基于 `bot_configs.agent_id` 反向回填 8 表 agent_id） + 墨言数据矛盾修复（VERIFIED） |
| V025 | R41-C | `user_agent_bindings` m:n 表（IF NOT EXISTS）+ 从 `agents.owner_user_id` 回填 4 行 |
| V026 | R42 | 物理拆表 `agents` → `agent_templates` + `agent_instances` + 关联表 polymorphic `target_type` + users 加 `is_system` + 旧 `digital_employees` view DROP |
| V026 down.sql | R42 | 完整回滚（6 个 instance 会回到 `is_template=true` 单一 agents） |

---

## 教训沉淀（R44 方法论）

### 核心 4 原则（R36-R43 实战失败总结）

1. **功能清单先行** — 改前列已有功能，改后逐项点验
2. **旧功能必保** — 不能为"代码干净"删功能（**R42 反面教材**：4 个 UI 入口永久丢失）
3. **rebuild 硬约束** — 动前端必 `rm -rf .next && npm run build && pm2 reload` + 验 BUILD_ID 时间戳（**R43 反面教材**：rebuild 漏触发，4 个回归实际没生效）
4. **每功能 1 commit，每 commit 停下让你拍板** — 避免一口气改完没法回滚

### 辅助 2 条

5. **数据清理独立 commit** — `R41-B` 12 个测试残留清理 vs 业务改动分开
6. **每个 commit 完给"用户操作脚本"** — 让用户能独立复验

### drizzle schema 漂移教训

- `src/db/schema.ts` 与 DB 实际列**严重不一致**（agents 17 列 / bot_configs 4 列 / bot_skill_bindings PK 漂移）
- 后果：所有路由用 raw SQL (`pool.query`)，drizzle 看不见 → R33-A 那类 bug 高频出现
- 修法（阶段 1.11）：同步 schema.ts，然后 `drizzle-kit generate --strict` 零 diff

### 双向一致性教训

- DB 实际查询（2026-07-10）：
  - `bot_configs.agent_id`: 3/5 缺失（R34-A migration 只填了 `agents.channel_ids`，没回填 `bot_configs.agent_id`）
  - `agents.channel_ids`: 全部填充 ✓
- 教训：双向同步迁移必须**两端都回填**，不能只看一边

### 测试残留教训

- `R40-A` 解决了"e2e 没 afterAll hook → 每次跑留 12 个残留"
- `R41-B` 解决了"用户授权清理历史残留 12 个"
- `R42-X` 解决了"R42 拆表后 cleanup helper 只清一张表的残留"
- 三步叠起来：cleanup helper 必须支持 type 字段 + e2e 启动跑 test 前缀黑名单 sweep

---

> **下一步**：R44-2 / R44-3 / R44-4 待用户拍板开始
> - R44-2 转为实例（`demoteAgent` 端点恢复）
> - R44-3 复制为模板（`copy-as-template` 端点恢复）
> - R44-4 真人创建 UI 入口（如果丢了的话）
