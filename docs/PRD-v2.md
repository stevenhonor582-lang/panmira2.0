# Panmira 2.0 产品需求文档（PRD）

> **版本**：v2.0（数字员工编排平台）
> **日期**：2026-07-09
> **分析对象**：`mah` 服务器（43.135.149.34）`~/panmira-N1`（PM2 生产实例，995 commits）
> **文档状态**：基于代码逆向分析 + 现有 docs 综合产出，填补产品视角缺口
> **维护者**：主理人

---

## 0. 为什么写这份文档

Panmira 现有 `docs/` 是**技术部署文档**（怎么装、怎么配、API 清单），但**缺产品视角**：
- 没有 v2.0「数字员工编排」的正式定位文档
- 没有 Bot / Agent / Skills 三层关系的定义
- 没有 197 个 Skills 的能力地图
- 没有 Human-in-the-loop 审批 / DAG Pipeline 的产品 spec

README 还停留在 v1「IM→Claude 桥」叙事，而代码已演进到 v2。**本 PRD 的使命是把产品叙事追上代码现实**，并为前端重构、SaaS 化、对外宣传提供统一基准。

---

## 1. 执行摘要

### 1.1 一句话定位

**Panmira 是一个 AI Agent 中台**——把 AI Agent 全生命周期管理好，把 agent 要用到的资源（技能、知识、模型、渠道）管理好，把企业的知识记忆沉淀好，从而支撑任意业务场景快速搭起 AI agent 团队，并持续迭代优化。

它不是某个具体业务系统（不是外贸系统、不是客服系统），而是**承载各种业务系统的 AI 底座**。每个业务场景（外贸、客服、研发、运营…）有自己的业务系统，业务角色由该业务系统配套定义；panmira 提供的是让这些 agent 跑起来、协作起来、越用越聪明的中台能力。

### 1.2 四件核心事

| 职责 | 内涵 |
|------|------|
| **管好 Agent** | 创建 / 配置 / 编排协作 / 迭代优化 |
| **管好资源** | 技能（Skills）、知识库、模型（LLM Pool）、渠道（IM/MCP）、工具 |
| **沉淀知识记忆** | 对话资产、经验、情报 → 企业 AI 资产，越用越聪明，换 agent 不丢资产 |
| **人机协同** | 真实员工 × AI agent 绑定，agent 支撑员工真实业务，管理者在中台看「人+AI」协同态势 |

### 1.3 谁在用

- **平时**：一个**中台管理员**——维护 agent、配置资源、看运营、做迭代优化
- **业务角色**（如外贸业务员、客服）：由业务系统配套定义，不直接是 panmira 的终端用户

### 1.4 开放可塑（不绑业务）

panmira 不预设「这是给外贸/客服/研发的」。任意需要 AI agent 团队的业务场景都能跑上来。典型：

| 业务场景 | 跑在上面的业务系统配套 |
|----------|----------------------|
| 工业品跨境外贸 | 外贸业务员 / 技术方案工程师 / 多语言内容 / 客户经理 |
| 企业客服 | 客服机器人 / 工单分发 / 知识库应答 |
| 研发辅助 | 代码 agent / 文档 agent / 代码审查 |
| …… | 由各业务系统自行定义角色 |

### 1.5 产品演进（v1 → v2）

| 维度 | v1.0（2025-02）| v2.0（当前）|
|------|----------------|-------------|
| 定位 | IM bot → Claude Code 桥 | **AI Agent 中台** |
| 核心 | 单 bot 对话 | Agent 管理 + 资源管理 + 知识记忆 + 任务编排 |
| 面向 | 个人 IM 聊天 | 业务系统（承载多个）|
| 能力 | 聊天 + 卡片 | 编排协作 + 资源池 + 记忆沉淀 + 迭代优化 |
| 商业 | 自用工具 | 中台化 + 多租户 + OAuth（给业务系统接入）|

### 1.6 核心价值主张

1. **Agent 中台**：一处管理所有 AI agent，统一配置 / 编排 / 迭代
2. **资源池化**：技能 / 知识 / 模型 / 渠道集中管理，agent 按需取用
3. **知识记忆沉淀**：企业 AI 资产持续积累，agent 越用越强，资产不随 agent/员工流失
4. **任务编排协作**：复杂任务 DAG 编排 + 人审节点，多 agent 协同
5. **开放可塑**：不绑业务，任意业务系统都能接入
6. **支撑迭代优化**：运营数据 + 诊断 + agent 评测，持续改进 agent 质量

---

## 2. 目标用户与使用场景

### 2.1 两类使用主体（中台视角）

panmira 作为中台，平时主要是一个**中台管理员**在用；业务能力通过 OAuth 给**业务系统**调用。

**A. 中台管理员（核心用户，平时就 1 人）**
- 谁是：AI 负责人 / 平台运维 / 创业者本人
- 干什么：维护 agent、配置资源（技能/知识/模型/渠道）、看运营、做 agent 迭代优化
- 痛点：agent 越来越多管不过来、资源散落各处、经验无法沉淀、agent 质量难评估难迭代

