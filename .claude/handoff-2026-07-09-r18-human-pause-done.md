# 会话交接 - 2026-07-09 R18 Human 节点真暂停

## 当前任务
R18: 让 human kind 节点真正暂停等待真人决策,decide 端点恢复执行。✅ 完成

## 已完成
- [x] pipeline-engine.ts: PipelineNode 加 kind('bot'|'human'|...) + meta; NodeState 加 status 'waiting_for_human' + approval/note/decidedBy/decidedAt
- [x] runNodeWithRetry 开头加 human 分支 → runHumanNode(轮询 DB,2s 一次,默认超时 1h)
- [x] schema.ts nodeStates $type 同步扩展
- [x] pipeline-routes.ts: POST /api/v2/admin/pipelines/:pid/runs/:runId/nodes/:nodeId/decide 端点(RBAC + tenant 隔离 + 幂等 + WS)
- [x] 前端 HumanApprovalCard 接真 decide API(run 上下文齐全时;画布编辑模式仍本地预览)
- [x] run-history-panel: waiting_for_human 状态色 + WaitingDecision 内联审批条(批准/拒绝按钮)
- [x] execution-log-panel: STATUS_LABEL 加 waiting_for_human
- [x] 后端 tsc 编译(dist 含 decideNode + runHumanNode), pm2 restart panmira online
- [x] 前端 next build 干净, pm2 reload web-next online
- [x] 端到端验证(见下)
- [x] 3 个 git commit: bc411a5(engine) / 95e5712(api) / 96ec7c4(web)

## 验证(🔒 全过)
- decide 端点单测: 无 auth→401, 非法 decision→400, 不存在 run→404 ✅
- E2E approve 路径: h1(human) waiting_for_human → decide approved → h1 success(带 note/decidedBy) → pipeline 恢复进入 b1 ✅
- E2E reject 路径: h1 waiting → decide rejected → h1 failed(error=人工拒绝: 不通过) → b1 skipped ✅
- 重新 decide 已完成节点 → 400 node_not_awaiting_decision(正确,节点已 success) ✅
- vitest: 164 tests pass(含 pipeline-engine + pipeline-routes 全套) ✅
- Playwright q3-33pages: 34 pass(含 /tasks/[id]) ✅
- tsc: 仅 2 个 pre-existing http-server.ts 错误(stash 验证 HEAD 9e8920f 也有),我的改动零新错误 ✅

## 关键决策 / 约束
- **轮询方案(非 trigger/event)**: engine 每 2s 查 pipeline_runs.node_states;decide 端点只写 DB。优点:engine 与端点解耦,进程重启可恢复,改动最小(不动 executePipeline 主循环)
- **kind 默认 'bot'**: 旧 pipeline 节点无 kind 字段 → 走原 bot 逻辑,100% 向后兼容
- **decidedBy 用 ctx.userId**(不是 sub): OAuthContext 没有 sub 字段,userId 即用户 id
- **tenant 隔离**: decide 端点校验 run.tenantId === ctx.tenantId,跨租户返回 404
- **超时**: 默认 1h(3_600_000ms),node.timeoutMs 可配;超时返回 failed(timeout)
- **decide 路由匹配**: dispatch 里 decideMatch 在 triggerMatch 之前注册;runMatch 用 $ 锚点不会拦截 /nodes/:id/decide
- **幂等**: waiting 节点已 decision → 409;但 engine 轮询到决策后会把 status 改成 success/failed,所以实际窗口很小,重新 decide 已完成节点返回 400(正确)

## 用户偏好 / 风格
- 轮询改动最小,不动主循环
- 不问,直接干
- 3 个语义 commit

## 重要文件 / 路径
- 改动:
  - /home/ubuntu/panmira-N1/src/services/pipeline-engine.ts (PipelineNode kind + NodeState + runHumanNode)
  - /home/ubuntu/panmira-N1/src/db/schema.ts (nodeStates $type 扩展)
  - /home/ubuntu/panmira-N1/src/api/routes/pipeline-routes.ts (decideNode + dispatch)
  - /home/ubuntu/panmira-N1/apps/web-next/components/tasks/shape-config-panel.tsx (HumanApprovalCard 真 API)
  - /home/ubuntu/panmira-N1/apps/web-next/components/tasks/run-history-panel.tsx (WaitingDecision + waiting 状态)
  - /home/ubuntu/panmira-N1/apps/web-next/components/tasks/execution-log-panel.tsx (STATUS_LABEL)
- 进程: pm2 panmira(backend 9100) + web-next(frontend) 都 online
- HEAD: 96ec7c4

## 待办(下一步可选)
- [ ] 把 runId/pipelineId/nodeId 从某个 run-time 视图(非画布)透传给 HumanApprovalCard,让卡片本身也能在 run 视图用(目前 run 视图审批走 run-history-panel 的 WaitingDecision 内联条,已 work)
- [ ] human 节点 timeoutMs 在画布 config panel 可配(目前 meta 里可存,UI 未加输入框)
- [ ] decide 端点加 operator 级别 RBAC(member 角色只能决策分配给自己的节点) — 当前 admin/run scope 即可
- [ ] WS decided 事件前端实时刷新(目前靠 auto-refresh 轮询,2s 内可见)
