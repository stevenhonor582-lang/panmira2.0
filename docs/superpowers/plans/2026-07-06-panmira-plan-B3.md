# Plan B-3 报表 + OAuth client CRUD 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (本计划直接由当前会话执行)

**Goal:** 在 panmira 落 OAuth client 完整管理端点 + 5 类资源使用报表 (token/skill/mcp/channel/knowledge)

**Architecture:**
- `src/services/usage-tracker.ts` — 异步 fire-and-forget 写 usage_reports (按 date+dimension+dimensionKey 累加)
- `src/api/routes/oauth-client-routes.ts` — OAuth client CRUD (admin scope)
- `src/api/routes/reports-routes.ts` — 5 类报表查询端点
- 接入 5 个资源使用点 (token/skill/mcp/channel/knowledge)

**Tech Stack:** Drizzle ORM + PostgreSQL + Node16 ESM + TypeScript

## 全局约束(从 spec 继承)

- 5 类 dimension: `token / skill / mcp / channel / knowledge`
- 聚合方式: `sum` (默认, 总量) / `count` (次数) / `avg` (均值, count 字段)
- OAuth client 字段: clientId, clientSecretHash (SHA256), name, redirectUris (jsonb), scopes (jsonb), tenantId
- 端点前缀 `/api/v2/admin/*` (auth 豁免,走 route 级 requireBearer)
- Scope: `oauth:admin` (CRUD) / `reports:read` (查) / `reports:admin` (导出)
- secret 永远只返回明文一次 (创建时 + rotate 时)
- 测试: 每文件 ≥3 cases
- 提交: 每任务单独 commit,Conventional Commits

## 任务清单 (5 步)

### Task 1: OAuth client CRUD 端点 + RBAC

**Files:**
- Create: `src/api/routes/oauth-client-routes.ts`
- Create: `src/api/routes/__tests__/oauth-client-routes.test.ts`
- Modify: `src/api/routes/index.ts` (export)
- Modify: `src/api/http-server.ts` (注册 `/api/v2/admin/oauth-clients` + 复用 /api/v2/admin auth 豁免)

**端点:**
- `GET /api/v2/admin/oauth-clients` (oauth:admin, 列表,按 tenant 过滤)
- `POST /api/v2/admin/oauth-clients` (oauth:admin, 创建,**返回明文 client_secret**)
- `GET /api/v2/admin/oauth-clients/:id`
- `PATCH /api/v2/admin/oauth-clients/:id` (name/scopes/redirect_uris)
- `DELETE /api/v2/admin/oauth-clients/:id` (软删, status=revoked)
- `POST /api/v2/admin/oauth-clients/:id/secret/rotate` (生成新 secret, **返回明文一次**)

**实现细节:**
- secret 生成: 32 字节 random,base64url,SHA256 hash 入库
- status: `active` / `revoked`,软删走 status
- 验证 redirect_uris 是 array
- 验证 scopes 是 array,可选校验值在允许列表

**Tests (8+ cases):**
1. list 401 无 Bearer
2. create 成功,响应含明文 secret
3. create 后 GET 拿不到明文 secret (只 hash)
4. rotate 生成新 secret
5. patch 改 name
6. delete status=revoked
7. tenant 隔离 (另一 tenant 看不到)
8. list dispatch 路由 (out-of-scope URL 返回 false)

**Commit:** `feat(plan-B3): OAuth client CRUD 端点 + RBAC`

### Task 2: usage_reports 写入工具

**Files:**
- Create: `src/services/usage-tracker.ts`
- Create: `src/services/__tests__/usage-tracker.test.ts`

**接口:**
```typescript
export type Dimension = 'token' | 'skill' | 'mcp' | 'channel' | 'knowledge';

export interface RecordUsageParams {
  tenantId: string;
  dimension: Dimension;
  dimensionKey: string;  // 资源 id
  count?: number;        // 默认 1
  date?: string;         // 默认今天 YYYY-MM-DD
}

export async function recordUsage(params: RecordUsageParams): Promise<void>;
```

**实现细节:**
- 用 `INSERT ... ON CONFLICT (date, dimension, dimension_key) DO UPDATE SET count = count + EXCLUDED.count`
- 异步 fire-and-forget (不 await,不抛错)
- 错误仅 console.error
- 5 个 dimension 的 helper:
  - `recordTokenUsage(tenantId, key, count?)`
  - `recordSkillUsage(tenantId, key, count?)`
  - `recordMcpUsage(tenantId, key, count?)`
  - `recordChannelUsage(tenantId, key, count?)`
  - `recordKnowledgeUsage(tenantId, key, count?)`

**Tests (5+ cases):**
1. recordUsage 单次
2. recordUsage 同 key 累加
3. recordUsage 异步 (fire-and-forget, 不抛)
4. 5 个 helper 都正常
5. 无效 dimension 抛错

