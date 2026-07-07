# Phase 2 · Multi-Agent Pipeline Engine · Handoff (2026-07-07)

## 任务
按用户决策,实施多 Agent 编排(DAG),让 Agent 模板可以串联成 pipeline,自动传递状态。

## 已完成

### 1. DB schema (3 张新表)
- `agent_pipelines`:DAG 定义(nodes + edges + triggerType + timeoutMs + retryPolicy)
- `pipeline_runs`:单次执行(nodeStates + result + status + durationMs)
- `agent_messages`:inter-agent 审计日志
- 6 个索引(tenant, enabled, pipeline, status, started_at, run)

### 2. 引擎 (src/services/pipeline-engine.ts, 252 行)
- `validatePipeline`:DAG 校验(cycle detection + dangling edges + output 节点)
- `topologicalSort`:Kahn 算法,保证执行顺序
- `executePipeline`:顺序执行,前一个节点 output 作为后一个 input
- v0:模拟 agent invocation(50ms 延迟 + 随机 tokens),Phase 3 接真实 LLM

### 3. API (src/api/routes/pipeline-routes.ts, 184 行)
- GET/POST/PATCH/DELETE `/api/v2/admin/pipelines`
- POST `/api/v2/admin/pipelines/:id/trigger`(执行,同步返回)
- GET `/api/v2/admin/pipelines/:id/runs`
- GET `/api/v2/admin/pipelines/:id/runs/:runId`(含 agent_messages)

### 4. UI
- `/agents/pipelines` 列表页(节点数/运行/失败/平均耗时)
- Sidebar "多 Agent 编排"(NEW 徽章)
- `/settings/coordinator` + `/settings/chain-editor` → redirect 到 /agents/pipelines(占位页删除)

### 5. 端到端验证(实测)
```bash
POST /pipelines {"name":"内容生产流水线","nodes":[选题,协作],"edges":[n1→n2]}
→ 201 id=f6c6517b...

POST /pipelines/:id/trigger {"initialInput":{"topic":"工业 AI"}}
→ 200 {"status":"completed","durationMs":109}
   result: 选题→协作 正确传递 state ✓
```

## 数据流(实际跑的)
```
用户 input: {topic: "工业 AI"}
  ↓
n1 选题 agent
  → output: {result: "[选题] processed", topic: "工业 AI", ...}
  ↓ (passed as input.n1)
n2 协作 agent  
  → output: {result: "[协作] processed", receivedInput.n1: <n1 output>}
  ↓
final result: n2.output
```

## Git
- main HEAD: `ba1888c5 merge: phase 2 - multi-agent pipeline engine`
- 已 push origin

## 部署
- pm2 panmira PID 34 online
- pm2 web-next PID 37 online
- E2E 全部 200

## 浏览器验证
1. https://deepx.fun/web-next/login/
2. 侧栏 "🤖 Bot 工作室" → "多 Agent 编排"(NEW)
3. 点 "+ 新建 Pipeline" 配置 DAG(JSON 编辑器,后续加画布)
4. 点 "运行" 看实际跑(109ms 完成)

## Phase 3 待办
- Pipeline 画布(react-flow,目前是 JSON 编辑)
- 真实 agent invocation(替换模拟,接 agent runtime)
- Node 类型扩展(分支/并行/循环)
- 失败重试 + timeout
- Cron 触发真正执行(目前 triggerJob 只记账)
- Bot 消息触发 pipeline