**B. 业务系统（通过 OAuth 接入，非直接终端用户）**
- 各业务场景的系统（外贸系统 / 客服系统 / 研发工具…）通过 OAuth 调 panmira 的 agent 能力
- 业务系统自带业务角色定义（如「外贸业务员」），panmira 只提供 agent 执行 / 编排 / 记忆底座
- 终端用户（如外贸企业的客户）感知的是业务系统，不直接感知 panmira

### 2.2 中台管理员的核心痛点

| 痛点 | 没有 panmira 时 | panmira 怎么解决 |
|------|----------------|-----------------|
| Agent 管不过来 | 散在各工具，配置不一，无法统一迭代 | 统一 agent 管理 + 模板化 |
| 资源散落 | 技能 / 知识 / 模型各搞各的，无法复用 | 资源池化集中管理 |
| 知识不沉淀 | 经验随对话消失，换 agent 归零 | 知识库 + 三层记忆 |
| 无法迭代优化 | agent 好坏凭感觉，没数据 | 运营仪表盘 + 诊断 + 评测 |
| 协作难 | 多 agent 各干各的，复杂任务搞不定 | DAG 编排 + 人审节点 |

### 2.3 典型业务场景（示例，非全部）

panmira 不预设业务。以下为典型场景，**业务角色由各业务系统配套定义**，panmira 提供底座：

**示例 1：工业品跨境外贸**（业务系统配套外贸角色）
- 业务系统定义角色：外贸业务员 / 技术方案工程师 / 多语言内容运营 / 客户经理
- 跑在 panmira 上：这些角色 = agent，复用 panmira 技能 / 知识 / 编排 / 记忆
- 价值：询盘秒回、技术方案沉淀、多语言内容、长周期跟进、企业数智资产积累

**示例 2：企业客服**
- 业务系统定义角色：客服机器人 / 工单分发
- 跑在 panmira 上：复用知识库应答 + 多渠道 + 人审升级

**示例 3：研发辅助**
- 业务系统定义角色：代码 agent / 文档 agent / 代码审查
- 跑在 panmira 上：复用技能库 + 任务编排

> 关键：业务角色不是 panmira 预置的，而是业务系统带来的。panmira 的价值是让任意业务系统都能快速获得「可管理、可协作、可沉淀、可迭代」的 agent 能力。

### 2.4 核心价值（中台视角）

1. **一处管所有 agent**：创建 / 配置 / 编排 / 迭代统一
2. **资源池化复用**：技能 / 知识 / 模型 / 渠道跨 agent 共享
3. **知识记忆沉淀**：企业 AI 资产持续积累，不随 agent 或人员流失
4. **支撑迭代优化**：数据驱动持续改进 agent 质量
5. **开放接入**：业务系统通过 OAuth 即接即用，业务角色由业务系统定义

### 2.5 中台管理员旅程

```
管理员注册（自动 admin）
  → 搭中台底座：
     1. 配 LLM 模型池（多 provider + 测速）
     2. 建知识库 + 灌技能
     3. 创建/导入 agent（绑技能 + 知识 + 引擎）
     4. 配任务编排（DAG + 人审节点）
     5. 接业务系统（OAuth 授权 + scope）
  → 业务系统调 agent 干活
  → 管理员看运营仪表盘 + 诊断 + 评测，持续迭代 agent
```

---

## 3. 核心概念模型

这是 Panmira 最需要文档化的部分——三层实体关系。

### 3.1 Bot / Agent / Skills 三层体系

```
┌─────────────────────────────────────────────────┐
│  Skills（197 个能力插件）                         │
│  原子能力：superpowers方法论 / SEO / 代码 / 内容  │
│  可被任意 Agent 绑定，可跨实例联邦发布             │
└──────────────────────┬──────────────────────────┘
                       │ 绑定 (bot_skill_bindings)
┌──────────────────────▼──────────────────────────┐
│  Agent（角色模板）                                │
│  = system prompt + 技能集 + 知识文件夹 + 引擎选择 │
│  4 个预置：全栈工程师 / 内容创作 / 知识管家 / 运维 │
│  可作为 is_template 被实例化                      │
└──────────────────────┬──────────────────────────┘
                       │ 实例化
┌──────────────────────▼──────────────────────────┐
│  Bot（数字员工实例）                              │
│  = Agent + IM渠道绑定 + 工作目录 + 预算 + TTS     │
│  生产实例：不盈 / 信言 / 守静 / 得一 / 玄鉴       │
│  （道家命名，人格化）                             │
└─────────────────────────────────────────────────┘
```

| 层 | 是什么 | 数量 | 可复用 |
|----|--------|------|--------|
| **Skill** | 原子能力插件 | 197 | 跨 Agent / 跨实例 |
| **Agent** | 角色模板 | 4 预置 + 自建 | 模板可多次实例化 |
| **Bot** | 运行实例（业务侧称「数字员工」）| 按需创建 | 绑定渠道对外服务 |

