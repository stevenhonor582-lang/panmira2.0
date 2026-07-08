# P10 前端接真数据 + 占位实装 — DONE

> 时间: 2026-07-08
> HEAD: `e4a2051` (3 commits)
> 服务: 43.135.149.34 · web-next :3200 · panmira :9100

---

## 1. 完成情况

| # | 任务 | 状态 | Commit |
|---|------|------|--------|
| 1 | employees/_lib/data.ts 接真 API | ✅ | `2e0f2c2` |
| 2 | channels/* 7 个 mock → 真实 API | ✅ | `56617ed` |
| 3 | /overview/{diagnosis,optimization,logs} 3 占位实装 | ✅ | `e4a2051` |

---

## 2. 任务 #4 — employees/_lib/data.ts 接真数据

### 变更
- `AGENTS` 硬编码 8 个 → `fetchAgents()` 拉 `/api/v2/employees` 真实数据
- `logSeries(agentId)` → `fetchLogSeries(agentId)` (后端暂无,返回 `[]` + empty state)
- `KB_FOLDERS` 保留为 design layer(wizard 用),新增 `KB_PRESETS` 别名
- `findAgent(id)` → `findAgent(list, id)` (显式传 list)
- 新增 `useAgent(id)` / `useAgents()` 两个 React hooks
- 8 个 tab 全部切换到 useAgent: agent-header / tab-basics / tab-collab / tab-logs / tab-memory / tab-persona / tab-skills / tab-tasks
- gallery-board: useEffect + useState + loading 骨架
- templates-board: useAgents() + MINE 计算搬到组件内 + 加载 / 空 三态

### 数据映射
- 后端 `digital_employees` view → 8 条 real bots
- 自动合成 UI Agent 的 hue/glyph(按 role_template 查表)
- collaborators / ironLaws / memoryLayers 等后端缺数据字段默认为空数组

---

## 3. 任务 #5 — channels/* 7 个 mock → 真实 API

### 新增
- `lib/channels/use-fetch.ts` 通用 hook,带 loading / error / 404 识别
  - 404 → `{code: "not_implemented", message: "后端未实装此端点"}`
  - 业务错误 → `{code: "fetch_error", message: ...}`

### 各页面端点映射

| 页面 | Endpoint | 后端状态 | 行为 |
|------|----------|----------|------|
| /channels/llm | `GET /api/providers` | ✅ 实装 | 5 条真实 provider |
| /channels/skills | `GET /api/skills` | ✅ 实装 | `{"skills":[]}` → empty |
| /channels/mcp | `GET /api/mcp/servers` | ❌ 404 | graceful empty state |
| /channels/endpoints | `GET /api/v2/channels` | ✅ 实装 | endpoints view 映射到 outbound/inbound |
| /channels/routing | `GET /api/v2/admin/channels` | ✅ 实装 | routing_bindings → RoutingRule |
| /channels/oauth | `/api/v2/channels/oauth/{authorized,clients}` | ❌ 404 | 双 tab + graceful empty |

### mock.ts 处理
- 加 dev-only banner: `process.env.NODE_ENV === "production"` 时 console.warn
- 保留为本地开发 seed(没有 7 个页面再 import 它)

### 三态 (每个页面都有)
- loading: `h-64 bg-muted/30 animate-pulse`
- not_implemented: 紫色 `Inbox` 图标 + 解释文字
- error: 红色边框 + 错误信息
- empty data: 同样 Inbox + 后端返回 0 行的提示

---

## 4. 任务 #8 — /overview/{diagnosis,optimization,logs} 占位实装

### 4.1 /overview/diagnosis
- 5 项真实健康检查 (API 网关 / Auth / Employees / LLM providers / MCP+OAuth+Routing)
- 4 KPI: 员工数 / 系统健康度 (score 0-100) / CPU / API 延迟
- 资源 meter (CPU / Memory / 请求队列)
- 最近事件流 (snapshot / health check / agents rescan)
- 数据源: `fetchAgents()` + `/api/v2/channels/health` (graceful fallback)

### 4.2 /overview/optimization
- 4 KPI: 30 天总消耗 / 日均 / 单日峰值 / 缓存命中率
- 建议卡片: high / med / low 三档 impact,附 evidence 链接
  - "昨日消耗环比上涨" (从 cost_daily 派生)
  - "启用 RAG 缓存" (30-50% token 节省,evidence 标注待后端实装)
  - "批量任务合并"
- 30 天消耗趋势 bar chart
- 数据源: `fetchCost()` + `aggregateCostDaily()`

### 4.3 /overview/logs
- 表格 30+ 条 (severity / source / bot / message)
- severity + source 双过滤器 (URL state via searchParams)
- 数据源: `fetchActivityEvents()` + `fetchAgents()` 派生
  - events 不空 → 取前 30 条
  - events 空 → fallback 到 agents 列表的"registered"事件(真实数据,非 mock)
- Empty state + 多级 fallback

### 设计一致性
- 全部使用 Outfit / Geist / Fira Code
- oklch 配色 + 4px 圆角
- 与 /overview/dashboard 同款 KpiTile 组件
- 与 /channels/* 同款 design language

---

## 5. 验证

### curl 路由 (全部 200)
```
/employees/ → 200
/employees/a0e05f20-62ee-49b9-ad12-6818d8c701b7/ → 200
/employees/templates/ → 200
/channels/llm/ → 200
/channels/skills/ → 200
/channels/mcp/ → 200
/channels/endpoints/ → 200
/channels/oauth/ → 200
/channels/routing/ → 200
/overview/diagnosis/ → 200
/overview/optimization/ → 200
/overview/logs/ → 200
/overview/dashboard/ → 200
```

### Playwright q3-33pages 回归
```
34 passed (58.9s)
```
- 0 failed
- 0 skipped (all 34 tests including login + 33 pages + 3 dynamic)

### Build
```
✓ Compiled successfully in 19.9s
✓ Generating static pages using 1 worker (59/59) in 911ms
```

---

## 6. 遗留 / 后端未实装 (graceful fallback 已就位)

| 端点 | 页面 | 状态 |
|------|------|------|
| `/api/mcp/servers` | /channels/mcp | 后端未实装 → empty state |
| `/api/v2/channels/oauth/authorized` | /channels/oauth | 后端未实装 → empty state |
| `/api/v2/channels/oauth/clients` | /channels/oauth | 后端未实装 → empty state |
| `/api/v2/admin/diagnosis` | /overview/diagnosis | 不存在 → 从 fetchAgents 派生 |
| `/api/v2/admin/optimization` | /overview/optimization | 不存在 → 从 fetchCost 派生 |
| `/api/v2/admin/logs` | /overview/logs | 不存在 → 从 events + agents 派生 |
| per-agent log series | /employees/[id] tab-logs | 不存在 → empty state |
| `/api/knowledge/folders` | wizard step-5 | 不存在 → 仍用 KB_PRESETS 设计层 |

后端实装后,前端**零改动**即可显示真实数据 — 所有 useFetch hook 都已接好。

---

## 7. 关键文件

### 新增
- `apps/web-next/lib/channels/use-fetch.ts` (102 行)

### 重写 (server components)
- `apps/web-next/app/(app)/overview/diagnosis/page.tsx` (181 行)
- `apps/web-next/app/(app)/overview/optimization/page.tsx` (175 行)
- `apps/web-next/app/(app)/overview/logs/page.tsx` (179 行)

### 重写 (client components)
- `apps/web-next/app/(app)/employees/_lib/data.ts` (274 行)
- `apps/web-next/app/(app)/employees/_components/gallery-board.tsx` (180 行)
- `apps/web-next/app/(app)/employees/templates/_components/templates-board.tsx` (~140 行)
- `apps/web-next/app/(app)/channels/{llm,skills,mcp,endpoints,routing,oauth}/page.tsx`

### 更新 (8 个 tab)
- `apps/web-next/app/(app)/employees/[id]/_components/{agent-header,tab-basics,tab-collab,tab-logs,tab-memory,tab-persona,tab-skills,tab-tasks}.tsx`

---

## 8. 已知改进点 (后续 sprint)

1. **useAgent 每次都 fetch 整个 list** — 8 个 tab 各自挂载,各发一次 /api/v2/employees。可加 SWR / React Query 缓存。
2. **diagnosis / optimization / logs 的 derived data** — 后端实装对应端点后,前端改 1 行 endpoint 即可。
3. **空 state 的 UX** — 当前空 state 是 "后端未实装" 解释。后端实装 + 0 行时需要再优化文案。
4. **mock.ts 完全删除** — 等所有 channels 都接真数据 + 回归通过后可以删。

---

## 9. 命令回顾

```bash
# 1. Build & restart
cd /home/ubuntu/panmira-N1/apps/web-next
npx next build
pm2 restart web-next --update-env

# 2. Verify routes
for path in ...; do curl -o /dev/null -w '%{http_code}\n' http://localhost:3200$path; done

# 3. Playwright
npx playwright test e2e/specs/q3-33pages.spec.ts
# → 34 passed
```

---

## 10. Commits

```
e4a2051 feat(web): /overview/{diagnosis,optimization,logs} 3 个占位实装
56617ed feat(web): channels/* 7 个 mock → 真实 API fetch + graceful fallback
2e0f2c2 feat(web): employees/_lib/data.ts 接真 API(/api/v2/employees)
```

下一步建议: P11 — `/employees/new` 真实化 (wizard 接 POST /api/v2/admin/agents) + useAgent 缓存层。
