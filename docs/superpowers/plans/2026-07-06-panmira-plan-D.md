# Plan D MV cron + skill/channel 接入 + CSV 导出 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (本计划直接由当前会话执行)

**Goal:** 在 panmira 补齐剩余 5 维度报表 (skill/channel) + MV 定时刷新 + 报表 CSV 导出

**Architecture:**
- `src/services/mv-refresh-cron.ts` — setInterval 每 5 分钟刷 MV
- `src/api/routes/skill-hub-routes.ts` — install 时 recordSkillUsage
- `src/api/routes/routing-bindings.ts` (或 message-bus 入口) — route message 时 recordChannelUsage
- `src/api/routes/reports-export-routes.ts` — `/api/v2/admin/reports/{dimension}/export?format=csv`

**Tech Stack:** Drizzle ORM + PostgreSQL 16 + Node16 ESM + TypeScript

## 全局约束

- MV 刷新频率: 5 分钟 (可配置 env: MV_REFRESH_MS)
- 报表 CSV 字段: `date, dimension, dimension_key, count` (groupBy=day) 或 `dimension_key, count` (groupBy=dimension_key)
- skill endpoint: POST `/api/skills/:name/install` 后 recordSkillUsage(skillId)
- channel endpoint: routing-bindings route 后 recordChannelUsage(channelKey)
- CSV 端点 scope: `reports:read`
- 测试: 每文件 ≥3 cases
- 提交: 每任务单独 commit,Conventional Commits

## 任务清单 (4 步)

### Task 1: MV 定时刷新 + cron 注册

**Files:**
- Create: `src/services/mv-refresh-cron.ts`
- Create: `src/services/__tests__/mv-refresh-cron.test.ts`
- Modify: `src/index.ts` (启动时调 startMvRefreshCron)

**实现:**
```typescript
export function startMvRefreshCron(intervalMs: number = 5 * 60 * 1000): NodeJS.Timeout;
export function stopMvRefreshCron(timer: NodeJS.Timeout): void;
```

**逻辑:**
- 启动时立即 refresh 一次 (最佳实践)
- setInterval 每 5 分钟调 refresh_daily_usage()
- 错误吞掉 + console.error (不影响主服务)

**Tests (3+ cases):**
1. startMvRefreshCron 返回 timer
2. stopMvRefreshCron 停止定时器
3. 自定义 intervalMs 工作

**Commit:** `feat(plan-D): MV 定时刷新 cron + 启动时注册`

### Task 2: skill/channel 维度接入

**Files:**
- Modify: `src/api/routes/skill-hub-routes.ts` (install handler)
- Modify: `src/api/routes/routing-bindings.ts` (route handler) OR `src/api/agent-bus.ts`
- Create: `src/api/routes/__tests__/skill-usage.test.ts` (新文件, 测 wire)

**实现:**
- skill-hub install 成功后 `recordSkillUsage(tenantId, skillName, 1)`
- routing-bindings 路由消息后 `recordChannelUsage(tenantId, channelKey, 1)`
- 注意: routing-bindings 的 tenantId 来自绑定记录,无 tenant 时跳过

**Tests (2+ cases):**
1. skill install handler 调 recordSkillUsage
2. channel route handler 调 recordChannelUsage

**Commit:** `feat(plan-D): skill/channel 维度 usage 接入`

### Task 3: 报表 CSV 导出端点

**Files:**
- Create: `src/api/routes/reports-export-routes.ts`
- Create: `src/api/routes/__tests__/reports-export-routes.test.ts`
- Modify: `src/api/routes/index.ts` (export)
- Modify: `src/api/http-server.ts` (注册 `/api/v2/admin/reports/.../export`)

**端点:**
- `GET /api/v2/admin/reports/{dimension}/export?from=&to=&groupBy=day&format=csv`
- 响应: `Content-Type: text/csv` + `Content-Disposition: attachment; filename=...csv`
- 流式输出 (chunks)

**实现:**
- 复用 reports-routes 的 MV 查询 SQL
- 头行: `date,dimension,dimension_key,count` 或 `dimension_key,count`
- 数据行: 一行一记录

**Tests (4+ cases):**
1. GET export/tokens reachable
2. invalid dimension 400
3. wrong method → false
4. response has correct Content-Type

**Commit:** `feat(plan-D): 报表 CSV 导出端点`

### Task 4: 部署 + 实网验证 + handoff

**Files:**
- Create: `.claude/handoff-2026-07-06-panmira-plan-D.md`

**部署:**
```bash
cd /home/ubuntu/panmira-D
git add -A
git commit -m "feat(plan-D): MV cron + skill/channel 接入 + CSV 导出"
git checkout fix/memory-system-2026-06-27
git merge feat/plan-D-cron-skill-channel --no-ff
cd /home/ubuntu/panmira
pnpm install
pnpm run build
pm2 restart panmira
sleep 5
pm2 list
```

**E2E curl:**
1. POST /api/skills/:name/install → 触发 recordSkillUsage
2. 发 IM 消息 → 触发 recordChannelUsage
3. GET /api/v2/admin/reports/skill → 有数据
4. GET /api/v2/admin/reports/channel → 有数据
5. GET /api/v2/admin/reports/token/export?format=csv → 200 text/csv
6. 等 5 分钟(或手 trigger) → MV 刷新

**Handoff:** `.claude/handoff-2026-07-06-panmira-plan-D.md`

**Commit:** `docs(handoff): plan-D MV cron + skill/channel + CSV 部署完成`

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| cron 5 分钟延迟 | 可调小, 关键报表可手 trigger /refresh-mv |
| skill/channel 接入处没 tenant | 优雅跳过 + console.warn |
| CSV 大表流式 | 限制 maxRows (10万), 超返 413 |
| 启动 cron 失败 | 启动 try/catch, 不影响主服务 |

## 验收

- ✅ MV 每 5 分钟自动刷新
- ✅ skill install 触发 usage_reports
- ✅ channel 路由触发 usage_reports
- ✅ CSV 导出工作
- ✅ 5 维度报表全活
- ✅ 实网 curl 通过
- ✅ pm2 online