### 3.2 五大核心概念

| 概念 | 定义 |
|------|------|
| **中台管理员** | panmira 的使用者，维护 agent / 资源 / 编排，做迭代优化（平时 1 人）|
| **Agent / Bot** | 被管理的 AI 角色，有人格 / 技能 / 知识 / 记忆（业务侧称「数字员工」）|
| **资源池** | 技能 / 知识 / 模型 / 渠道 / MCP，集中管理，agent 按需取用 |
| **Pipeline + 人审** | 多 agent DAG 编排 + 关键节点人工决策 |
| **记忆三层** | public（公共）/ employee（agent 级）/ project（项目级）|

### 3.3 联邦（Federation）

多台 Panmira 实例可组网：
- `PeerManager` 30s 轮询发现对等实例
- `peer:<peerName>` 路由前缀跨实例调用
- Skill Hub 支持跨实例发布/安装技能
- 典型：总部一台 + 各分公司一台，技能共享

### 3.4 开放架构：业务系统接入（panmira 不预置业务角色）

panmira 作为中台**不绑定具体业务**，业务角色由业务系统配套定义，panmira 提供承载这些角色的底座：

```
业务系统（外贸系统 / 客服系统 / 研发工具…）
  ├─ 定义业务角色（外贸业务员 / 客服机器人 / 代码 agent…）  ← 业务系统管
  └─ 通过 OAuth 调用 panmira
        ↓
     Panmira 中台
     ├─ 把业务角色实例化为 Bot（绑技能 + 知识 + 引擎）   ← panmira 管
     ├─ 提供任务编排 + 人审 + 资源池
     └─ 沉淀知识 / 记忆资产
```

**职责边界**：

| 归业务系统 | 归 panmira 中台 |
|-----------|----------------|
| 业务角色定义（叫什么、干什么）| Bot 实例化（绑技能/知识/引擎）|
| 业务流程 | 任务编排（DAG + 人审）|
| 业务数据 | 知识 / 记忆沉淀 |
| 终端用户交互 | 资源池（技能/模型/渠道/MCP）|

- 一套 panmira 可承载多个业务系统（多租户隔离）
- 业务系统侧把 Bot 称「数字员工」；panmira 侧统称 agent / Bot
- 终端用户感知业务系统，panmira 是隐形的底座

> 主理人自用的 5 个道家命名 bot 是内部 dogfooding 用例（帮主理人写代码/做内容），用于验证中台编排能力，不作为产品对外预置标准。

---

## 4. 功能需求

按中台四大职责组织（呼应第 1.2 节）：

| 中台职责 | 功能域 |
|----------|--------|
| **管好 Agent** | 4.2 AI 引擎抽象、4.3 Agent+Pipeline 编排 |
| **管好资源** | 4.1 IM 渠道接入、4.5 Skill Hub、4.6 语音 RTC、4.7 OAuth 接入 |
| **沉淀 + 迭代** | 4.4 知识+记忆、4.8 运营仪表盘 |
| **人机协同** | **4.9 真人×Agent 绑定与协同**（核心）|

### 4.1 IM 渠道接入

**目标**：让数字员工出现在用户已有的沟通工具里，零迁移成本。

| 功能 | 说明 |
|------|------|
| 飞书接入 | WSClient 长连接 + 富卡片交互（流式更新、按钮、表单）|
| Telegram 接入 | grammy 框架 |
| 微信接入 | 加解密消息处理 |
| Web 接入 | WebSocket 实时通道，Web UI 即一个「渠道」|

**用户故事**：作为主理人，我希望同一个数字员工同时挂在飞书和 Telegram，用户从任一渠道找我都能得到一致回答。

**API**：`/api/rtc/*`、`/ws`、`/api/voice`

### 4.2 AI 引擎抽象

**目标**：上层业务代码引擎无关，可随时切换 LLM 供应商。

| 引擎 | 用途 |
|------|------|
| Claude（Agent SDK）| 主力，bypassPermissions 无终端模式 |
| Kimi（Moonshot）| 国产备选 |
| Codex | 代码场景 |
| OpenAI 兼容 | 通吃智谱/DeepSeek/自部署等 |

**用户故事**：作为主理人，我希望按任务类型选不同引擎——代码任务用 Claude，中文内容用智谱，控制成本。

**机制**：routing-rules + models-pool 按规则动态选 provider，含预算/熔断/限流护栏。

### 4.3 Agent + Pipeline 编排（核心差异化）

**目标**：让多个数字员工像团队一样协作完成复杂任务，关键节点人审。

#### 4.3.1 Pipeline DAG 引擎

- **节点类型**：`skill` / `tool` / `conditional` / `parallel` / `human`（人审）
- **执行**：DAG 解析 → 拓扑排序 → 节点状态持久化到 `pipeline_runs.node_states`
- **异步触发**：`POST /api/v2/admin/pipelines/:id/trigger?async=true` → HTTP 202 + `pollUrl` → 前端轮询

