# R51-E3 · 任务调度(意图识别)设计文档

> **状态**: 待用户拍板(不写实现)
> **作者**: R51-E agent · 2026-07-11
> **背景**: 用户原话 "任务添加后,这个任务要如何被调用执行?是不是依靠意图识别?"

---

## 0. TL;DR

Panmira 当前**已经有一套意图识别系统**,但有 3 条独立的"任务执行"路径,它们各自被不同入口触发,设计目的不同:

| 路径 | 触发方 | 用意图识别? | 当前实现 |
|------|--------|------------|---------|
| **A. Pipeline (DAG)** | 用户手动选 pipeline / 定时 / API | 否(显式绑定) | `agent_pipelines` + `pipeline_runs` |
| **B. 单 Agent Run** | 用户显式指定 agent_id | 否 | `POST /api/v2/agents/:id/run` |
| **C. Bot 路由 (Intent)** | 用户在某个 channel 说一句话 | **是** | `src/api/intent-router.ts` (manual/suggest/auto) |

**关键发现**:
- "任务"(`agent_pipelines` / `scheduled_jobs`) 是 **DAG 或 cron 触发的流程**, 不是意图路由对象。
- **意图识别只用在"用户自然语言输入 → 选 bot"** 这一场景,即 `bot` 入口(`/api/v2/bots/...`)。
- 当前意图识别是**关键词匹配**,不是 LLM 分类。

**推荐方案**: **保留三路径 + 逐步升级关键词匹配为 LLM 辅助分类**(分阶段实施)。

---

## 1. 当前实现全景

### 1.1 任务(任务调度对象)的两种类型

```sql
-- src/db/schema.ts
agent_pipelines   -- DAG,有向无环图,多个 agent 串/并执行
scheduled_jobs    -- 定时/事件触发,单 agent 周期执行
```

两者都是"任务"的定义,放在 `/api/v2/tasks` 路径下:

```typescript
// src/api/routes/tasks-routes.ts
GET /api/v2/tasks
//   → 聚合 agent_pipelines + scheduled_jobs
//   → 返回 [{ task_type: 'pipeline' | 'scheduled', id, name, is_active, ... }]
```

**任务的"添加"路径**:

```
用户 → /tasks 新建 → 选 agent 节点(DAG) → 写入 agent_pipelines
用户 → /tasks 定时 → 选 agent + cron  → 写入 scheduled_jobs
```

**任务的"执行"路径**(pipeline 视角):

```
agent_pipelines 表 → pipeline-engine.ts(DAG 引擎)→ 拓扑排序
  → 按节点顺序 invokeRealAgent(templateId, query)
    → agent-run-routes.ts:runAgent (同 agent_run 的单点调用)
```

详见 `src/services/pipeline-engine.ts` 第 22-50 行。

### 1.2 意图识别 — 现状

#### 1.2.1 实现 1:`src/agents/intent/router.ts`(BaseAgent 版本)

```typescript
// 关键词分类(classifier.ts)
KEYWORDS = {
  TASK:     ['执行','完成','做','处理','安排','创建','生成','写','开发'],
  COLLAB:   ['协作','一起','帮忙','转交','分配','协同'],
  QUERY:    ['查询','什么','多少','怎么','如何','为什么','哪','了解'],
  APPROVAL: ['审批','批准','同意','拒绝','审核','确认'],
  ADMIN:    ['配置','设置','管理','添加','删除','修改','权限'],
}
// → 输入字符串 → 统计命中 → 返回最高分类
// → 置信度 = min(命中数 / 3, 1)

// 选 agent(selector.ts)
ROLE_KEYWORDS = {
  cfo: ['财务','预算','成本','利润','投资','融资','资金','账'],
  cto: ['技术','架构','开发','部署','系统','代码','服务器','数据库'],
  ...
}
// → 输入字符串 → 对每个 agent 累加关键词分 → 选最高分 agent
// → confidence 固定 0.7 或 0.4(命中 0 时)
```

调用方:`src/api/routes/agent-routes.ts:27` 在某个老路由里 new IntentRouter(agents) 用。

**问题**:
- 关键词覆盖窄(中文固定 8-10 个)
- 置信度是假的(没有真正的概率,只是命中数 / 3 上限到 1)
- 没有 LLM 介入

#### 1.2.2 实现 2:`src/api/intent-router.ts`(Bot 版本,生产路径)

