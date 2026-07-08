# 会话交接 - 2026-07-08 R10 数据接入完成

## 当前任务
R10 数据全面接入 — 修 3 个真实数据接入问题，让 5400+ 条记录在前端可见。

## 已完成 (5 commits on main, base b579b36)

```
24dba7b  fix(web): 补回 billing/diagnosis 缺失的 R10 panel imports
eae270e  fix(r10): URL 规范化 — strip query + trailing slash 让所有路径都能匹配
[earlier]
810c27f  feat(api): R10 data routes — memory list + 6 admin endpoints
cbf1552  fix(skills): /api/skills 派生自 bot_skill_bindings + agents.skills
1c5058a  fix(memory): admin memory/aggregate 不限 tenant_id (4207 条记忆可见)
```

### 任务 1: memories tenant_id 映射 (P0)
- `src/api/routes/admin-memory-routes.ts`: 删 3 处 `WHERE tenant_id = ${ctx.tenantId}`
- 改为 admin 看全部 (scope: 'all_tenants')
- 数据只读，未改 DB

### 任务 1+: memory list 端点 + 前端
- 新文件 `src/api/routes/r10-data-routes.ts` (650 行)
- `GET /api/v2/foundation/memory/{l1,l2,l3}` — 真实 memory list
- 前端 `apps/web-next/app/(app)/foundation/memory/{l1,l2,l3}/page.tsx` 完全重写
  - 用 `api()` 拉 R10 端点
  - L1 list + detail (654 条)
  - L2 list + detail (2175 条，importance>=0.5)
  - L3 list (1378 条 iron laws)

### 任务 2: /api/skills 派生
- `src/api/routes/skill-hub-routes.ts` GET `/api/skills`
- 当 skillHubStore 不可用或不全时，从 DB 派生
- 来源 1: `bot_skill_bindings` GROUP BY skill_id (source='custom')
- 来源 2: `agents.skills` jsonb_array_elements_text (source='built-in')
- 前端 `apps/web-next/app/(app)/channels/skills/page.tsx` 不变 (后端修了即可)

### 任务 3: 6 个表接入 5 模块
新增端点 (全部在 r10-data-routes.ts):
| Endpoint | 表 | 行数 | 接入到 |
|---|---|---|---|
| `/api/v2/admin/sessions` | sessions + chat_sessions | 45+6 | feedback |
| `/api/v2/admin/sessions/:id/messages` | session_messages | 1116 | (供未来详情页用) |
| `/api/v2/admin/rag-query-stats` | rag_query_log | 495 | diagnosis |
| `/api/v2/admin/pipeline-runs` | pipeline_runs | 97 | tasks |
| `/api/v2/admin/usage-reports` | usage_reports | 8 | billing |
| `/api/v2/admin/bot-history` | bot_agent_history | 6 | logs |
| `/api/v2/admin/sync-outbox` | nextcrm_sync_outbox | 49 | logs |

前端新组件:
- `apps/web-next/components/r10/data-panels.tsx` (540 行) — 5 个 client panel
  - SessionsPanel / RagStatsPanel / UsageReportsPanel / PipelineRunsPanel / BotHistoryPanel
- `apps/web-next/components/r10/sections.tsx` — server-component 适配的 client wrapper

接入位置:
- `feedback/page.tsx` + SessionsPanel (engine + channel tab)
- `diagnosis/page.tsx` + RagStatsSection (daily bar + byBot table)
- `billing/page.tsx` + UsageReportsPanel (byDimension + detail)
- `tasks/page.tsx` + PipelineRunsSection (status summary + run list)
- `logs/page.tsx` + BotHistorySection (history + outbox tab)

