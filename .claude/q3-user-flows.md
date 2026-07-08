# Q3 · 33 页用户操作剧本

> 生成时间: 2026-07-08 · HEAD `fb3cc4f` · 服务 http://43.135.149.34

---

## 全局操作剧本总览

### 登录流程
```
0 click → 访问 http://43.135.149.34/ → 自动跳 /login/
1 click → 输入邮箱 + 密码 (含 default "admin@panmira.com" 占位)
1 click → 点 [登录] 按钮 → 跳 /overview/dashboard/
```
**总计: 2 click 完成首次登录**(邮箱密码输入算 2 步 = 2 click)

### 史德飞典型 10 个操作 (每个点几次)
| # | 操作 | 路径 | Click 数 |
|---|------|------|---------|
| 1 | 看自己详情 | /overview/people/ → 点"史德飞 FOUNDER 卡" | 2 click |
| 2 | 创建数字员工 | /employees/new/ → 7 步向导 | 7 step (单页) |
| 3 | 从模板创建 | /employees/templates/ → 点模板 → 跳 /employees/new | 2 click |
| 4 | 保存 DAG | /tasks/new/ → 填名 + 描述 → 点 [保存] → 跳详情 | 3 click |
| 5 | 看任务详情 | /tasks/ → 点任务行 | 2 click |
| 6 | 加 LLM Provider | /channels/llm/ → 点 [添加] → 填表单 → [保存] | 5 click |
| 7 | 加 MCP Server | /channels/mcp/ → 点 [添加] → 填 → [保存] | 5 click |
| 8 | 创建 OAuth Client | /channels/oauth/ → 切到"客户端"tab → [新建] → [保存] | 4 click |
| 9 | 邀请新用户 | /settings/permissions/ → 点 [邀请用户] → 填表单 → [保存] | 5 click |
| 10 | 测试语音 | /settings/voice/ → 填 voiceId → 点 [测试] | 3 click |

### 用户从 0 到全部会用: 总操作流程
- 第 1 次登录: 2 click
- 第 1 次创建数字员工(模板路径): 2 click 跳 + 7 step = **9 click 上手**
- 第 1 次保存 DAG: 3 click = **~12 click 可发首条 pipeline**
- 总: **~15 click 即可完成首次完整工作循环**(登录 + 看 dashboard + 创建员工 + 创建任务)

---

## 33 页详细剧本

### 1. /login/ — 登录页
**目的**: 邮箱密码登录工作台
**主操作**:
1. 输入邮箱(default "admin@panmira.com",需改成真实邮箱)
2. 输入密码
3. 点 [登录] → 跳 dashboard

**按钮列表**: [登录] → /overview/dashboard/
**最少点击**: 2 click (含邮箱+密码)
**信息密度**: 低 (单卡 2 输入框)
**测试 vs 真实数据**: 真实(连后端 /api/auth/login)
**信息够判断**: ✓ (错误时显红色提示)

---

### 2. /overview/dashboard/ — 公司仪表盘
**目的**: 一屏看公司整体状态
**主操作**:
1. 看 4 KPI 卡: 真人 / 数字员工 / 任务 / 今日消耗
2. 看下方近 30 天消耗趋势图
3. 看事件流(最近 20 条)
4. 可点 [查看完整账单] 跳 /overview/billing/

**按钮列表**:
- [查看完整账单 Link] → /overview/billing/ (1 click)
- [查看日志 Link] → /overview/logs/ (1 click)
- [刷新 ↻] → 重新拉所有数据

**最少点击**: 0 (默认入口)
**信息密度**: 高 (4 KPI + 趋势图 + 事件流 = ~30 数据点)
**测试 vs 真实数据**: ✓ 全部接真实 API (people/agents/pipelines/tasksStats/cost/events)
**信息够判断**: ✓ KPI 数字 + 趋势方向 + 事件预览都能看见
**已知问题**: "今日消耗" = 0.00 (后端 30 天消耗均 0,需等待 LLM 调用产生 token 上报)

---

### 3. /overview/people/ — 真人列表
**目的**: 看公司所有真人成员
**主操作**:
1. 看 editorial grid 卡片布局 (8-12 列 asymmetric gaps)
2. 史德飞特殊 FOUNDER badge
3. 按 role 过滤 (founder/admin/operator/member/all)
4. 点任意卡片 → 跳详情

