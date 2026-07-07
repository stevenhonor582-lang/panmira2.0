# Panmira Multi-Agent Platform · Session Handoff (2026-07-07)

## 本次会话范围
用户提出 2 个架构问题,推动整个 panmira 平台从"模块维度 IA"重构为"多 Agent 平台":
1. **Bot↔Agent 关联**: 1 模板 + 微信/飞书 bot = 1 员工 + N 部署
2. **多 Agent 编排**: 内容生产场景,选题→协作→审核 互相工作,由总管协调

## 已完成(3 个阶段,1 次大重构)

### Phase 1 · 3 部署形态 (commit 9e7e598c)
**DB schema**:
- `agents.deployment_type` (bot/job/api/mixed)
- `bot_configs.agent_template_id` (FK to agents)
- `scheduled_jobs` (cron/event/manual triggers)
- `agent_run_logs` (统一调用审计)

**API**:
- /scheduled-jobs CRUD + trigger
- /agent-run-logs list + stats
- /agents/:id PATCH 接受 deploymentType + 完整 blueprint

**UI**: /agents/jobs 页面 + 侧栏"定时任务 / 事件"

### Phase 2 · Pipeline 引擎 (commit 3f83925f)
**DB**:
- `agent_pipelines` (DAG 定义)
- `pipeline_runs` (执行实例 + nodeStates)
- `agent_messages` (inter-agent 审计)

**引擎** (src/services/pipeline-engine.ts, 252 行):
- 拓扑排序 (Kahn 算法)
- Cycle detection (DFS)
- 顺序执行,n1.output → n2.input 状态传递
- v0: invokeAgent() 是模拟 (50ms sleep + mock)

**API** (src/api/routes/pipeline-routes.ts):
- /pipelines CRUD
- /pipelines/:id/trigger (同步执行)
- /pipelines/:id/runs + /:runId (run 历史 + 详情)

### Phase 2.5 · Pipeline UI (commit da100691)
**3 个新页面**:
- `/agents/pipelines/new` - JSON 创建 form
- `/agents/pipelines/[id]` - DAG SVG 可视化 + run 历史
- `/agents/pipelines/[id]/runs/[runId]` - 节点时间线 (每个节点的 input/output/error)

### UI 反馈修复 (commit beefefad)
- 按钮 click 后 "运行中…" loading 状态
- 右下角 toast 反馈(成功 / 失败 / 耗时)

## ⚠️ 真实 vs 模拟(必读)
| 部分 | 状态 |
|---|---|
| **DB / API / 引擎(DAG)** | ✅ 100% 真实 |
| **侧栏 IA / 跳转 / 重定向** | ✅ 100% 真实 |
| **Bot 触发 Pipeline** | ❌ 缺 |
| **Cron 真正执行** | ❌ 缺 |
| **Agent invokeAgent()** | ❌ **mock**(50ms sleep + 返回固定字符串) |
| **LLM 集成(Claude/CC SDK)** | ❌ 缺 |
| **画布编辑器(react-flow)** | ❌ 缺 |
| **Retry/Timeout 实际执行** | ❌ 字段有,逻辑无 |
| **并行执行 / 分支** | ❌ 缺 |

**核心结论**:脚手架全部到位,**只差把 mock 换成真实 LLM 调用**。

## 已部署 + 验证
- **main HEAD**: `da100691` (已 push origin)
- pm2 panmira PID 34 online · 9100
- pm2 web-next PID 37 online · 3200
- 4 路由 E2E 全 200: /pipelines /pipelines/new /pipelines/[id] /pipelines/[id]/runs/[runId]

## 主仓库 + 部署
- **主仓库(唯一)**: `/home/ubuntu/panmira`
- **pm2 cwd**: `/home/ubuntu/panmira/apps/web-next`
- **N1 worktree**: 只用作 git remote 推送(主仓库 main checkout 在 N1)

## Git 状态
| commit | 内容 |
|---|---|
| `da100691` | Pipeline UI 3 pages |
| `9df2d264` | Pipeline UI commit (fix/memory-system) |
| `beefefad` | pipeline UI feedback fix |
| `8d334af6` | pipeline trigger toast |
| `ba1888c5` | merge phase 2 engine |
| `3f83925f` | phase 2 engine |
| `f04a3555` | handoff phase 1 |
| `471e9b0c` | merge phase 1 |
| `9e7e598c` | phase 1 - 3 deployment forms |

## 用户工作风格(必看)
写入了 `.claude/memory/panmira-user-style.md`:
- **不要问选 A/B/C** — 用户表达目标后直接做
- **要一次做完** — 不要分 N 个小 commit 打补丁
- **要一个干净版本** — 删除重复,不保留历史堆积
- **单源真相** — 只在一个目录工作(主仓库)
- **build 脚本 + tsconfig** — 用 `tsc -p tsconfig.build.json` + `npm run build:web`