#### 4.3.2 人审节点（Human-in-the-loop）

- Pipeline 跑到 `kind=human` 节点 → 状态置 `waiting_for_human` → 暂停
- 外部调用 `decide()` → 恢复执行
- 配合 `approval/{policy,queue}` 实现人机协同闭环
- **典型用例**：报告发布前主理人终审、对外邮件发送前确认

#### 4.3.3 TeamPipeline 场景包

固定 4 阶段流水线：`collect → analyze → produce → review`
- **12 个预设角色场景包**：CTO / CFO / COO / 法务秘书 / 计划秘书 / alex-{dev,content,growth,ops} / lingyan 灵焱
- ReviewPanel 复审节点可打回重做
- ExpertSubagent 通过 MessageBridge.executeApiTask 复用整套 Bot 执行栈

#### 4.3.4 可视化编排

- **xyflow**：网格化 DAG 编辑器（节点拖拽、连线）
- **tldraw**：自由画蓝图（白板式）

**用户故事**：作为主理人，我希望拖拽几个数字员工节点连成流程，设定「分析师产出后必须我审批才发布」，一键运行看进度。

**API**：`/api/v2/admin/pipelines/*`、`/api/v1/approval/*`

### 4.4 知识库 + 记忆系统

**目标**：让数字员工有「长期记忆」和「专业知识」，越用越聪明。

#### 知识库（RAG）
- 文档上传 → 分块 → embedding（pgvector）→ 检索
- 接飞书 docx / wiki / bitable 同步
- `documents` / `document_chunks` / `folders` 表

#### 记忆系统（双套）
- **MetaMemory**（HTTP 服务，8100）：独立记忆服务，可选
- **memory-engine**：存储 / 检索 / 合成

#### 记忆三层（前端 IA）
| 层 | 内容 | 谁可见 |
|----|------|--------|
| **L1 public** | 公司公共知识 | 全员 |
| **L2 employee** | 单个数字员工的个人记忆 | 该员工 |
| **L3 project** | 项目级上下文 | 项目成员 |

**API**：`/api/v2/admin/knowledge-bases/*`、`/api/v1/memory/{store,retrieve,synthesize}`

### 4.5 技能联邦（Skill Hub）

**目标**：一台 Panmira 发布的技能，全网可装。

- SQLite + FTS5 全文检索
- tar 打包 `references/` 分发
- `peer:<peerName>` 前缀跨实例拉取
- 安装来源：本地 / GitHub / peer 实例

**用户故事**：作为平台运营方，我希望总部团队开发的「外贸报价 skill」能一键分发到所有客户的 Panmira 实例。

**API**：`/api/skills/*`（7 端点：列表/搜索/安装/刷新/GitHub安装/插件目录）

### 4.6 语音 RTC

**目标**：数字员工能「打电话」，真实语音对话。

- **STT**：豆包 / Whisper
- **TTS**：豆包 / OpenAI / ElevenLabs
- **实时 ASR**：流式识别
- **RTC 通话**：WebRTC token + VAD 静音检测 + 自动循环（录音→ASR→Agent→TTS→再录音）
- `voiceMode` 强制 `maxTurns=1` 适配实时对话
- 语音会议：`/api/meetings`

**用户故事**：作为主理人，我希望给数字员工配个「电话号码」，客户打电话进来直接 AI 应答。

**API**：`/api/voice`、`/api/rtc/*`、`/api/tts`

### 4.7 OAuth + SaaS 底座

**目标**：为多租户 SaaS 化和第三方接入铺路。

- 授权码流程 + 设备码流程
- 客户端管理（`oauth-clients`）
- Scope 权限控制（如 `agent:read` / `agent:admin`）
- 内部 admin 端点也用 `requireBearer + requireScopes`
- JWT（access 90d / refresh 180d，HS256）

**用户故事**：作为第三方开发者，我希望通过 OAuth 接入 Panmira，只申请 `agent:execute` scope 调用数字员工，不能碰管理功能。

### 4.8 运营仪表盘

**目标**：主理人看得见成本、用量、健康度。

| 模块 | 功能 |
|------|------|
| Dashboard | 资源计数 + 趋势图（token/skill/mcp/kb）+ 系统状态 |
| Runtime Console | 实时会话 + 今日成本 + 按 bot 聚合 |
| 数据分析 | usage / cost / rag-query 统计 |
| 诊断中心 | 平台健康度（Diagnosis）|
| 计费聚合 | Token 计费（R14-D 4 维度）|
| 日志分析 | Bot/Agent 对话日志检索 |

**API**：`/api/v2/admin/{dashboard,billing,logs,diagnose}/*`

### 4.9 真人 × Agent 绑定与协同（人机协同核心）