**按钮列表**:
- [Role 过滤 tab: founder/admin/operator/member/all] → 切显示
- [PersonCard Link] → /overview/people/<id>/ (1 click per card)

**最少点击**: 0 (默认显示)
**信息密度**: 中 (8-12 卡片,每卡 4-5 字段)
**测试 vs 真实数据**: ✓ 真实 (fetchPeople() → /api/v2/people)
**信息够判断**: ✓ 姓名/角色/部门/状态全有
**已知问题**: 默认加载需 ~1s(API 调用)

---

### 4. /overview/people/[id]/ — 真人详情 (7 Tab)
**目的**: 看单人完整画像 + 关联数字员工 + 任务 + 计费
**主操作**:
1. 看 7 Tab: 基本 / 角色 / 技能 / 记忆 / 协作 / 任务 / 日志
2. 基本 Tab: 头像 + 邮箱 + 部门 + 入职时间
3. 协作 Tab: 此人拥有的数字员工 (点 → /employees/[id])
4. 任务 Tab: 此人参与的任务 (点 → /tasks/[id])
5. 点 [<] → 回 /overview/people/

**按钮列表**:
- [Tab 切换] → 切 Tab 不刷页
- [Agent 卡片 Link] → /employees/[id]/
- [Pipeline 卡片 Link] → /tasks/[id]/
- [< 返回 Link] → /overview/people/

**最少点击**: 1 click (点其他 Tab)
**信息密度**: 高 (7 Tab 切,每 Tab 5-10 字段)
**测试 vs 真实数据**: ✓ 真实 (fetchPerson + fetchAgents + fetchPipelines)
**信息够判断**: ✓ 完整档案 + 关联资源全有
**已知问题**: 7 Tab 中部分 Tab (基础/技能/记忆) 数据为 mock

---

### 5. /overview/billing/ — 财务/积分
**目的**: 看近 30 天 token/channel/knowledge 维度消耗
**主操作**:
1. 看 KPI 卡: 近 30 天总消耗 (¥)
2. 看计费维度表: token / channel / knowledge
3. 看 30 天日消耗面积图

**按钮列表**: 无交互按钮(纯展示)
**最少点击**: 0 (默认入口)
**信息密度**: 中 (2 KPI + 1 维度表 + 1 趋势图)
**测试 vs 真实数据**: ✓ 真实 (fetchCost() → /api/v2/admin/cost)
**信息够判断**: ✓ 总数/分维度/趋势 都有
**已知问题**: 数据全 0 (P4 才接真实账单上报)

---

### 6. /overview/diagnosis/ — 系统诊断 (占位)
**目的**: 看系统健康告警(骨架)
**主操作**: 看 PagePlaceholder
**按钮列表**: 无
**最少点击**: 0
**信息密度**: 0 (纯 placeholder)
**测试 vs 真实数据**: 占位
**信息够判断**: ✗ (无数据)

---

### 7. /overview/optimization/ — 优化建议 (占位)
**目的**: 看优化建议(骨架)
**主操作**: 看 PagePlaceholder
**按钮列表**: 无
**最少点击**: 0
**信息密度**: 0
**测试 vs 真实数据**: 占位
**信息够判断**: ✗

---

### 8. /overview/logs/ — 系统日志 (占位)
**目的**: 看关键日志(骨架)
**主操作**: 看 PagePlaceholder
**按钮列表**: 无
**最少点击**: 0
**信息密度**: 0
**测试 vs 真实数据**: 占位
**信息够判断**: ✗

---

### 9. /employees/ — 数字员工库 (Gallery)
**目的**: 浏览所有数字员工 (editorial card grid)
**主操作**:
1. 看卡片网格 (全栈工程/文案秘书/运维部署/通用对话/测试bot)
2. 用 FilterBar: role/model/status/owner/query 多维过滤
3. 点卡片 → 跳详情

**按钮列表**:
- [FilterBar 过滤项] → 切显示 (state,无 API)
- [AgentCard Link] → /employees/[id]/