```typescript
// 按 mode 决定行为(环境变量 INTENT_ROUTER_MODE):
export type RouterMode = 'auto' | 'suggest' | 'manual';

// manual: 默认 bot,不分类(单 bot 也走这路)
// suggest: 评分,建议但不执行
// auto: 评分,自动选 bot

// 评分仍是关键词匹配(against bot name/desc/specialty)
```

**当前生产模式 = `manual`**(从 `intent-router.ts:28` 默认值)。

调用入口:`src/api/http-server.ts:160` 单例注入 `IntentRouter`,通过 `src/index.ts:184` 启动。

#### 1.2.3 两条实现的对比

| 维度 | BaseAgent router | Bot router(生产) |
|------|------------------|-------------------|
| 触发场景 | 老 `agents` 表 | `bots` 表(channel 入口) |
| 路由对象 | `BaseAgent` 实例 | `BotInfo`(channel 维度) |
| 触发方式 | API 调用直接 new | 单例 + env var 控制 mode |
| 生产使用 | **否**(被 R15-A 替换) | **是**(默认 manual) |
| 替代关系 | `src/api/routes/agent-routes.ts` 里残留 | 真生产路径 |

### 1.3 三条"任务执行"路径的完整调用链

```
路径 A — Pipeline(DAG)
═══════════════════════
  UI: /tasks 列表 → 新建 pipeline(画 DAG)
  DB: agent_pipelines 表 + agent_pipeline_nodes(jsonb)
  触发:
    ① 用户手动:  /api/v2/tasks/pipelines/:id/run
    ② 定时:      scheduled_jobs.trigger_type=cron → 触发
    ③ 事件:      scheduled_jobs.trigger_type=event → 触发
  执行:
    src/services/pipeline-engine.ts
      → 解析 DAG
      → 拓扑排序
      → 顺序执行节点
      → 每个节点 invokeRealAgent(templateId, query)
        → callLlm(...) — 真 LLM 调用(R33-A 路由)
        → 写 pipeline_runs.node_states
  意图识别: ❌ 无(用户已显式选了 pipeline 和节点)

路径 B — 单 Agent Run
══════════════════════
  UI: /employees/:id 详情页 → "运行" 按钮
  API: POST /api/v2/agents/:id/run
  Body: { query: string }
  执行: agent-run-routes.ts → callLlm + buildRagContext
  意图识别: ❌ 无(agent_id 在 URL 里)

路径 C — Bot 路由(意图识别)
════════════════════════════
  UI: 用户在 chat channel(钉钉/微信/web) 发一条消息
  API: POST /api/v2/bots/... (具体路径按 channel 不同)
  入口: src/api/intent-router.ts 的 IntentRouter.route(msg, bots)
  执行:
    mode=manual → 用当前 bot
    mode=auto   → 关键词匹配选 best bot → 转发
    mode=suggest→ 评分但回 200 让人确认
  意图识别: ✅ 关键词(选哪个 bot)
```

---

## 2. 用户原话解读

> "任务添加后,这个任务要如何被调用执行?是不是依靠意图识别?"

"任务" 在 panmira 有两个歧义:

1. **`agent_pipelines` / `scheduled_jobs` 表里的 task**(R50 起的"任务"概念,UI 在 /tasks)→ **不走意图识别**
2. **任意 chat 输入** → 走 intent-router.ts(关键词)

用户大概率问的是 **#1**(因为 R50 重点就在 task 上)。答案:**不靠意图识别**。
任务调用靠 3 种显式 trigger:`manual / cron / event`,每种都明确写在 `scheduled_jobs.trigger_type` 字段里。

但如果用户问的是 **#2**(chat 路由),那答案是:**靠,但只是关键词匹配,不是 LLM**。

---

## 3. 候选方案(待用户拍板)

### 方案 A · 保持现状,只补强意图识别关键词库

**做什么**:
- `src/agents/intent/classifier.ts`:扩 Intent 5 大类的关键词(各语言 + 行业术语)
- `src/agents/intent/selector.ts`:扩每个 role 的关键词
- 加 R51-X 字段:`agent.keywords text[]` 表个性化关键词覆盖
- 加 `selector.ts` 的失败 fallback:0 命中时 **强制走 ask-user**("你想让哪个 bot 接手?")
- 加 unit test:覆盖 50+ 中文输入样本

**代价**: 1-2 个 PR,backend-only,无前端改动
**优点**: 零风险,立刻可见效果
**缺点**: 仍是关键词,LLM 时代偏弱

### 方案 B · 升级为 LLM 意图分类

