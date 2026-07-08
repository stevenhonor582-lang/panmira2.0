# 会话交接 - 2026-07-08 21:20 — R14-A Dashboard 重构

## 当前任务
把 `/overview/dashboard` 从"占位+无意义信息"重构成"全真数据 + 有价值运营视图"。后端 + 前端 + 60s polling。

## 已完成 (2 commits)

### Commit 1: `fix(api): dashboard-aggregate 去占位 - 缓存/WS/Memory 改真算 + 加 todo/alerts/completed`
- `src/api/routes/dashboard-aggregate-routes.ts` 重写 (449 → 644 行)
- 去占位: 删除 `缓存命中率 82%` / `WebSocket "在线"` / `Memory 三层 L1/L2/L3`
- health 改成 6 项全部真算:
  1. 系统服务: TCP 探测 9100/3200/5432/6379 → 4/4 在线
  2. AI 大模型: 对 5 个 provider 发 HEAD/GET `/v1/models` (3s timeout, Promise.allSettled) → 4/4 连通
  3. 知识库检索: `rag_query_log` 30 天命中率 → 100% (497/497)
  4. 任务执行: `pipeline_runs` 24h 成功率 → 100% (9/9)
  5. 资源: `df -P /` + `os.totalmem/loadavg` → 磁盘 59% (status 主看磁盘, mem/cpu 显示但不主导 — container 内 loadavg 反映宿主)
  6. 正式员工活跃: 24h 有活动的 distinct user → 2/6 今日在线 (warn, 业务指标不下 error)
- 新增 3 列 (todo/alerts/completed):
  - **todo**: 8 个 active 非模板 pipeline (run_count=0 或今日更新), kind=pending/scheduled
  - **alerts**: 4 源聚合 (失败 pipeline / 用户错误 / AI provider 不通 / 文档过期) — 当前 0 条
  - **completed**: 8 个 `status='completed'` ORDER BY `finished_at DESC`
- KPIs 全保留, 不动 R12 已 verified 真数据的部分 (calls24h/errors/avgLatency/ragHitRate)
- meta 扩展: servicesUp/aiReachable/diskPct/cpuPct/pipelineSuccessRate/employeesActive24h

### Commit 2: `feat(web): dashboard 健康度换核心功能 5+1 + 底部 3 列重做 + 60s 动态刷新`
- `apps/web-next/app/(app)/overview/dashboard/page.tsx` 重写 (213 → 240 行)
- 顶部加 "数据更新于 HH:MM:SS (每分钟自动刷新)" + 手动刷新按钮
- 60s polling via setInterval (single fetch per tick, 429-safe)
- 30s tick 强制 re-render 让 "x 分前" 相对时间刷新
- `apps/web-next/app/(app)/overview/_components/recent-activity.tsx` 完全重写 (169 → 265 行)
  - 旧 (最近流水线/审计/会话) → 新 (今日待办/需要关注/最近完成)
  - 每项 Link 跳转: todo → /tasks/[id], alerts → /tasks/[id] 或 /overview/people/[id] 或 /models 或 /knowledge, completed → /tasks/[id]
  - alerts 0 条时显示绿色 CheckCircle2 "24h 内暂无异常"
- `apps/web-next/app/(app)/overview/_components/data.ts` 扩展 (370 → 525 行)
  - 新增 3 个 interface: DashboardTodoItem / DashboardAlertItem / DashboardCompletedItem
  - DashboardAggregate 加 todo/alerts/completed + meta 14 字段
- `apps/web-next/app/(app)/overview/_components/health-meters.tsx` patch (100 → 113 行)
  - iconFor 加 Server/HardDrive/Users/Cpu 映射 (lucide-react)
  - percentFor 加 5 个新 detail shape 处理 (up/total, reachable/total, rate, diskPct, active/total)
  - 副标题 "5 项核心检查" → "系统/AI/KB/任务/资源/员工 · 实时探测"
  - 行间距 space-y-3.5 → space-y-2.5 (让 6 项更紧凑)
