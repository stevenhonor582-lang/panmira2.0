# Plan H3a · 模型池页 · Handoff(2026-07-06)

## 当前任务
panmira-web 模型池页(LLM + Embedding 合并列表 + 测试 + 启用/禁用)部署完成

## 已完成
- [x] H3a.0 worktree + plan 文档
- [x] H3a.1 后端 models-pool API(LLM + Embedding 合并)
- [x] H3a.2 前端 ModelsView 组件
- [x] H3a.3 部署 + 验证 + handoff

## 关键变更
- `src/api/routes/models-pool-routes.ts`(新,147 行)
- `src/api/http-server.ts`:注册 models 路由
- `web/src/components/ModelsView.tsx`(新,123 行):表格 + 测试按钮 + 启用/禁用
- `web/src/components/ModelsView.module.css`(新,75 行):表样式
- `web/src/App.tsx`:`/app/models` 路由用 ModelsView
- `web/src/i18n/locales/{zh,en}.json`:models 块(21 个键)

## 测试
- 18 tests pass (15 H1+H2 + 3 ModelsView)

## 部署
- branch: fix/memory-system-2026-06-27
- HEAD: <填>
- pm2: online PID 2664364
- dist/web/index.html mtime: 2026-07-06 18:51

## e2e 验证(2026-07-06 18:53)
- POST /oauth/token → 200 access_token (scope: model:read)
- GET /api/v2/admin/models → 200 返回 5 个 LLM providers:
  - DeepSeek V4 / MiniMax(默认)/ MiniMax-luoxuan / 智谱 GLM / 硅基流动 BGE-M3
- POST /api/v2/admin/models/:id/test → 200 {ok:false, status:401, latencyMs:671}
  (401 因为 api_key_encrypted 空,接口响应正确)
- GET /web/app/models HTTP 200 (SPA fallback)

## API 端点(新增)
| 方法 | 路径 | scope |
|---|---|---|
| GET | /api/v2/admin/models | model:read OR model:admin |
| POST | /api/v2/admin/models | model:admin |
| POST | /api/v2/admin/models/:id/test | model:test OR model:read OR model:admin |
| PATCH | /api/v2/admin/models/:id | model:admin |

## 测试 client(临时)
- client_id: `h3a-models-test`
- secret: `test-secret-h3a`
- scope: model:read, model:admin, model:test

## 关键文件
- Plan: `docs/superpowers/plans/2026-07-06-panmira-plan-H3a.md`
- 后端: `src/api/routes/models-pool-routes.ts`
- 前端: `web/src/components/ModelsView.tsx`

## 实施过程遇到的问题
1. dist 没自动重 build — 需要 `rm dist/api/http-server.js*` 然后 `tsc`
2. 前端 ModelsView 的 disable 按钮对 LLM disabled(LLM 没 status 字段,只有 embedding)

## 下一步(Plan H3b 候选)
- H3b 数智底座(KB 树 + 上传 + 检索测试)
- H3c Agent 列表(列表 + 详情)