## 关键决策 / 约束
1. **memories 数据只读** — 不改 tenant_id 列，只改 query 逻辑 (admin 看全部)
2. **L1 24h filter 关闭** — extraction pipeline 不活跃，最新一条已 3 天前，关掉过滤才能展示真实数据
3. **trailingSlash:true 处理** — Next.js 把所有 /api/* 加 trailing slash，浏览器加 query — R10 路由用 `new URL(url).pathname` + strip 单 `/` 规范化
4. **2 个 pre-existing TS 错误** (http-server.ts L960/L1000 RouteContext 类型) — HEAD 就有，tsc 默认 noEmitOnError=false 仍 emit dist，不影响运行
5. **server-component 页面接入 client panel** — 用 `sections.tsx` 做一层 wrapper，server 页可以直接 import

## 验证 (curl + Playwright)

### curl (admin token 长度 348)
```
memory aggregate: total=4207 (was 0)  ✅
  byLayer: L1=654, L2=2175, L3=1378
memory/l1: total=654 (返回 50)        ✅
memory/l2: total=2175 (返回 50)       ✅
memory/l3: total=1378 (返回 50)       ✅
/api/skills: 66 skills (was 0)        ✅
/api/v2/admin/sessions: 45 + 6        ✅
/api/v2/admin/pipeline-runs: 20 (limit) summary: 91 completed + 6 failed  ✅
/api/v2/admin/rag-query-stats: 495 total / 11 daily / 3 byBot  ✅
/api/v2/admin/usage-reports: 8 reports (token/knowledge/channel)  ✅
/api/v2/admin/bot-history: 6 rows     ✅
/api/v2/admin/sync-outbox: 49 items   ✅
```

### Playwright Q3 33 页 E2E
```
34 passed (59.7s)   ✅
```
（基线无回归，所有页面 (包括 5 个我改的) 全通过）

## 用户偏好 / 风格
- 没变。/tmp/admin_token.txt 已刷新 (供后续 E2E 用)。

## 重要文件 / 路径

### 后端 (panmira-N1/, port 9100)
- `src/api/routes/admin-memory-routes.ts` (修 tenant_id 过滤)
- `src/api/routes/skill-hub-routes.ts` (修 /api/skills 派生)
- `src/api/routes/r10-data-routes.ts` (新增 8 个端点)
- `src/api/http-server.ts` (注册 R10 路由 + URL 前缀分发)

### 前端 (apps/web-next/, port 3200)
- `components/r10/data-panels.tsx` (新增, 540 行, 5 个 panel)
- `components/r10/sections.tsx` (新增, server-component wrapper)
- `app/(app)/foundation/memory/{l1,l2,l3}/page.tsx` (重写, fetch 真数据)
- `app/(app)/foundation/feedback/page.tsx` (+ SessionsPanel)
- `app/(app)/overview/{diagnosis,billing,logs}/page.tsx` (+ 对应 panel)
- `app/(app)/tasks/page.tsx` (+ PipelineRunsSection)

### 远端 URL
- prod: https://deepx.fun (nginx 反代 3200)
- 后端: http://localhost:9100 (内网)
- DB: postgresql://ubuntu:ubuntu@localhost:5432/metabot

## 待办 (next 3-5)
1. [P2] **L1 24h filter 重启策略** — extraction pipeline 恢复后需要把 r10-data-routes.ts L1 过滤重新打开 (代码注释里有标记)
2. [P2] **session_messages 详情页** — `/api/v2/admin/sessions/:id/messages` 已建好但没有 UI 入口；可以做成 sessions panel 的 click-to-expand 或单独详情页
3. [P3] **memories eval 表** (memories_eval) 还有数据未接入 — 如果需要质量评估可以加
4. [P3] **audit_logs / activity_events** — 已在 diagnosis/logs 用，可以扩展更精细的过滤
5. [P3] **memories.tenant_id 迁移** — 长期方案是把 16 种 legacy tenant_id 迁移到 UUID，但需要管理员决定映射规则 (不可逆，要先备份)

## 部署状态
- ✅ 后端 dist 已 rebuild + pm2 restart panmira (pid 3697186, uptime)
- ✅ 前端 .next 已 rebuild + pm2 restart web-next (port 3200)
- ✅ 5 个 git commits on main: 1c5058a → 24dba7b
- ✅ Playwright 34/34
- ✅ curl 11 个端点全部 200 + 真实数据

## 风险 / 遗留
- **TS 错误**: 2 个 pre-existing http-server.ts 类型错误 (L960/L1000 RouteContext & IncomingMessage) — tsc 仍 emit，不影响运行；如果要修，给 routeHandlers 调用处加 type assertion
- **L1 filter 策略**: 当前为"显示所有 layer=1 ordered by recency"。如果产品语义严格要求 24h，需要等 extraction pipeline 恢复或调整数据
- **memories.tenant_id UUID 迁移**: 没做，原 spec 要求不改 DB，符合