**Commit:** `feat(plan-B3): usage_reports 写入工具`

### Task 3: 报表查询端点(5 类)

**Files:**
- Create: `src/api/routes/reports-routes.ts`
- Create: `src/api/routes/__tests__/reports-routes.test.ts`
- Modify: `src/api/routes/index.ts` (export)
- Modify: `src/api/http-server.ts` (注册 `/api/v2/admin/reports`)

**端点:**
- `GET /api/v2/admin/reports/tokens?from=2026-07-01&to=2026-07-06&groupBy=day` (reports:read)
- `GET /api/v2/admin/reports/skills?from=...&to=...`
- `GET /api/v2/admin/reports/mcps`
- `GET /api/v2/admin/reports/channels`
- `GET /api/v2/admin/reports/knowledge`

**实现细节:**
- 5 个 dimension 用同一个 handler,path 决定 dimension
- query params:
  - `from` (YYYY-MM-DD, 默认 7 天前)
  - `to` (YYYY-MM-DD, 默认今天)
  - `groupBy` (`day` 默认 / `dimension_key`)
- 返回: `[{ date, dimensionKey, count }]` 或 `[{ dimensionKey, count }]`
- tenant 隔离 (强制 ctx.tenantId)

**Tests (8+ cases):**
1. 5 个 path 都能 dispatch
2. 401 无 Bearer
3. reports:read 通过
4. 错误 dimension 返回 400
5. from/to 缺省值
6. groupBy 切换
7. tenant 隔离
8. SQL 聚合正确性(用 mock)

**Commit:** `feat(plan-B3): 报表查询端点 (5 类 dimension)`

### Task 4: 现有端点接入 usage tracker

**Files:**
- Modify: `src/api/routes/oauth-routes.ts` (token 颁发时 recordTokenUsage)
- Modify: `src/services/mcp-health.ts` (健康检查时 recordMcpUsage)
- Modify: `src/api/routes/agent-run-routes.ts` (RAG 检索时 recordKnowledgeUsage)
- Modify: 任何 skill/channel 端点 (本期简化,留 TODO)

**实现:**
- token: client_credentials / auth_code 颁发 access token 时
- mcp: 每次健康检查 +1
- knowledge: 每次 RAG retrieve +1
- skill/channel: 找到对应端点 (本期留 TODO,后续 plan 接入)

**Tests:**
- 现有测试保持 pass
- 端到端调一次,验证 usage_reports 有新行

**Commit:** `feat(plan-B3): 接入 usage tracker 到现有端点`

### Task 5: 部署 + 实网验证 + handoff

**Files:**
- Create: `.claude/handoff-2026-07-06-panmira-plan-B3.md`

**部署:**
```bash
cd /home/ubuntu/panmira-B3
git add -A
git commit -m "feat(plan-B3): OAuth client CRUD + 报表 完整实施"
git checkout fix/memory-system-2026-06-27
git merge feat/plan-B3-reports-oauth --no-ff
cd /home/ubuntu/panmira
pnpm install
pnpm run build
pm2 restart panmira
sleep 5
pm2 list
```

**E2E curl:**
1. POST /api/v2/admin/oauth-clients → 201 + 明文 secret
2. GET /api/v2/admin/oauth-clients → 200
3. POST /:id/secret/rotate → 200 + 新明文 secret
4. POST /oauth/token 用新 secret → 200 access_token
5. GET /api/v2/admin/reports/tokens → 200 (有今天的 token usage)
6. GET /api/v2/admin/reports/knowledge → 200 (有今天的 knowledge usage)

**Handoff:** `.claude/handoff-2026-07-06-panmira-plan-B3.md`

**Commit:** `docs(handoff): plan-B3 OAuth client CRUD + 报表 部署完成`

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| 明文 secret 泄露 (log) | 仅在响应里返回,任何 console.log 屏蔽 |
| usage_reports 表爆炸增长 | date 索引 + 后续加 retention (90天) |
| OAuth client 被滥用 | status=revoked 立即停用,token 端点检查 |
| tenant 越权 (看别的 tenant 报表) | SQL 强制 `WHERE tenant_id = $ctx.tenantId` |
| recordUsage 同步阻塞业务 | 异步 fire-and-forget,错误吞掉 |

## 验收

- ✅ OAuth client 完整 CRUD (创建/查/改/删/rotate)
- ✅ 创建时明文 secret 只显示一次
- ✅ 5 类报表端点可查
- ✅ 报表按 tenant 隔离
- ✅ token 颁发 → reports.tokens 累加
- ✅ RAG 检索 → reports.knowledge 累加
- ✅ 实网 curl 通过
- ✅ pm2 online
