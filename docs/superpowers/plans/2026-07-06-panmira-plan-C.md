# Plan C 报表物化视图 + Tenant Quota 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (本计划直接由当前会话执行)

**Goal:** 在 panmira 落 tenant 级 resource quota (限流)+ usage_reports 物化视图 (大表加速)

**Architecture:**
- `tenant_quotas` 新表 (tenant_id+dimension+period+limit_value)
- `quota-check` 服务: 检查当前用量 vs 限额,超限抛 QuotaExceeded
- 接入 3 个使用点 (token/mcp/knowledge), 超限返回 429
- `mv_usage_reports_daily` 物化视图 (按 tenant+date+dimension 预聚合)
- `refresh_daily_usage()` 函数 (手调或 cron)

**Tech Stack:** Drizzle ORM + PostgreSQL 16 (materialized view) + Node16 ESM + TypeScript

## 全局约束

- quota period: `daily` (默认) / `monthly`
- 5 dimension 都支持 quota (token / skill / mcp / channel / knowledge)
- 超限 HTTP 429 + Retry-After header
- MV 刷新: 手 POST /admin/maintenance/refresh-mv (后续加 cron)
- 端点前缀 `/api/v2/admin/*` (auth 豁免,走 route 级 requireBearer)
- Scope: `quota:admin` (CRUD) / `quota:read` (查)
- 测试: 每文件 ≥3 cases
- 提交: 每任务单独 commit,Conventional Commits

## 任务清单 (4 步)

### Task 1: tenant_quotas schema + 端点

**Files:**
- Modify: `src/db/schema.ts` (末尾加 tenant_quotas)
- Create: `src/api/routes/tenant-quota-routes.ts`
- Create: `src/api/routes/__tests__/tenant-quota-routes.test.ts`
- Modify: `src/api/routes/index.ts` (export)
- Modify: `src/api/http-server.ts` (注册)

**Schema:**
```typescript
export const tenantQuotas = pgTable('tenant_quotas', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  dimension: varchar('dimension', { length: 30 }).notNull(),
  period: varchar('period', { length: 10 }).notNull().default('daily'),
  limitValue: bigint('limit_value', { mode: 'number' }).notNull(),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp(...).defaultNow().notNull(),
  updatedAt: timestamp(...).defaultNow().notNull(),
});
```

**端点:**
- `GET /api/v2/admin/tenants/:tenantId/quotas` (quota:read)
- `POST /api/v2/admin/tenants/:tenantId/quotas` (quota:admin, 创建)
- `PATCH /api/v2/admin/tenants/:tenantId/quotas/:quotaId` (quota:admin)
- `DELETE /api/v2/admin/tenants/:tenantId/quotas/:quotaId` (quota:admin, 软删 enabled=false)

**Tests (5+ cases):**
1. dispatch out-of-scope false
2. GET handler reachable
3. POST handler reachable
4. PATCH handler reachable
5. DELETE handler reachable

**Commit:** `feat(plan-C): tenant_quotas schema + CRUD 端点`

### Task 2: quota check 服务 + 中间件

**Files:**
- Create: `src/services/quota-check.ts`
- Create: `src/services/__tests__/quota-check.test.ts`
- Modify: 接入 token/mcp/knowledge 端点 (返回 429)

**接口:**
```typescript
export class QuotaExceeded extends Error {
  constructor(public dimension: string, public limit: number, public used: number, public period: string) {
    super(`quota exceeded: ${dimension} ${used}/${limit} per ${period}`);
  }
}

export interface QuotaCheck {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
  resetAt: string;
}

export async function checkQuota(tenantId: string, dimension: Dimension, requestedCount: number): Promise<QuotaCheck>;
```

**实现:**
- 查 tenant_quotas (enabled=true) for tenant+dimension
- 查当前 period 用量 (sum from usage_reports)
- 算 remaining = limit - used
- requestedCount > remaining → throw QuotaExceeded (or return {allowed: false})
- 默认无 quota → always allowed