**目标**：把 AI agent 和公司真实员工绑定，让 agent 直接支撑员工的真实业务，管理者在中台看到「人 + AI」的整体协同态势。

| 功能 | 说明 |
|------|------|
| 员工-Agent 绑定 | 真实员工（人）↔ AI agent 建立对应（一人一助手 / 按岗位）|
| 真实业务支撑 | agent 融入员工**现有**工作流，直接帮他干活（增强而非取代）|
| 协同态势可视 | 管理者看到谁在用 agent、产出多少、成本多少、协作密度 |
| 管理与管控 | 关键节点人审、权限/可见范围、资源配额按员工分配 |
| 组织映射 | 部门 / 职位 / 汇报关系映射到 agent 体系（users 表部门·职位字段）|

**用户故事**：
- 作为员工：我有自己绑定的 AI 助手，它懂我的业务、记得我的工作习惯，融入我日常。
- 作为管理者：我在中台看到全员「人 + AI」协同全景——谁用得好、谁没在用、成本分布、哪里要加强管控。

**呼应**：前端 `/people`、`/employees` 页面；users 表的部门/职位/SID 字段；业务系统打通（员工通过业务系统/IM 用自己绑的 agent）。

---

## 5. 信息架构与交互（前端）

### 5.1 双视角架构（系统管理 + 业务运营）

```
web-next (Next 16 + React 19, port 3200)
├── (admin) 系统管理视角 — 技术基础设施配置
│   └── 19 页：模型池 / 渠道 / OAuth / 权限 / 诊断 / 设置…
└── (app) 业务运营视角 — 从业务运营角度管中台
    └── 34 页：综阅 / 数字员工 / 人员 / 任务编排 / 知识记忆 / 资源频道
```

**设计意图**：公司管理天然分「系统管理」和「业务运营管理」两个视角——

- **(admin) 系统管理**：偏技术基础设施配置（模型 / 渠道 / 权限 / OAuth），偶发、偏 IT
- **(app) 业务运营**：从**业务运营角度**管所有中台与配置（不是纯技术配置），高频、偏运营

> 关键：panmira 是**业务运营导向**的 AI Agent 中台，不是纯技术中台——(app) 壳承载运营管理，是日常主战场。两个壳服务同一个运营管理者，按场景切换视角，**这是有意分工，不是债务**。

### 5.2 (admin) 运营后台（19 页）

| 页面 | 功能 |
|------|------|
| `/dashboard` | 资源计数 + 趋势 |
| `/diagnosis-center` | 平台诊断 |
| `/data-analytics` | 数据分析 |
| `/status` | 健康检查 |
| `/runtime` | Runtime Console（实时会话 + 成本）|
| `/agents` + `/onboarding` + `/templates` + `/jobs` + `/pipelines` | Agent 与 Pipeline 全家桶 |
| `/logs` | Bot/Agent 日志检索 |
| `/knowledge` + `/memory` | 知识库 + 三层记忆 |
| `/models` | LLM 模型池 |
| `/resources` | Skill / MCP 管理 |
| `/oauth-clients` + `/permissions` | OAuth + 权限 |
| `/voice` | 语音配置 |
| `/settings` | 高级设置（用户/编排器）|

### 5.3 (app) 用户工作台（34 页，5 导航组）

| 导航组 | 内容 |
|--------|------|
| **公司综阅** | overview / people / billing / diagnosis / logs |
| **数字员工** | employees（+模板/from-template/test-config）|
| **记忆沉淀** | foundation / memory（L1/L2/L3）/ knowledge / extraction / feedback |
| **任务协作** | tasks（+scheduled/templates/stats）+ DAG 编辑器 |
| **资源频道** | channels（llm/skills/mcp/endpoints/oauth/routing）|

### 5.4 技术栈

| 类别 | 选型 |
|------|------|
| 框架 | Next.js 16 App Router + React 19 + TS 5 |
| 样式 | Tailwind v4 + shadcn + @base-ui/react |
| 可视化 | @xyflow/react（DAG）+ tldraw（白板）+ recharts（图表）|
| 数据 | **openapi-fetch + openapi-typescript**（类型从后端 OpenAPI 生成，`prebuild: gen-types`）|
| 动效 | motion 12 + next-themes（light/dark）|
| 测试 | Playwright（e2e）+ vitest（单测）|

### 5.5 前端已识别的债务

- ❌ **无 i18n**：zh-CN 硬编码，多语言需从零搭（next-intl + 路由重排）
- ⚠️ **路由冗余/灰层**：`channels.bak.p3.5/`、`sidebar.tsx.bak.r17-1`、`chain-editor` 已 redirect 未清理
- ⚠️ **旧 v1 API 仍在用**（`/api/bots`、`/api/agents/`、`/api/skills`），需定迁移路线

> 注：(admin) / (app) 双壳是**有意的「系统管理 vs 业务运营」双视角分工**，非债务。

---

## 6. 数据模型（~35 张表）

### 6.1 核心实体分组