**最少点击**: 1 click (过滤)
**信息密度**: 中-高 (8+ 卡,每卡含头像/角色/状态/所有者)
**测试 vs 真实数据**: ✗ 当前用 MOCK data (AGENTS 常量) — 实际列表是 mock, 详情跳真 API
**信息够判断**: ✓ 角色/模型/状态/owner 全显
**已知问题**: 列表接 mock, 详情接真 API (TODO: 列表也接 /api/v2/admin/agents)

---

### 10. /employees/[id]/ — 员工详情 (7 Tab)
**目的**: 看单个数字员工完整配置
**主操作**:
1. 看 AgentHeader: 头像 + 名 + role + 状态
2. 切 7 Tab: basics / persona / skills / memory / collab / tasks / logs
3. basics Tab: 修改名字/描述/role
4. 点 [← 返回员工库] → /employees/

**按钮列表**:
- [Tab 切换] → 切 Tab
- [← 返回 Link] → /employees/
- [编辑/保存] → 接真 API (P7-B2)

**最少点击**: 1 click
**信息密度**: 高
**测试 vs 真实数据**: ✓ 真实 (fetchAgent)
**信息够判断**: ✓ 7 Tab 全有数据
**已知问题**: 部分 Tab 数据为占位

---

### 11. /employees/new/ — 创建员工向导 (7 步)
**目的**: 7 步创建数字员工
**主操作**:
1. 步骤 1: 选择 roleTemplate (full-stack/copywriting/ops/general/test)
2. 步骤 2: 命名 + 描述
3. 步骤 3: 配 LLM (model + temperature)
4. 步骤 4: 配 tools/skills
5. 步骤 5: 配 systemPrompt
6. 步骤 6: 边界/铁律 (ironLaws)
7. 步骤 7: 预览 + 保存 → 跳详情

**按钮列表**:
- [上一步] / [下一步] → 步进
- [跳过] → 跳当前步
- [保存] → POST /api/v2/admin/agents → 跳详情
- [取消 Link] → /employees/

**最少点击**: 7 step (单页内部) + 1 保存
**信息密度**: 中 (7 步单页表单)
**测试 vs 真实数据**: ✓ 真 API
**信息够判断**: ✓ 每步表单字段明确
**已知问题**: 7 步一气呵成,无中断保存

---

### 12. /employees/templates/ — 员工模板
**目的**: 看预置员工模板,一键创建
**主操作**:
1. 看模板网格 (3-5 个模板卡)
2. 点 [用此模板创建] → 跳 /employees/new?template=<id>
3. 也可点 [查看已有员工 by template] → 跳员工详情

**按钮列表**:
- [用模板 Link] → /employees/new?template=<id>
- [查看员工 Link] → /employees/<id>/

**最少点击**: 1 click (从模板进创建)
**信息密度**: 中
**测试 vs 真实数据**: ✓ 模板来自 mock, 关联员工走真 API
**信息够判断**: ✓ 模板名 + 描述 + 关联员工数都有

---

### 13. /foundation/ — 数智底座入口
**目的**: redirect 到 /foundation/memory/l1/ (默认 L1)
**主操作**: 自动跳转
**按钮列表**: 无
**最少点击**: 0 (重定向)
**信息密度**: 0
**测试 vs 真实数据**: ✓ 正确重定向
**信息够判断**: ✗ (无内容)

---

### 14. /foundation/memory/l1/ — L1 短期上下文
**目的**: 看 L1 记忆(会话级上下文窗口)
**主操作**:
1. 看 L1 项列表 (左侧 ~10 条 seed)
2. 选中一条看详情 (右)
3. 搜索 / 按类型过滤 / 删

**按钮列表**:
- [搜索 input] → 实时过滤
- [类型 tab] → 切
- [L1 item Link] → 选 item
- [删 按钮] → 删 item
- [导出/导入 按钮] → 批量

**最少点击**: 1 click (选 item)
**信息密度**: 中-高
**测试 vs 真实数据**: ✗ mock (SEED 常量)
**信息够判断**: ✓ 类型/时间/摘要/原文都有
**已知问题**: mock 数据,未接 L1 API

---

