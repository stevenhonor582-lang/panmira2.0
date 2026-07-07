# Pipeline Real LLM · Handoff (2026-07-07)

## 任务
替换 `src/services/pipeline-engine.ts` 的 mock `invokeAgent()` → 真实 LLM 调用。完成 Phase 3 #1,从"模拟"到"真能用"。

## 已完成
- ✅ 分支 `feat/pipeline-real-llm` (从 main HEAD `411cb889` 创建,当前 HEAD `7edf6567`)
- ✅ 10 个单元测试全过(mock / agent-not-found / 基础 / RAG / tool_use / 上下游 / stringify)
- ✅ tsc 0 错误(用 `tsc -p tsconfig.json --noEmit` 验证)
- ✅ `npm run build` 成功
- ✅ `pm2 reload panmira` 成功 (PID 34 → 2964103, reload #59, uptime 3s)
- ✅ E2E 真实 LLM 跑通(deepx.fun / 2 节点 pipeline / MiniMax-M3)

## E2E 验证数据
**Pipeline**: n1 (full-stack-engineer) → n2 (守静)
**Topic**: 什么是多 Agent 平台
- n1: durationMs=26875, **tokensUsed=1835**, model=MiniMax-M3, status=success
- n2: durationMs=10523, **tokensUsed=1827**, model=MiniMax-M3, status=success
- run.total: durationMs=37421, status=completed
- n2.input.n1 包含 n1 的完整 output 文本 — 上下游传递真实工作

## 关键决策
- 集成层级:**Option C 完整单 Agent**(同 `agent-run-routes.ts:23-166` 模式)
- **不改 DB schema** — total 从 `node_states` JSON 各节点 `tokensUsed` 求和(前端 API 层加 sum 即可,YAGNI)
- 工具调用**单跳**(同 agent-run-routes)— 多跳 / 并行 / 分支 / 真实 retry 全部留作下次
- `useMockLlm` **不暴露 API 层** — 走 executePipeline 第 5 参数(测试直调);生产触发全走真实 LLM
- 输入截断 8000 字符,带 `[truncated]` 标记
- `tenantId: 'system'` 占位(pipeline 没 tenant 上下文,recordTokenUsage fire-and-forget,失败不阻断)
- RAG 失败不阻断(log warning 继续)

## 主仓库路径
- 分支:`feat/pipeline-real-llm`
- 改了 2 个文件:
  - `src/services/pipeline-engine.ts` (+386 行,-19 行,加 InvokeContext / invokeRealAgent / stringifyInput 等)
  - `src/services/__tests__/pipeline-engine.test.ts` (新增 237 行,10 测试)
- 加了 3 个文档(本次会议产出):
  - `docs/superpowers/specs/2026-07-07-pipeline-real-llm-design.md` (设计)
  - `docs/superpowers/plans/2026-07-07-pipeline-real-llm.md` (实现计划)
  - `.claude/handoff-2026-07-07-pipeline-real-llm.md` (本文件)

## 部署
- 已部署到 mah / 43.135.149.34 (deepx.fun) — pm2 PID 34 running
- 命令:
  ```bash
  cd /home/ubuntu/panmira
  npm run build
  pm2 reload panmira
  ```
- 前端不用动

## 验证命令(E2E)
```bash
# login
TOKEN=$(curl -sS -X POST http://localhost:9100/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@panmira.com","password":"admin123"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['accessToken'])")

# 用现成 admin token, pipeline_id 在 SQL 里建
psql -h localhost -U ubuntu -d metabot -c "INSERT INTO agent_pipelines (id, name, nodes, edges, enabled) VALUES (...);"

# trigger
curl -sS -X POST "http://localhost:9100/api/v2/admin/pipelines/$PID/trigger" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"triggeredBy":"user","initialInput":{"topic":"..."}}'
```

## 下次开会步骤
```bash
# 1. 读本 handoff
# 2. cd /home/ubuntu/panmira && git log --oneline -8
# 3. 合并到 main
git checkout main && git merge feat/pipeline-real-llm --no-ff
git branch -d feat/pipeline-real-llm
git push origin main
# 4. 浏览器验证 https://deepx.fun/web-next/agents/pipelines/ 跑 1 个 pipeline
```

## 不在范围(下次,Phase 3 剩余)
- Bot 消息触发 Pipeline (微信/飞书消息 → 自动 trigger)
- Cron 真跑 (worker 扫 `scheduled_jobs.next_run_at < now`)
- react-flow DAG 画布编辑(替换 JSON form)
- 多跳 tool_use 循环
- 并行 / 分支执行
- 真实 retry + timeout 逻辑
- 异步执行 + 进度推送
- KB RAG 缓存复用

## 已知小问题
- `recordTokenUsage('system', ...)` 可能因 'system' 不是合法 tenant UUID 而异步失败(已在 try/catch,不阻断 pipeline)
- RAG 注入用 `agentKnowledgeRefs` 表查询;若 agent 关联 KB 失效(无向量),可能返空 RAG prompt(不阻断)
- 输入截断 8000 字符对极大 LLM context 也够用,但**极端大对象** (10MB+) 会有问题(生产暂无这种场景)

## 相关记忆
- `panmira-user-style`: 不要重复选项、一次做完、干净版本、端到端贯通、不要问选A/B/C
- `panmira-scope-lock`: 锁定目标不动其他;本次只动 pipeline-engine.ts + tests + docs

## 经验教训(本次 session 验证)
- ✅ **单源真相** — 没碰 panmira-N1 worktree
- ✅ **build 前 tsc** — 0 错误才 build,没"build 不验证就跑 pm2"
- ✅ **不动 main** — 新分支 feat/pipeline-real-llm,工作完成前不合并
- ✅ **mock toggle 走测试** — 不污染 API 层
- ✅ **复用现有基础设施** — llm-client / rag-service / tool-executor / agent-run-routes 全部沿用,0 新增 deps