| 域 | 表 |
|----|-----|
| **身份** | users / tenants / audit_logs / voice_identities |
| **Bot/Agent** | bot_configs / bot_secrets / bot_budgets / bot_skill_bindings / agents / templates / teams |
| **会话** | sessions / chat_sessions / session_messages / session_links / clarification_sessions |
| **知识** | documents / document_chunks / folders / memories / memory_settings / skills |
| **Pipeline** | agent_pipelines / pipeline_runs（+ node_states）/ activity_events |
| **运营** | scheduled_tasks / recurring_tasks / coordinator_configs / discovered_groups / routing_bindings / provider_configs / budget_history / sync_config / rag_query_log |

### 6.2 关键关系

```
tenant ──< user
tenant ──< bot ──< chat_session ──< session_message
bot ──> agent (实例化)
agent ──< skill_binding ──> skill
bot ──> agent_pipeline ──< pipeline_run ──< node_state
document ──< document_chunk (pgvector embedding)
```

### 6.3 人机协同的数据结构（现状与缺口）

据 `scripts/schema.sql`，**「真人×Agent 绑定」目前数据模型未充分支撑**：

- `users` 表只有基础字段（id / tenant / email / name / role / feishu_user_id …），**没有「绑定哪个 agent / 数字员工」的字段**
- **没有专门的员工-agent 绑定关系表**（现有绑定表是 `bot_skill_bindings` / `group_memberships` / `routing_bindings`，均非「人 ↔ agent」）

> ⚠️ 这是第 4.9 节「人机协同」核心域的**数据缺口**，需补：
> - **方案 A**：`users` 表加 `primary_agent_id` 等字段（轻量，一人一助手）
> - **方案 B**：新增 `user_agent_bindings` 表（灵活，一人多 agent / 按岗位绑）
>
> 注：`scripts/schema.sql` 可能非最新，需核对 `db_backup_2026_07_08_q1.sql`（最新备份）确认 users 是否已扩部门/职位字段（R11-R13 提交曾扩过）。

---

## 7. 非功能需求

| 维度 | 要求 |
|------|------|
| **性能** | 流式卡片延迟 < 1s；RAG 检索 < 500ms；Dashboard 聚合 < 2s |
| **并发** | 单实例支持 5+ bot 并行会话；Redis 限流热路径 |
| **可用性** | PM2 自动重启（max_restarts=5）；24h 会话过期清理 |
| **安全** | JWT + scope；密钥加密存储（ENCRYPTION_KEY）；OAuth Server；审计日志 |
| **隔离** | 每 chatId 独立工作目录 + Claude session ID；**多租户 + 多业务系统** tenantId 隔离 |
| **成本可控** | 预算管理 + 熔断 + 限流 + token 计费 4 维度 |
| **可扩展** | 4 引擎可插拔；Skill 插件化；联邦横向扩展 |

---

## 8. 系统架构

```
┌──────────────────────────────────────────────────────┐
│  渠道层                                                │
│  飞书(WSClient) / Telegram(grammy) / 微信 / Web(WS)   │
└──────────────────────┬───────────────────────────────┘
                       │ MessageBridge（统一执行枢纽）
┌──────────────────────▼───────────────────────────────┐
│  Panmira 核心（dist/index.js, port 9100）             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────┐ │
│  │ IM 接入  │ │ AI 引擎  │ │ Agent    │ │ Pipeline│ │
│  │          │ │ 4引擎抽象│ │ +Skills  │ │ DAG+人审│ │
│  └──────────┘ └──────────┘ └──────────┘ └─────────┘ │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────┐ │
│  │ 知识+RAG │ │ 记忆双套 │ │ 语音RTC  │ │ OAuth   │ │
│  └──────────┘ └──────────┘ └──────────┘ └─────────┘ │
│  ┌──────────┐ ┌──────────┐                           │
│  │ Skill Hub│ │ 运营仪表盘│                           │
│  └──────────┘ └──────────┘                           │
└──────┬───────────────────────────────────┬───────────┘
       │                                   │
┌──────▼──────────┐              ┌────────▼─────────┐
│  PostgreSQL 16  │              │  web-next SPA    │
│  + pgvector     │              │  (Next 16, 3200) │
│  (5432)         │              │  admin + app 双壳 │
└─────────────────┘              └──────────────────┘
       │
┌──────▼──────────┐  ┌─────────────┐
│  Redis 7 (6379) │  │ MetaMemory  │
│  限流热路径      │  │ (8100,可选) │
└─────────────────┘  └─────────────┘
```

**核心设计**：
- **统一执行枢纽**：IM / Web / 语音 / TeamPipeline / ExpertSubagent 全走 `MessageBridge.executeApiTask`，仅回调不同，复用度极高
- **配置即数据**：`schema.sql`（39KB）单一真相源 + 种子数据，开箱即用
- **会话隔离**：每 chatId 独立工作目录，24h 过期
- **开放接入**：业务系统通过 OAuth + scope 接入中台，一套中台承载多业务系统（多租户隔离）