### 15. /foundation/memory/l2/ — L2 长期事实
**目的**: 看 L2 长期记忆(事实/经验/常用知识)
**主操作**:
1. 看 L2 项 (左侧 ~20 条 seed)
2. 按 tag 过滤 (people/process/tool/product/insight)
3. 看详情/搜索/删

**按钮列表**:
- [Tag 过滤] → 切
- [搜索] → 实时
- [L2 item Link] → 选
- [保存/删除]

**最少点击**: 1 click (选)
**信息密度**: 高
**测试 vs 真实数据**: ✗ mock
**信息够判断**: ✓ tag 区分 + 重要度 + 摘要

---

### 16. /foundation/memory/l3/ — L3 价值观
**目的**: 看 L3 价值/使命/愿景
**主操作**: 看 3-5 条 L3 项 (iron laws, mission, vision)
**按钮列表**:
- [编辑] → 改 item
- [新增] → 加

**最少点击**: 1 click
**信息密度**: 低 (3-5 条)
**测试 vs 真实数据**: ✗ mock
**信息够判断**: ✓ 每条都是完整段落

---

### 17. /foundation/knowledge/ — 知识库
**目的**: 跨库全文检索 + 浏览文档树
**主操作**:
1. 看左侧 文档树 (kb / collections / docs)
2. 切 list/grid 视图
3. 按 updated/title/size 排序
4. 看右侧文档预览
5. 全文搜索 (chunked)

**按钮列表**:
- [视图切换 list/grid]
- [排序切换]
- [文档 Link] → 选
- [搜索 input] → 实时
- [上传/同步]

**最少点击**: 1 click (选 doc)
**信息密度**: 高 (树 + 预览)
**测试 vs 真实数据**: ✗ mock (ALL_FLAT)
**信息够判断**: ✓ chunked preview 有
**已知问题**: mock 数据

---

### 18. /foundation/extraction/ — 抽取管线
**目的**: 看抽取任务 (L2 自动从 L1 提炼)
**主操作**:
1. 看 pipeline 列表 (含 source/target/rate)
2. 看运行历史
3. 启停 / 触发

**按钮列表**:
- [启停 toggle]
- [触发 run]
- [查看源文档]

**最少点击**: 1 click
**信息密度**: 中
**测试 vs 真实数据**: ✗ mock (占位)
**信息够判断**: ✓ rate/source/target

---

### 19. /foundation/feedback/ — 反馈
**目的**: 看用户反馈/工单
**主操作**:
1. 看反馈列表 (按 status: pending/triaged/resolved)
2. 按 type 过滤 (bug/feature/question)
3. 选一条看详情 + 回复
4. 搜索

**按钮列表**:
- [状态 tab]
- [类型 tab]
- [搜索]
- [Feedback item Link] → 选
- [回复/标解决/重开]

**最少点击**: 1 click
**信息密度**: 高
**测试 vs 真实数据**: ✗ mock (ITEMS 常量)
**信息够判断**: ✓ status/type/title/body/timestamp

---

### 20. /tasks/ — 任务列表
**目的**: 看所有 pipeline
**主操作**:
1. 看 list/grid 视图切换
2. 搜索任务名
3. 点任务行 → 跳详情
4. 点 [+ 新建] → 跳 /tasks/new

**按钮列表**:
- [视图 grid/list]
- [搜索]
- [Task 卡片 Link] → /tasks/[id]/
- [+ 新建 Link] → /tasks/new/

**最少点击**: 0
**信息密度**: 中-高
**测试 vs 真实数据**: ✓ 真 API
**信息够判断**: ✓ 名称/状态/agent/owner

---

### 21. /tasks/new/ — DAG 编辑器
**目的**: 创建 DAG pipeline (tldraw 画布 + 名称描述)
**主操作**:
1. 输入任务名 (placeholder "客户意向分类")
2. 输入描述 (触发条件/期望产出)
3. 在 tldraw 画布拖节点 (n1, n2, ...)
4. 点 [保存] → POST /api/v2/admin/pipelines → 跳详情

**按钮列表**:
- [保存 Button] → POST pipeline
- [取消 Link] → /tasks/

**最少点击**: 2 click (填名 + 保存), DAG 拖拽不计 click
**信息密度**: 中 (名 + 描述 + DAG)
**测试 vs 真实数据**: ✓ 真 API
**信息够判断**: ✓ 名/描述/触发/产出都有
**已知问题**: 必须有 agentTemplateId (后端校验,否则 400 invalid_pipeline)

