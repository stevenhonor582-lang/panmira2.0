# 会话交接 - 2026-07-08 R12 Dashboard 全景扩展

## 一句话目标
把 `/overview/dashboard` 从 4 KPI 简版扩成 5 大区域公司运营全景仪表盘。

## 已完成 (2 commits)
- `3930000` feat(api): `/api/v2/admin/dashboard-aggregate` — 1 fetch 返回全部 KPIs/trend/health/top5/recent
- `a9b681e` feat(web): dashboard 重写 — 8 KPI + 30d 趋势 + 健康度 + Top5 + 最近活动

## 5 大区域 (全部交付)
| 区域 | 文件 | 行数 | 验证 |
|------|------|------|------|
| ① 8 KPI | `dashboard-kpis.tsx` | 181 | 8 卡都渲染真数据 |
| ② 30d 趋势 | `trend-chart.tsx` | 179 | 4 metric tab 可切换 |
| ③ 系统健康 | `health-meters.tsx` | 100 | 5 meter (含 Memory 三层) |
| ④ Top 5 (3 列) | `top-list.tsx` | 105 | agents/users/documents |
| ⑤ 最近活动 (3 列) | `recent-activity.tsx` | 169 | pipelines/audit/sessions |
| 主页面 | `dashboard/page.tsx` | 213 | 单 fetch + 3 态 |
| 数据层 | `data.ts` | +90 | fetchDashboardAggregate |

## 验证
- 后端 curl `/api/v2/admin/dashboard-aggregate` 返回 12 kpi keys + 4 trend series (各 30 天) + 5 health + 5/5/3 top + 10/3/5 recent
- TypeScript 编译: 0 新错误 (2 个 R9 已存在的 RouteContext 类型错误未动)
- Next.js build: ✓ Compiled successfully in 20.5s (60/60 静态页)
- Playwright `q3-33pages.spec.ts`: 34/34 passed (1.0m)
- Playwright `r12-dashboard-check.spec.ts`: 9 区域可见性全过 (公司运营全景/30 天趋势/系统健康度/Top 5 [数字员工/正式员工/KB 文档]/最近 [流水线/审计/会话])

## 关键决策 / 约束
- **1 fetch 代替 6+ 并发**: 避免 429,后端 Promise.all 17 个 SQL 并行,典型 < 80ms
- **timestamp 列存毫秒**: `to_timestamp(timestamp/1000.0)` 才对 (R9 diagnosis 同 bug,不在本次范围,不动)
- **dispatch 顺序**: `/api/v2/admin/dashboard-aggregate` 必须在 R9/R10 之前注册,否则 `handleDashboardRoutes.startsWith('/api/v2/admin/dashboard')` 会吞掉它返回 not_found
- **pipeline_runs JOIN agent_pipelines**: label_snapshot 只有节点标签 ({"n1":"echo"}),真名在 agent_pipelines.name
- **30d 趋势连续**: fillDays 把没数据的日补 0,area chart 不会断
- **Top 5 NULLS LAST**: 没调用的 agent / 没命中的 doc 不上榜

## 数据现状 (2026-07-08 18:33)
- KPI: employees=6/6, agents=8/7, pipelines=13/10, documents=2526/0 today
- 24h: calls=4, errors=0%, avgLatency=17094ms (单次调用拉高了均值), RAG hit=100% (30d)
- Memory: L1=654 L2=2175 L3=1378 (合计 4207)
- Top agents 全 0 calls (24h 没事件匹配到 agent bot_id)
- Top documents 仅 3 个有 hit_count > 0

## 用户偏好 / 风格
- 不要默认 shadcn Card 堆叠 — 改用 hover 微动效 + accent 色 + asymmetric chip
- oklch 配色 (chart-1..5,饱和度 0.13-0.18)
- Outfit 标题 / Fira Code 数字 / 数字字号阶梯 (32px KPI / 14px 数据 / 12px 副标)
- 全 lucide-react,无 emoji

## 待办 / 遗留
- [ ] **缓存命中率 82% / WebSocket 在线 是占位** — 后续接 pipeline cache 真指标和 ws-server heartbeat
- [ ] **24h 调用/avgLatency 数据稀** — 当前 activity_events 24h 只有 4 条,等 LLM 实际跑起来数字才有意义
- [ ] **R9 diagnosis 同 timestamp bug** — 不在本次范围,如果用户报 diagnosis 24h 数字异常,fix `to_timestamp(timestamp)` → `/1000.0`
- [ ] Top 5 数字员工当 calls=0 时显示 5 个 0,后续考虑加 fallback "近 30d 调用" 切换

## 重要文件 / 路径
- `src/api/routes/dashboard-aggregate-routes.ts` (431 行)
- `src/api/http-server.ts` (line 42 import, line 232 dispatch list, line 514 dispatch block)
- `apps/web-next/app/(app)/overview/dashboard/page.tsx` (213 行)
- `apps/web-next/app/(app)/overview/_components/{dashboard-kpis,trend-chart,health-meters,top-list,recent-activity}.tsx`
- `apps/web-next/app/(app)/overview/_components/data.ts` (+90 行 fetchDashboardAggregate)
- `apps/web-next/e2e/specs/r12-dashboard-check.spec.ts` (新 e2e)

## 远端
- 后端: http://localhost:9100/api/v2/admin/dashboard-aggregate (需 admin bearer)
- 前端: http://localhost:3200/overview/dashboard/ (PM2 进程 panmira / web-next)
- DB: `postgresql://ubuntu:ubuntu@localhost:5432/metabot`