---

## 9. 部署与运维

### 9.1 部署形态

- **PM2 fork 模式**：`panmira`（9100）+ `web-next`（3200）
- **Docker**：PostgreSQL 16 + pgvector / Redis 7 / MetaMemory（可选）
- **非全容器化**：panmira 本身 build 出 dist 跑裸机 PM2

### 9.2 关键环境变量

| 变量 | 用途 |
|------|------|
| `ANTHROPIC_AUTH_TOKEN` / `BASE_URL` | LLM 接入（支持 Anthropic/OpenAI兼容/智谱）|
| `DATABASE_URL` | PostgreSQL |
| `JWT_SECRET` | 认证 |
| `ENCRYPTION_KEY` | 密钥加密 |
| `API_SECRET` | 内部 API 鉴权 |
| `USE_SDK_CORE_BOTS` | 核心 bot 白名单（得一,玄鉴,不盈,守约）|
| `PANMIRA_SOURCE_NAME` | 本机标识（如 `mah`）|

### 9.3 多实例联邦

- `peers` 配置多台 Panmira（不同端口 9100/9200 互调）
- `PANMIRA_SOURCE_NAME` 标识来源
- Skill Hub 跨实例发布

---

## 10. 已识别的缺口、风险与债务

### 10.1 产品缺口

| 缺口 | 状态 |
|------|------|
| 无 v2.0 产品定位文档 | ✅ 本 PRD 第 1 章已补 |
| 无 Bot/Agent/Skills 三层关系定义 | ✅ 本 PRD 第 3 章已补 |
| 无 Human-in-loop / DAG Pipeline 产品 spec | ✅ 本 PRD 第 4.3 已补 |
| 无用户旅程/场景文档 | ✅ 本 PRD 第 2 章已补 |
| 无 197 Skills 能力地图 | ⚠️ 仍缺，待补 |
| **人机协同数据模型缺失** | ⚠️ 第 6 章发现：users 无 agent 绑定字段、无绑定表 |

> 「PRD 已补」项待落地到 `docs/`（mkdocs 站）对外发布。

### 10.2 技术债务

| 债务 | 现状 | 建议 |
|------|------|------|
| 前端无 i18n | zh-CN 硬编码 | 引入 next-intl（详见 10.4）|
| v1/v2 API 共存 | 250+ 端点含旧 v1 | 定迁移路线，逐步废弃 v1（详见 10.4）|
| 路由冗余文件 | .bak / 已 redirect 未清理 | 清理（详见 10.4）|
| 部署非全容器化 | panmira 裸机 PM2 | 可选 Dockerfile（详见 10.4）|

> 注：(app)/(admin) 双壳是**有意的「系统管理 vs 业务运营」双视角分工**，非债务（见 5.1）。

### 10.3 风险

- **多 LLM 依赖**：Claude SDK 版本锁定（0.2.141），升级有风险
- **密钥管理**：多 provider key 分散，需确保 ENCRYPTION_KEY 安全
- **成本失控**：多 bot + Pipeline 可能 token 消耗大，依赖预算/熔断护栏
- **中台边界模糊**：什么归中台、什么归业务系统，容易越界（中台想做业务功能 / 业务系统想做中台能力），需用 OAuth scope + 职责边界约束

### 10.4 债务解决方案（主理人设计要求 + 方案）

#### 10.4.1 多语言（界面 i18n + agent 内容多语言）

**要求**：界面双语 + agent 内容跟随系统语言；重点市场**东南亚 + 俄罗斯**。

**方案：两层多语言架构**（关键——界面和内容分开，不混做）
- **L1 界面 i18n**（前端文案）：next-intl + 非路由式 locale（不动 68 页路由）→ 渐进抽取高频文案 → 默认 zh-CN → 可回退
- **L2 内容多语言**（agent 产出）：系统/用户设 `language` → agent 配置加 language 字段 → prompt 按 language 生成 → 知识库支持多语言文档版本

**目标语言（基于重点市场，分批）**

| 批次 | 语言 | 覆盖市场 |
|------|------|---------|
| 第 1 批 ✅ | 中文（默认）、英文、俄文 | 俄罗斯 + 通用（**已确认起步**）|
| 第 2 批 | 越南语、泰语、印尼语 | 东南亚主力 |
| 第 3 批 | 马来语、菲律宾语、缅甸/高棉 | 东南亚补全 |

**风险**：
- 内容多语言依赖 LLM 对小语种的支持质量（俄/越南/泰需实测模型能力）
- 多语言内容存储（知识库文档多语言版本管理）

#### 10.4.2 API 重构（彻底废除 v1，按中台定位重设计）

**要求**：彻底废 v1，按中台定位做最优方案（非简单迁移）。