**做什么**:
- 新增 `src/services/intent-llm-classifier.ts`
- prompt: `"判断以下用户输入的意图 + 推荐 agent。可选 agent 列表: [...]"`
- 用 `callLlm()`(已有,R33-A 路由)调一次 LLM
- 加 cache(同输入复用,key = hash(input + agent_list_version))
- 加开关:`INTENT_CLASSIFIER_MODE=keyword|llm|hybrid`(默认 hybrid,llm 失败降级 keyword)
- 在 `intent-router.ts` 加 `mode='llm'` 选项

**代价**: 2-3 个 PR,backend + 测试,涉及 LLM 调用和 cost
**优点**: 真"理解",能处理多意图、上下文、否定
**缺点**: 延迟 + 成本(每条 chat 多一次 LLM),需 A/B 验证
**风险**: 误判率(用户反而希望某 bot 接,LLM 选了另一个)

### 方案 C · 用户显式选择 + 智能推荐双轨

**做什么**:
- UI 加 `@bot_name` mention 语法(`@销售小李 帮我跟这个客户`)
- mention 命中 → 跳过路由,直接发
- 无 mention → 走意图路由(默认 B 方案 LLM 分类)
- 评分结果在 UI 上展示 3 个候选 + 置信度,用户可一键切换(兜底)
- 数据回收:`bot_route_log` 表记录每次路由选择(用户最终选了谁),用于训练

**代价**: 3-4 个 PR,frontend + backend + 数据回收
**优点**: 用户可控 + 数据闭环 + 长期可优化
**缺点**: 改动大,要前后端协作 + 用户教育("@" 语法)
**风险**: 数据回收表需要 schema 迁移 + 隐私合规

---

## 4. 推荐方案

**短期(S51-S52,1-2 周)**: **方案 A**(纯关键词扩库 + fallback)
- 不动生产路径,只补 `selector.ts` 关键词和覆盖率
- 给 `intent-router.ts` 的 mode 加 `keyword-strict`(0 命中时强制走 fallback)
- 加 unit test

**中期(S53-S55,1 个月)**: **方案 B**(LLM 分类)
- 默认 mode=hybrid,keyword 命中 >=2 时跳过 LLM(快路径)
- 否则走 LLM 分类,缓存到 Redis(已有 R49 embedding 基础设施)
- 加 cost 监控:每日 LLM 意图分类调用数 + cost 上限

**长期(S56+)**:**方案 C**(mention + 数据回收)
- 等业务规模到一定量级(单日 chat > 10K)再做
- 拿 6 个月的 `bot_route_log` 训练一个轻量分类模型
- 完全替代 LLM 分类,降本

---

## 5. 不做什么(本设计 doc 范围)

- ❌ **不**改 `agent_pipelines` / `scheduled_jobs` 表 — 它们是显式 trigger,不需要意图识别
- ❌ **不**改 `pipeline-engine.ts` — 它接收已选定的 agent 列表,无路由逻辑
- ❌ **不**改 `agent-run-routes.ts` — 它接收 `agent_id` in URL,无路由逻辑
- ❌ **不**新建 `bot_route_log` 表 — 留给方案 C
- ❌ **不**写任何实现代码 — 本 doc 只到拍板阶段

---

## 6. 关键文件路径(实施时直接读)

| 文件 | 用途 |
|------|------|
| `src/agents/intent/classifier.ts` | Intent 关键词分类(5 大类) |
| `src/agents/intent/router.ts` | IntentRouter(BaseAgent 版本,生产未用) |
| `src/agents/intent/selector.ts` | 按 role 关键词选 agent |
| `src/api/intent-router.ts` | IntentRouter(Bot 版本,生产路径) |
| `src/api/http-server.ts:160` | IntentRouter 单例注入点 |
| `src/api/routes/agent-routes.ts:27` | 老路由残留调用 |
| `src/api/routes/tasks-routes.ts` | /api/v2/tasks 聚合(pipeline + scheduled) |
| `src/services/pipeline-engine.ts` | DAG 执行引擎 |
| `src/db/schema.ts:1097` | agent_pipelines 表 |
| `src/db/schema.ts:1035` | scheduled_jobs 表 |
| `src/db/schema.ts:1136` | pipeline_runs 表 |
| `migrations/2026_07_08_r13d_tasks.sql` | tasks 表 + 模板分类字段 |

---

## 7. 决策记录

- **2026-07-11** 设计 doc 完成,等用户拍板选 A / B / C / 组合方案。
- 拍板后立即进 R52 实施(2 周内可上 hybrid mode)。

---

> **下一步**:用户决定走 A/B/C 哪个(或组合),agent 才会动 `src/agents/intent/` 下的代码。
> 在此之前,该目录不能动。