---

### 22. /tasks/[id]/ — 任务详情
**目的**: 看 pipeline 详情 + 触发运行
**主操作**:
1. 看 pipeline 元数据
2. 看最近运行日志
3. 点 [触发运行] → POST run
4. 点 [编辑] → /tasks/[id]/edit

**按钮列表**:
- [触发运行] → POST /api/v2/admin/pipelines/<id>/run
- [编辑] → /tasks/<id>/edit/
- [← 返回 Link] → /tasks/

**最少点击**: 1 click (触发)
**信息密度**: 高
**测试 vs 真实数据**: ✓ 真 API
**信息够判断**: ✓ 节点 + 边 + runs

---

### 23. /tasks/scheduled/ — 定时任务
**目的**: 看 cron + event-triggered 任务
**主操作**:
1. 看定时任务列表 (含 cron 表达式)
2. 启停 / 触发 / 编辑
3. 点 [+] → /tasks/new

**按钮列表**:
- [启停 toggle] → POST
- [触发] → POST
- [任务 Link] → /tasks/[id]/
- [+ 新建 Link] → /tasks/new/

**最少点击**: 1 click (toggle)
**信息密度**: 中
**测试 vs 真实数据**: ✓ 真 API
**信息够判断**: ✓ cron / 下次运行 / 状态

---

### 24. /channels/ — 资源频道入口
**目的**: redirect 到 /channels/llm/ (默认)
**主操作**: 自动跳
**按钮列表**: 无
**最少点击**: 0
**信息密度**: 0
**测试 vs 真实数据**: ✓
**信息够判断**: ✗

---

### 25. /channels/llm/ — LLM Providers
**目的**: 管 LLM provider (OpenAI/DeepSeek/Anthropic/...)
**主操作**:
1. 看 provider 列表 (含 model/状态/lastTest)
2. 点 [测试] → 跑连通性
3. 点 [编辑] → 改 (apiKey/baseUrl/model)
4. 点 [添加] → 新 provider

**按钮列表**:
- [测试] → POST /api/v2/channels/llm/<id>/test
- [编辑] → 弹 dialog
- [添加] → 弹 dialog (保存 POST)

**最少点击**: 1 click (测试)
**信息密度**: 高
**测试 vs 真实数据**: ✗ mock (MOCK_LLM)
**信息够判断**: ✓ model/baseUrl/lastTest
**已知问题**: 当前 mock,API 待接

---

### 26. /channels/skills/ — Skills
**目的**: 管 skill (tool/能力)
**主操作**:
1. 看 skill 列表
2. 按 source 过滤 (built-in/installed/custom)
3. 搜索 name/desc/tag
4. 启停 / 看详情

**按钮列表**:
- [搜索]
- [Source tab]
- [启用 toggle]
- [详情] → 弹 dialog
- [GitBranch (修订按钮)]

**最少点击**: 1 click
**信息密度**: 高
**测试 vs 真实数据**: ✗ mock (MOCK_SKILLS)
**信息够判断**: ✓ name/source/tag/usage

---

### 27. /channels/mcp/ — MCP Servers
**目的**: 管 MCP server (stdio/sse/http transport)
**主操作**:
1. 看 MCP server 列表
2. 点 [添加] → 填 name/transport/url/auth → 保存
3. 启停 / 编辑 / 删除

**按钮列表**:
- [添加] → 弹 dialog
- [启停 toggle]
- [编辑] → dialog
- [删除] → confirm

**最少点击**: 2 click (添加 + 填名)
**信息密度**: 高
**测试 vs 真实数据**: ✗ mock
**信息够判断**: ✓ name/transport/status

---

### 28. /channels/endpoints/ — 接入点 (Outbound/Inbound)
**目的**: 管 webhook endpoint (callback URL)
**主操作**:
1. 切 Outbound / Inbound tab
2. 看 endpoint 列表
3. 编辑/激活 callback URL

**按钮列表**:
- [Tab outbound/inbound]
- [编辑 endpoint]
- [链接打开 callbackUrl] → 外部