- `apps/web-next/e2e/specs/r12-dashboard-check.spec.ts` 重写 spec → R14-A (KPI 8 + 6 health + 3 bottom + 0 旧文案)

## 验证 (🔒)
- 后端 tsc: 仅 2 pre-existing 错误 (http-server.ts L998/L1038 RouteContext), 与本任务无关
- 后端 API curl: `HTTP 200 | 18240 bytes | 0.9s`
  - health 6 项: 5 ok + 1 warn (员工活跃 2/6)
  - todo: 4 个, alerts: 0 个, completed: 8 个
  - meta 真值: services 4/4, ai 4/4, disk 59%, mem 20%, cpu 72%, pipeline 9/9=100%, rag 497/497
- 前端 next build: `✓ Compiled successfully in 26.4s` (Turbopack)
- Playwright `r12-dashboard-check.spec.ts`: 1 passed (2.5s) — 全 16 个 assertion 过
- Playwright `q3-33pages.spec.ts`: 34 passed (1.0m) — 全网站 smoke 过
- DOM dump 验证 9 headings 在正确 y 位置: H1@95, H2@465, Top5 H3@895, 底部 H3@1222

## 待办
- [ ] R14-B 或之后: alerts 加入更多源 (低成功率的 pipeline / 大量 token 消耗的员工)
- [ ] 待办列加入"日程任务" (定时 trigger_type='schedule') — 当前 DB 里只有 manual
- [ ] R14-C: 把"24h 平均响应 17.1s" 这个异常值追根 (单次调用拖均值, 应改用 P95 或中位数)

## 关键决策 / 约束
- **不动**: billing/diagnosis/optimization/logs/people/sidebar — 其他 agent 在改
- **AI ping 用 Promise.allSettled + 3s timeout** — 单 provider 慢不会阻塞 aggregate
- **TCP probe 用 net.connect** — 不发 HTTP, 1.5s timeout
- **资源 status 主看磁盘** — container 内 os.loadavg 反映宿主不准确, CPU 仅展示
- **正式员工活跃 ≤ warn 不下 error** — 业务指标, 不是系统告警
- **legacy recentPipelines/recentAudit/recentSessions 保留** — 不删字段, 兼容其他可能调用方
- **60s polling 单 fetch** — 不并发, 不触发 429

## 用户偏好 / 风格
- 用户看到 4 个 health warn 后, 主动追问每个值的算法 → spec 里 health.detail 必须有数字证据
- 用户讨厌"占位数据" — 任何写死的值都要去掉, 全部真算
- 用户喜欢 6 项对齐 (左侧填满) — 不留空位

## 重要文件 / 路径 / 远端
- HEAD: 9b96e19 → 本任务 2 commits on top
- 后端: `src/api/routes/dashboard-aggregate-routes.ts` (644 行)
- 前端主入口: `apps/web-next/app/(app)/overview/dashboard/page.tsx` (240 行)
- 前端底部 3 列: `apps/web-next/app/(app)/overview/_components/recent-activity.tsx` (265 行)
- 前端 health: `apps/web-next/app/(app)/overview/_components/health-meters.tsx` (113 行)
- 前端 data types: `apps/web-next/app/(app)/overview/_components/data.ts` (525 行)
- 前端 spec: `apps/web-next/e2e/specs/r12-dashboard-check.spec.ts`
- 验证截图: `/tmp/dashboard-r14a-full.png` (1440x2400)
- 文档: `.claude/handoff-2026-07-08-r14a-dashboard-done.md` (本文件)
- 后端 API: `GET http://localhost:9100/api/v2/admin/dashboard-aggregate` (admin token)
- 前端 URL: `http://localhost:3200/overview/dashboard`
- DB: `postgresql://ubuntu:ubuntu@localhost:5432/metabot`

## 部署状态
- pm2 panmira 已 restart (pid 3813663)
- pm2 web-next 已 reload (pid 3813914)
- both online, 0 重启
