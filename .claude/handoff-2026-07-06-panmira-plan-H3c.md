# Plan H3c · Agent 列表页 · Handoff(2026-07-06)

## 当前任务
panmira-web Agent 列表页(列表 + 详情 modal + 新建/删除)部署完成

## 已完成
- [x] H3c.0 worktree + plan 文档
- [x] H3c.1 后端 agents CRUD API(list/create/get/patch/delete)
- [x] H3c.2 前端 AgentsView 列表 + 详情 modal
- [x] H3c.3 部署 + 验证 + handoff

## 关键变更
- src/api/routes/agents-crud-routes.ts(新,124 行):v2 admin agents CRUD
- src/api/http-server.ts:注册 agents 路由
- web/src/components/AgentsView.tsx(新,150 行)
- web/src/components/AgentsView.module.css(新,114 行)
- web/src/components/__tests__/AgentsView.test.tsx(新):2 tests
- web/src/App.tsx:/app/agents 路由用 AgentsView
- web/src/i18n/locales/{zh,en}.json:agents 块(19 键)

## 测试
- 23 tests pass (21 H1-H3b + 2 AgentsView)

## 部署
- branch: fix/memory-system-2026-06-27
- pm2: online PID 2668659

## e2e 验证(19:06)
- POST /oauth/token → 200 (scope: agent:read)
- GET /api/v2/admin/agents → 200 {agents: []}(无 tenant 绑定)
- GET /web/app/agents HTTP 200

## 测试 client(临时)
- client_id: h3c-agent-test
- secret: test-secret-h3c
- scope: agent:read, agent:admin

## API 端点(新增)
| 方法 | 路径 | scope |
|---|---|---|
| GET | /api/v2/admin/agents | agent:read OR agent:admin |
| POST | /api/v2/admin/agents | agent:admin |
| GET | /api/v2/admin/agents/:id | agent:read OR agent:admin |
| PATCH | /api/v2/admin/agents/:id | agent:admin |
| DELETE | /api/v2/admin/agents/:id | agent:admin |

## 实施过程遇到的问题
1. drizzle .values({...}) 报 No overload matches — capabilities/tools 字段类型推断失败,加 as any cast

## 下一步候选
- 修后端 baseline TS 错误
- 继续 spec § 14 其他流程页