## 关键路径
```
主仓库:
  /home/ubuntu/panmira/
  ├── apps/web-next/app/(admin)/
  │   ├── agents/              ← 本会话大量改动
  │   │   ├── page.tsx         列表
  │   │   ├── templates/       蓝图深度编辑器
  │   │   ├── jobs/            定时任务 (NEW)
  │   │   └── pipelines/       多 Agent 编排 (NEW)
  │   │       ├── page.tsx
  │   │       ├── new/page.tsx
  │   │       └── [id]/
  │   │           ├── page.tsx
  │   │           └── runs/[runId]/page.tsx
  │   ├── kb/                  3 类记忆 (NEW)
  │   │   ├── public/, agents/, projects/, embedding/
  │   ├── bots/conversations/  Bot 对话日志
  │   ├── runtime/             Runtime Console
  │   ├── skills/dags/         Skill DAG Editor
  │   └── ...
  ├── src/
  │   ├── api/routes/
  │   │   ├── pipeline-routes.ts            (NEW Phase 2)
  │   │   ├── scheduled-jobs-routes.ts      (NEW Phase 1)
  │   │   ├── agent-run-logs-routes.ts      (NEW Phase 1)
  │   │   └── ...
  │   ├── services/pipeline-engine.ts        (NEW)
  │   └── db/schema.ts                        (+7 表)
  ├── package.json                            (build script fixed)
  └── .claude/handoff-*.md                   (3 个 handoff)

N1 worktree (/home/ubuntu/panmira-N1):
  - 仅用作 git remote 推送(主仓库 main 在这里 checkout)
  - 不要在这里编辑代码!
```

## Build 脚本关键修复(commit 8d334af6)
**build 之前 broken**:
1. `npm run build` 调 `tsc` 默认 tsconfig.json (有 noEmit:true) → dist 不更新
2. `npm run build` 缺 `build:web`(vite build) → dist/web 空

**现在**:
```json
"build": "npm run build:web && tsc -p tsconfig.build.json && cp -r src/memory/static dist/memory/static && cp -r config dist/config && node scripts/copy-web-staging.mjs"
```

每次部署必须:
```bash
cd /home/ubuntu/panmira
npm run build
pm2 reload panmira  # 后端
pm2 reload web-next  # 前端
```

## 浏览器验证入口
```
https://deepx.fun/web-next/login/
  admin@panmira.com / admin123

侧栏结构(IA v2):
  🎛️ 控制台
    - 总览 Dashboard / 预警中心 / 异常诊断

  🤖 Bot 工作室
    - Agent 模板
    - Bot 对话日志
    - Runtime Console
    - 蓝图深度编辑器
    - 定时任务 / 事件 (NEW Phase 1)
    - 多 Agent 编排 (NEW Phase 2)  ← 新加的
      → /agents/pipelines/ (列表)
      → /agents/pipelines/new (创建)
      → /agents/pipelines/[id] (详情 + DAG SVG)
      → /agents/pipelines/[id]/runs/[runId] (timeline)

  📚 数智与记忆
    - 知识库总览
    - 公共记忆 (type=company)
    - 数字员工记忆 (type=personal)
    - 项目记忆 (type=department)
    - 数智底座 (Embedding)

  🔌 资源池 / 📊 运营 / ⚙️ 系统
```

## Phase 3 待办(从最重要开始)
1. **接真实 LLM** — 替换 `src/services/pipeline-engine.ts` 的 `invokeAgent()` 模拟:
   ```typescript
   // 查 agents 表拿 template.orchestration/tools/KB map
   // 用 template.systemPrompt + tools + KB 调用 Claude/CC SDK
   // 返回真实 tokens + cost
   ```
   预计 1-2 天

2. **Bot 消息 → Pipeline 触发** — 微信/飞书消息进入时查 `bot_configs.agent_template_id` 找关联 pipelines,自动 trigger
   预计 0.5 天

3. **Cron 实际跑** — `setInterval` worker 每分钟扫描 scheduled_jobs 找 `next_run_at < now`
   预计 1 天

4. **画布编辑器** (react-flow) 替换 JSON 编辑
   预计 1-2 天

5. **Retry/Timeout 实际逻辑** + **并行 / 分支**
   预计 2 天

**Phase 3 合计 5-7 天**

## 决策建议(下次会话开头)
**先做 Phase 3 第 1 项:替换 invokeAgent mock 为真实 LLM 调用**。这是从"模拟"到"真能用"的关键一步,完成后你之前说的"内容生产流水线"真的能跑通(选题 agent 真的选题,协作 agent 真的写文章)。

## 已知问题
- `web/src/components/ui/` 不存在 Textarea / Alert 组件 → 本次用 raw `<textarea>` 替代
- Sidebar "Coordinator" / "Chain Editor" 已 redirect 到 /agents/pipelines(占位页逻辑)
- agents/jobs 创建按钮也是占位(没实现 create form)— 下次要做
- bots/conversations 点击 session 看不到实际消息(只显示 session 列表)— 下次做详情页
- runtime 中断按钮调用了但实际 interrupt 不会生效(只是记 in-memory Map)— Phase 3

## 下次会话开头步骤
```bash
1. 读 .claude/handoff-2026-07-07-panmira-MULTI-AGENT-PLATFORM.md (本文件)
2. 读 .claude/handoff-2026-07-07-panmira-phase1-3forms.md
3. 读 .claude/handoff-2026-07-07-panmira-phase2-pipeline.md
4. 读 .claude/memory/panmira-user-style.md
5. cd /home/ubuntu/panmira && git log --oneline -10
6. pm2 list  # 确认 panmira + web-next online
7. 浏览器 https://deepx.fun/web-next/login/ 验证 4 个 pipeline 页 200
```