**接入:**
- oauth-routes.ts: token 颁发前 checkQuota('token')
- mcp-health.ts: 健康检查前 checkQuota('mcp')
- agent-run-routes.ts: RAG 检索前 checkQuota('knowledge')
- 捕获 QuotaExceeded → 429 + Retry-After

**Tests (6+ cases):**
1. 无 quota → allowed
2. 有 quota,未超 → allowed + remaining 正确
3. 有 quota,超 → 抛 QuotaExceeded
4. quota enabled=false → allowed (跳过)
5. 5 dimension 都能查
6. daily period 用今天数据, monthly 用本月

**Commit:** `feat(plan-C): quota check 服务 + 429 中间件`

### Task 3: usage_reports 物化视图

**Files:**
- Create: `src/db/migrations/2026-07-06-usage-mv.sql`
- Modify: `src/api/routes/reports-routes.ts` (查 MV first, fallback 原表)
- Create: `src/api/routes/maintenance-routes.ts` (refresh MV endpoint)
- Create: `src/api/routes/__tests__/maintenance-routes.test.ts`
- Modify: `src/api/http-server.ts` (注册 `/api/v2/admin/maintenance`)

**SQL (手跑):**
```sql
-- 物化视图
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_usage_reports_daily AS
SELECT
  tenant_id,
  date,
  dimension,
  dimension_key,
  SUM(count)::bigint AS count
FROM usage_reports
GROUP BY tenant_id, date, dimension, dimension_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_usage_daily_pk
  ON mv_usage_reports_daily(tenant_id, date, dimension, dimension_key);

-- 刷新函数
CREATE OR REPLACE FUNCTION refresh_daily_usage() RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_usage_reports_daily;
END;
$$ LANGUAGE plpgsql;
```

**端点:**
- `POST /api/v2/admin/maintenance/refresh-mv` (maintenance:admin, 调 refresh_daily_usage())

**reports 改造:**
- groupBy=day → 查 MV
- groupBy=dimension_key → 查 MV
- MV 不存在 → fallback 原表

**Tests (4+ cases):**
1. POST /maintenance/refresh-mv reachable
2. out-of-scope false
3. 路由不冲突

**Commit:** `feat(plan-C): usage_reports 物化视图 + refresh 端点`

### Task 4: 部署 + 实网验证 + handoff

**Files:**
- Create: `.claude/handoff-2026-07-06-panmira-plan-C.md`

**部署:**
```bash
cd /home/ubuntu/panmira-C
git add -A
git commit -m "feat(plan-C): tenant quota + 物化视图"
git checkout fix/memory-system-2026-06-27
git merge feat/plan-C-quota-view --no-ff
cd /home/ubuntu/panmira
psql $DATABASE_URL -f src/db/migrations/2026-07-06-usage-mv.sql
pnpm install
pnpm run build
pm2 restart panmira
sleep 5
pm2 list
```

**E2E curl:**
1. POST /tenants/:id/quotas {dimension:token, limit:100}
2. 触发 token 颁发到 100 → 101 应返 429
3. POST /maintenance/refresh-mv → 200
4. GET /reports/token (走 MV) → 数据正确

**Handoff:** `.claude/handoff-2026-07-06-panmira-plan-C.md`

**Commit:** `docs(handoff): plan-C tenant quota + 物化视图 部署完成`

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| quota 超限误伤 | 默认 enabled=true, 显式关闭, reject 明确 retryAfter |
| MV 跟原表数据漂移 | REFRESH CONCURRENTLY (不锁表), 写后立即 refresh OR 接受 N 分钟延迟 |
| 大表 MV 重建慢 | 用 CONCURRENTLY, 加 unique index, 后台调度 |
| quota 跟 usage 竞争 | 写 usage 之前先 check, 失败抛错不写 |
| 429 客户端无感 | 响应含 Retry-After (秒) + X-Quota-* 头 |

## 验收

- ✅ tenant quota CRUD 端点
- ✅ quota check 接入 3 个使用点
- ✅ 超限返 429 + Retry-After
- ✅ usage_reports 物化视图创建
- ✅ refresh 端点工作
- ✅ reports 查 MV 正确
- ✅ 实网 curl 通过
- ✅ pm2 online
