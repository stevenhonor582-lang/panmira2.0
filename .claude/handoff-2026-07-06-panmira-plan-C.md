# Plan C Tenant Quota + 物化视图 · Handoff (2026-07-06)

## 当前任务
panmira 数智资源管理 SaaS · Plan C(Tenant 级 resource quota + usage_reports 物化视图)部署完成

## 已完成 (2026-07-06)

### 新表 (1)
- `tenant_quotas` (8 字段)
  - id (uuid PK) + tenantId (FK cascade)
  - dimension (varchar 30) — 5 类
  - period (varchar 10) — `daily` (默认) / `monthly`
  - limitValue (bigint) — 限额
  - enabled (bool) — 默认 true
  - createdAt / updatedAt

### 新服务 (1)
- `src/services/quota-check.ts` (102 行)
  - `checkQuota(tenantId, dimension, requestedCount)` → `QuotaCheck {allowed, used, limit, remaining, resetAt}`
  - `QuotaExceeded` 异常类
  - 多 quota (daily + monthly) 取最严格
  - 无 quota → 永远 allowed

### 新端点 (5 个)
**Tenant quota (`/api/v2/admin/tenants/:tenantId/quotas`):**
- `GET` (quota:read) — 列出 tenant 所有 quota
- `POST` (quota:admin) — 创建 (同 dim+period 去重)
- `PATCH /:id` (quota:admin) — 改 limit/enabled
- `DELETE /:id` (quota:admin) — 软删 (enabled=false)

**Maintenance (`/api/v2/admin/maintenance`):**
- `POST /refresh-mv` (maintenance:admin) — 调 `refresh_daily_usage()` SQL 函数

### 物化视图 (1)
- `mv_usage_reports_daily` — 按 (tenant_id, date, dimension, dimension_key) 预聚合 SUM(count)
- 唯一索引 `idx_mv_usage_daily_pk`
- 普通索引 `idx_mv_usage_daily_tenant_date`
- 刷新函数 `refresh_daily_usage()` (CONCURRENTLY 不锁表)
- `reports-routes.ts` 改造: 优先查 MV, fallback 原表

### 接入 (1 处)
- `oauth-routes.ts` — `client_credentials` 颁发 token 前 `checkQuota('token', 1)`
- 超限返 429 + `Retry-After` 头 + JSON body 含 dimension/limit/used/period/resetAt

### 测试 (124 tests,全 pass)
- tenant-quota-routes: 8 tests
- maintenance-routes: 5 tests
- quota-check: 6 tests
- (含 B-1/B-2/B-3 既有 105 tests)

### 部署
- merge: `feat/plan-C-quota-view` → `fix/memory-system-2026-06-27`
- 手 SQL: `psql -f src/db/migrations/2026-07-06-usage-mv.sql` (建 MV + 索引 + 函数)
- `pnpm tsc` + `pm2 restart panmira`
- PID 34, online 247MB

## 实网验证 (2026-07-06 17:21)

```
1. POST /tenants/:id/quotas {dimension:token, period:daily, limitValue:20}
   → 201 {id, limitValue:20, enabled:true}
2. GET /tenants/:id/quotas → 200 [1 quota]
3. Issue 5 tokens (used 12, limit 20) → 5× HTTP 200
4. Issue 4 more → 4× HTTP 200 (total 16)
5. Issue 1 more → HTTP 429 + Retry-After: 52699
   响应: {error:quota_exceeded, dimension:token, limit:20, used:20, period:daily, resetAt:...}
6. PATCH /quotas/:id {limitValue:50} → 200 (放开限额)
7. Issue 5 tokens → 5× HTTP 200
8. POST /maintenance/refresh-mv → 200 {refreshed: 'mv_usage_reports_daily', durationMs:6}
9. GET /reports/token (走 MV) → 200 {rows: [{date, count}]}
```

