# Plan H2 · Dashboard 总览页 · Handoff(2026-07-06)

## 当前任务
panmira-web Dashboard 总览页(4 状态卡 + 3 速动入口 + 7 天趋势)部署完成

## 已完成
- [x] H2.0 worktree + plan 文档
- [x] H2.1 后端 GET /api/v2/admin/dashboard/stats(资源计数 + 7 天趋势)
- [x] H2.2 前端 DashboardView 加 resourcesOverview 区
- [x] H2.3 部署 + 验证 + handoff

## 关键变更
- `src/api/routes/dashboard-routes.ts`(新,90 行)
- `src/api/http-server.ts`:注册 dashboard 路由(在 reports 之前)
- `web/src/components/DashboardView.tsx`:加 NavLink/DashboardStats/fetchDashboardStats/stats state + 主 return 顶部 resourcesOverview
- `web/src/components/DashboardView.module.css`:状态卡 + 速动按钮样式
- `web/src/i18n/locales/{zh,en}.json`:dashboard.overviewTitle/llm/embedding/kb/agents/newAgent/uploadDoc/connectChannel

## 测试
- 15 tests pass (13 H1 + 2 DashboardView)

## 部署
- branch: fix/memory-system-2026-06-27
- HEAD: <填>
- pm2: online PID 2661500
- dist/web/index.html mtime: 2026-07-06 18:33

## e2e 验证(2026-07-06 18:43)
- POST /oauth/token → 200 access_token (scope: reports:read)
- GET /api/v2/admin/dashboard/stats → 200:
  ```json
  {
    "counts": {"llm":5,"embedding":0,"mcp":0,"knowledgeBases":1,"agents":7,"oauthClients":3,"skills":0},
    "trends": [{"date":"2026-07-06","token":2107,"skill":0,"mcp":0,"knowledge":13}]
  }
  ```
- GET /web/ HTTP 200 (1449b)
- GET /web/app HTTP 200 (SPA fallback)

## 测试 client(临时)
- client_id: `h2-dashboard-test`
- secret: `test-secret-h2-dashboard`
- scope: reports:read, reports:admin

## 实施过程遇到的问题
1. TS 泛型不支持:`pool.query<T>` 改用 `as any` cast
2. dashboard-routes.ts 加载语法错:reload 时 dist 还在用旧版,需要 rm dist/api/routes/dashboard-routes.js* 再 tsc
3. provider_configs/agents/skills 表没有 status 列 → 移除 WHERE status 过滤
4. mv_usage_reports_daily.date 是 varchar → 用 TO_CHAR 比较

## 下一步(Plan H3 候选)
- H3a 模型池(LLM/Embedding CRUD + 测试 + fallback)
- H3b 数智底座(KB 树 + 上传 + 检索测试)
- H3c Agent 列表(列表 + 详情)