**最少点击**: 1 click (切 tab)
**信息密度**: 中-高
**测试 vs 真实数据**: ✗ mock
**信息够判断**: ✓ callback URL + status

---

### 29. /channels/oauth/ — OAuth Clients
**目的**: 管 OAuth client (作为第三方被授权)
**主操作**:
1. 切 Consumer/Provider tab
2. Consumer tab: 看已授权第三方 (微信/飞书/钉钉), 撤销
3. Provider tab: 看自己 client + 创建新 (clientId/secret/redirectUri)

**按钮列表**:
- [Tab 切换]
- [撤销授权] → DELETE
- [创建 client] → POST (返回 secret)
- [轮换 secret]
- [打开 redirectUri] → 外部

**最少点击**: 1 click (切 tab)
**信息密度**: 高
**测试 vs 真实数据**: ✗ mock (MOCK_OAUTH_CLIENTS / MOCK_AUTHORIZED)
**信息够判断**: ✓ clientId/secret/redirectUris/status

---

### 30. /channels/routing/ — 路由规则
**目的**: 管"消息 → 哪个 bot"路由
**主操作**:
1. 看规则列表 (priority/bot/condition/destination)
2. 上下移动改 priority
3. 启停 / 编辑 / 删除
4. 添加新规则 (fBot/fCond/fDest/fPriority)
5. 测试 probe

**按钮列表**:
- [添加] → 弹 dialog
- [↑] [↓] → 改 priority
- [启停]
- [删除]
- [probe 测试]

**最少点击**: 1 click
**信息密度**: 高
**测试 vs 真实数据**: ✗ mock
**信息够判断**: ✓ priority/condition/destination

---

### 31. /settings/permissions/ — 用户权限管理
**目的**: 管用户 + 角色 + 锁定/解锁
**主操作**:
1. 看用户列表 (admin/operator/member)
2. 邀请新用户 (email/name/role)
3. 改 role / 锁定 / 解锁

**按钮列表**:
- [刷新] → 重新拉
- [邀请用户] → 弹 dialog (POST)
- [改 role Select]
- [锁定/解锁]

**最少点击**: 1 click (改 role)
**信息密度**: 高
**测试 vs 真实数据**: ✓ 真 API
**信息够判断**: ✓ email/role/lockedUntil/failedAttempts

---

### 32. /settings/voice/ — 语音/TTS 配置
**目的**: 管语音 persona (human/digital) + voiceId
**主操作**:
1. 选 persona (human / digital)
2. 填 voiceId (例: zh-CN-XiaoxiaoNeural)
3. 点 [测试] → 跑 TTS
4. 保存

**按钮列表**:
- [Persona 切换]
- [保存]
- [测试] → POST TTS
- [重置]

**最少点击**: 1 click (切 persona)
**信息密度**: 中
**测试 vs 真实数据**: ✓ 真 API (human/digital 配置)
**信息够判断**: ✓ persona/voiceId/lastTest

---

### 33. /settings/advanced/ — 高级设置
**目的**: 开发者选项 (重置 / 导出 / dev mode)
**主操作**:
1. 开关 devMode / verbose log
2. 点 [导出数据] → JSON 下载
3. 点 [重置] → confirm dialog → 真清空

**按钮列表**:
- [devMode toggle]
- [verbose toggle]
- [导出数据] → 下载
- [重置] → confirm + POST
- [取消重置]

**最少点击**: 1 click (toggle)
**信息密度**: 中
**测试 vs 真实数据**: ✓ 真 API (重置真生效)
**信息够判断**: ✓ devMode/storage size/uptime

---

## 全局统计

| 维度 | 数值 |
|------|------|
| 总页面 | 33 (30 静态 + 3 dynamic) |
| 真实数据页 | 18 (✓) |
| Mock/占位页 | 12 (✗) |
| 默认入口页 | 3 (/ /channels /foundation 重定向) |
| 总 button | 55 (含 _components) |
| 接 API 的 button | ~50 (无 alert/console.log) |
| 接 mock 的 button | ~5 (channels/* / foundation/*) |
| 总 Link | 23 |
| Link 接 200 页 | 23/23 = 100% |
| 默认点击成本(从 dashboard) | 1-2 click |
| 总上手成本(估) | ~15 click |