## 修复
1. **OAuth token cascading 429** — quota check 在 token 颁发前,先有 quota 又先超,新 token 都拿不到。修复: SQL 删 quota → 重设更高限额 → 后续 e2e 用动态限额验证
2. **`scope` 字段类型 JSONB 多次踩** — 一律用 `'["scope1", "scope2"]'::jsonb`

## Adapt 决策
- `tenants.settings` (jsonb) 已经有但没用,新加独立 `tenant_quotas` 表更清晰
- 多 quota (daily+monthly) 并存,checkQuota 取最严格的 (remaining 最小)
- 物化视图 `CONCURRENTLY` 刷新不锁表 (需 unique index)
- 429 响应头含 `Retry-After` (秒) + body 含完整 context

## 待办 (后续 plan)

### Plan D 续 SaaS
- quota cron 调度 (每天 0 点重置 daily 计数, 实际是查询时按 date 过滤所以不需要 cron)
- quota 报表 (用 MV 加速,显示各 dim 当前用量)
- quota 邮件告警 (用量达 80% 通知 admin)
- usage retention (90 天清理原表, MV 保留近期)
- skill/channel 维度 quota 接入 (本期留 TODO)
- 报表导出 CSV
- tenant 自助查询 quota (无 admin scope)

## 关键文件路径

- Spec: `projects/panmira/specs/2026-07-06-resource-engine-design.md` §15
- 实施 plan: `docs/superpowers/plans/2026-07-06-panmira-plan-C.md`
- Tenant quota: `src/api/routes/tenant-quota-routes.ts` (134 行)
- Quota check: `src/services/quota-check.ts` (102 行)
- Maintenance: `src/api/routes/maintenance-routes.ts`
- MV SQL: `src/db/migrations/2026-07-06-usage-mv.sql`
- 测试: `src/services/__tests__/quota-check.test.ts` + `src/api/routes/__tests__/tenant-quota-routes.test.ts` + `maintenance-routes.test.ts`

## 实网入口

- `https://deepx.fun/api/v2/admin/tenants/:tenantId/quotas` (Bearer + quota:admin)
- `https://deepx.fun/api/v2/admin/maintenance/refresh-mv` (Bearer + maintenance:admin)
- `https://deepx.fun/api/v2/admin/reports/{dimension}` (走 mv_usage_reports_daily, fallback 原表)

## 风险与教训

1. **quota cascading 429** — 在 token 颁发前检查会锁住 admin 自己。生产环境需要 admin 客户端豁免 (例如 `isAdmin` flag 跳过 quota check)
2. **CONCURRENTLY 需要 unique index** — 第一次创建 MV 时不能 CONCURRENTLY,后续刷新才行
3. **schema 跟 DB 漂移** — 之前 plan A `tenants` 表已存在, schema 加列是 ADD COLUMN,新表用 auto-migrate CREATE TABLE
4. **MV 不实时** — 写入 usage_reports 后 MV 不会自动更新,需手调 refresh 或 cron
5. **429 响应头 Retry-After 单位** — HTTP 标准是秒 (整数),我们用秒

## 上下文恢复指引
下次会话开头:
1. 读 `.claude/handoff-2026-07-06-panmira-plan-C.md` (本文件)
2. 读 B-2/B-3 handoff 拿上下文
3. 读 `panmira-rebuild-state.md` + `panmira-deploy-workflow.md` memory
4. 看 git log: `fix/memory-system-2026-06-27` 累计 15 个 plan commits (A + B-1/2/3 + C)
5. 检查 pm2: `ssh mah` → `pm2 list` 看到 panmira online
6. 继续 plan D (quota cron + skill/channel 接入 + 报表导出)

## 下一步选择
- [A] plan D: quota cron + skill/channel 接入 + 报表导出 CSV
- [B] 计划 E: agent /run 真实 LLM 接入 (claude-agent-sdk)
- [C] 计划 F: 大 KB 文档异步嵌入队列
- [D] 别的
