# Phase 1 · 3 部署形态 · Handoff (2026-07-07)

## 任务
按用户决策的分阶段方案,先实现 Bot↔Agent 关联 + 3 部署形态 (Bot/Job/API),Pipeline 引擎延后。

## 已完成(今天)

### 1. DB schema(主仓库 src/db/schema.ts)
- `agents.deployment_type` 列 (varchar 30, default 'bot')
- `bot_configs.agent_template_id` 列 (FK to agents, nullable)
- 新增 `scheduled_jobs` 表(cron/event/manual triggers)
- 新增 `agent_run_logs` 表(统一调用日志)
- 4 个索引(template_id, deployment_type, created_at)

### 2. Backend API
- `GET/POST/PATCH/DELETE /api/v2/admin/scheduled-jobs` (CRUD)
- `POST /api/v2/admin/scheduled-jobs/:id/trigger` (手动触发)
- `GET /api/v2/admin/agent-run-logs` (按 template/deploymentType 过滤)
- `GET /api/v2/admin/agent-run-logs/stats` (today/total/successRate)
- `PATCH /api/v2/admin/agents/:id` 现在接受 deploymentType + orchestration/tools/boundary/ironLaws
- 所有 routes 已注册到 http-server.ts

### 3. Frontend
- 新增 `/agents/jobs` 页面(列出定时任务 + 触发/删除)
- Sidebar 加"定时任务 / 事件"入口(在 Bot 工作室组)

### 4. 数据语义(回答用户的问题)
**1 个 Agent 模板 + 多个 Bot(微信/飞书) = 1 个"员工" + N 个"部署实例"**
- 配置层:1 个 agents 记录(共享 skill/MCP/KB)
- 部署层:N 个 bot_configs 记录,每个有独立 platform/credentials/workingDirectory
- 通过 `bot_configs.agent_template_id` 关联

**Agent 的 4 种使用形态(全部支持,Pipeline 延后)**:
| 形态 | 数据模型 | 当前状态 |
|---|---|---|
| Bot 对话 | bot_configs → agents | ✅ schema 已关联 |
| Job 定时/事件 | scheduled_jobs → agents | ✅ CRUD + trigger |
| API 调用 | agent_run_logs.deploymentType='api' | ✅ 审计 |
| Pipeline 编排 | (待 Phase 2) | ⏳ 占位页(/settings/coordinator, chain-editor) |

## Git
- main HEAD: `471e9b0c merge: phase 1 - 3 deployment forms`
- 已 push 到 origin

## 部署
- pm2 panmira PID 34 online · 端口 9100
- pm2 web-next PID 37 online · 端口 3200
- E2E 验证:`/web-next/agents/jobs/` → 200 · `/api/v2/admin/scheduled-jobs` → 200

## 浏览器验证
1. https://deepx.fun/web-next/login/
2. 侧栏 "🤖 Bot 工作室" → "定时任务 / 事件"(NEW 徽章)
3. 进入后看到空状态(暂未创建 Job),点 "+ 新建 Job"

## 下一步(Phase 2)
- Pipeline 引擎:agent_pipelines + pipeline_runs + agent_messages 表
- Chain Editor 改为 Pipeline 画布 (react-flow)
- 真正实现 scheduled_jobs 的 cron/event 触发器(目前 trigger 只更新 runCount,不实际执行)
- 删除 /settings/coordinator + /settings/chain-editor 占位页