**方案**：
1. 梳理现有 250+ 端点清单
2. 按中台四职责（管 agent / 管资源 / 沉淀 / 人机协同）重新归类
3. 设计统一新 API（资源命名 / scope / 版本统一）
4. 前端逐步切换到新 API
5. 废弃旧 v1/v2 端点

配合 OpenAPI 文档化（已在 luoxuan 启动）。

**风险**：工作量大（250+ 端点重设计 + 前端联动），建议按职责域分批推进。

#### 10.4.3 路由冗余清理

**要求**：全部清理。

**方案**：删除所有 `.bak` 文件 + 已 redirect 的死路由 → 前端构建跑一遍确认无引用 → 提交。工作量小、风险低，可立即执行。

#### 10.4.4 全容器化

**要求**：全部容器化，后期好部署。

**方案**：
- 生产级 Dockerfile（panmira 已有，优化多阶段构建减小镜像）
- web-next 容器化（Next.js standalone 模式）
- `docker-compose.yml` 编排：panmira + web-next + PostgreSQL(pgvector) + Redis + MetaMemory
- 一键 `docker compose up -d` 部署
- 后期可选 k8s + helm chart

**风险**：pg 原生模块、playwright 浏览器容器化需正确基础镜像（node:22-slim + 编译工具链）。

---

## 11. 产品路线图

### 11.1 已完成（995 commits）
- ✅ v1 IM 桥 + 多 bot + 会话隔离
- ✅ AI Agent 中台底座（agent 管理 + 资源池 + 编排）
- ✅ DAG Pipeline + 人审节点
- ✅ 三层记忆 + 知识库 RAG
- ✅ OAuth Server + 多租户
- ✅ 运营仪表盘 + 计费 + 诊断

### 11.2 下一步（按优先级，结合第 10.4 债务方案）

| 优先级 | 内容 | 出处 |
|--------|------|------|
| **P0** | 路由冗余清理（全删 .bak / 死路由）| 10.4.3 |
| **P0** | 本 PRD 落地 `docs/`（产品叙事对齐）| 10.1 |
| **P1** | 人机协同数据补全（users 绑定字段 / 新表）| 6.3 |
| **P1** | 多语言第 1 批：中英俄（界面 + agent 内容）| 10.4.1 |
| **P1** | Skills 能力地图（197 分类）| 10.1 |
| **P2** | API 重构（彻底废 v1，按中台定位重设计）| 10.4.2 |
| **P2** | 全容器化（docker-compose 一键部署）| 10.4.4 |
| **P3** | 多语言第 2/3 批（东南亚语种）| 10.4.1 |
| **P3** | 模板市场 / 联邦扩展 | — |
| **P3** | 移动端 | — |

---

## 附录

### A. API 规模

- **总端点**：~250+ REST
- **v1**：~95 唯一路径
- **v2**：139 唯一路径（admin 后台为主）
- **路由文件**：63 个 .ts

### B. 主理人自用 Bot（内部 dogfooding，非产品预置）

> 这 5 个道家命名 bot 是**主理人自用**的个人业务助手（写代码 / 做内容），用于验证中台编排能力。**不是产品对外预置标准**——产品预置角色由业务系统配套定义（见 3.4）。

| Bot | 道德经寓意 | 实际用途 |
|-----|-----------|---------|
| 不盈 | 「大盈若冲，其用不穷」| 主理人个人助手 |
| 信言 | 「信言不美」| 主理人个人助手 |
| 守静 | 「守静笃」| 主理人个人助手 |
| 得一 | 「天得一以清」| 主理人个人助手 |
| 玄鉴 | 「涤除玄鉴」| 主理人个人助手 |

### C. Skills 能力范围（197 个）

- superpowers 方法论（13 个：brainstorming/debugging/TDD/planning...）
- 代码工程（coding-standards / api-design / claude-api）
- 内容运营（SEO / 内容创作 / 平台运营）
- 业务能力（外贸 / 知识管理）

### D. 术语表

| 术语 | 定义 |
|------|------|
| **中台管理员** | panmira 的使用者，维护 agent/资源/编排，做迭代（平时 1 人）|
| **业务系统** | 跑在 panmira 上的业务应用（外贸/客服/研发系统），定义业务角色 |
| **Agent / Bot** | 被管理的 AI 角色（业务侧称「数字员工」）|
| **人机协同** | 真实员工 × AI agent 绑定，支撑真实业务 |
| **主理人** | panmira 的拥有者 / 最高管理员 |
| **资源池** | 技能 / 知识 / 模型 / 渠道 / MCP，集中管理 |
| **Pipeline** | 多 Agent DAG 流程 |
| **人审节点** | Pipeline 中暂停等真人决策的节点 |
| **联邦** | 多 Panmira 实例组网 |
| **Skill Hub** | 跨实例技能市场 |

---

> **文档结束**。本 PRD 基于 `~/panmira-N1`（995 commits）逆向分析，填补现有 docs/ 的产品视角缺口。后续迭代以本文档为产品基准，技术细节参考 `docs/`（mkdocs 站）。
