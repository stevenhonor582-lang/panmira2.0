# Plan B-3 报表 + OAuth client CRUD · Handoff (2026-07-06)

## 当前任务
panmira 数智资源管理 SaaS · Plan B-3(OAuth client CRUD + 5 类资源使用报表)部署完成

## 已完成 (2026-07-06)

### 新服务 (1)
- `src/services/usage-tracker.ts` (79 行)
  - `recordUsage({tenantId, dimension, dimensionKey, count, date})` 异步 fire-and-forget
  - ON CONFLICT 累加 (同一 date+dimension+dimension_key)
  - 5 个 helper: `recordTokenUsage / recordSkillUsage / recordMcpUsage / recordChannelUsage / recordKnowledgeUsage`
  - 错误吞掉 (console.error)

### 新端点 (12 个)
**OAuth client CRUD (`/api/v2/admin/oauth-clients`):**
- `GET /api/v2/admin/oauth-clients` (oauth:admin, 按 tenant 过滤, 不返回 hash)
- `POST /api/v2/admin/oauth-clients` (oauth:admin, **返回明文 client_secret 仅一次**)
- `GET /api/v2/admin/oauth-clients/:id`
- `PATCH /api/v2/admin/oauth-clients/:id` (name/scopes/redirect_uris)
- `DELETE /api/v2/admin/oauth-clients/:id` (软删 status=revoked)
- `POST /api/v2/admin/oauth-clients/:id/secret/rotate` (**返回新明文 secret 仅一次**)

**报表查询 (`/api/v2/admin/reports/{dimension}`):**
- `GET /api/v2/admin/reports/token` (reports:read|admin)
- `GET /api/v2/admin/reports/skill`
- `GET /api/v2/admin/reports/mcp`
- `GET /api/v2/admin/reports/channel`
- `GET /api/v2/admin/reports/knowledge`
- query: `from` (默认 7 天前) / `to` (默认今天) / `groupBy` (`day` | `dimension_key`)

### 接入点 (3 处)
- `oauth-routes.ts` — `client_credentials` 颁发 access token 时 `recordTokenUsage`
- `services/mcp-health.ts` — 健康检查 `recordMcpUsage`
- `api/routes/agent-run-routes.ts` — RAG 检索 `recordKnowledgeUsage` (每个 KB 各记一次)

### 测试 (149 tests,全 pass)
- usage-tracker: 8 tests
- oauth-client-routes: 10 tests
- reports-routes: 10 tests
- (含 B-1/B-2 既有 121 tests)

### 部署
- merge: `feat/plan-B3-reports-oauth` → `fix/memory-system-2026-06-27`
- 手 SQL: `usage_reports` 加 unique index `(tenant_id, date, dimension, dimension_key)` (支持 ON CONFLICT 累加)
- `pnpm tsc` + `pm2 restart panmira`
- PID 34, online 250MB

## 实网验证 (2026-07-06 17:15)

```
1. POST /api/v2/admin/oauth-clients {name, type:web, scopes, redirectUris}
   → 201 {id, clientId, clientSecret (plaintext, 仅此一次)}
2. GET /api/v2/admin/oauth-clients → 200 [{... (无 clientSecret 字段)}]
3. POST /:id/secret/rotate → 200 {id, clientId, clientSecret (新 plaintext)}
4. POST /oauth/token 用新 client → 200 access_token
5. POST /oauth/token × 5 → 触发 5 次 recordTokenUsage
   → usage_reports: (date=2026-07-06, dim=token, key=test-b2-client, count=6)
6. GET /api/v2/admin/reports/token?from=...&to=...&groupBy=day
   → 200 {rows: [{date, count: 6}]}
7. GET /api/v2/admin/reports/token?groupBy=dimension_key
   → 200 {rows: [{dimensionKey: 'test-b2-client', count: 6}]}
8. POST /api/v2/agents/:id/run (RAG 检索 grounding LLMs)
   → 200 {rag: {retrievedChunks: 1, usedKbIds: [...]}}
   → recordKnowledgeUsage 触发
9. GET /api/v2/admin/reports/knowledge?groupBy=dimension_key
   → 200 {rows: [{dimensionKey: 'kb-xxx', count: 1}]}
```

## 修复 (3 个)
1. **B-2 schema `version` 改名 `kbVersion`** — 上次 e2719971 commit message 说改但只改了 test,没改 schema.ts。本期 (commit 4c0be967) 实际改 schema
2. **recordKnowledgeUsage import 漏了** — commit 2b4f53b3 加了函数调用但没加 import,本计划 commit 1136d73f 补上
3. **URL query string 没 strip** — handler 用了 `url.match()` 没 strip `?from=...`, 改成 `url.split('?')[0].match()`

## Adapt 决策
- `usage_reports` 表已有 (plan A 加的),结构跟本期匹配,只需补 unique index (auto-migrate 不支持,手 ALTER)
- `usage_reports.updated_at` 字段 schema 有但 DB 没有 (plan A 没加) → 改用 `cost_usd` + `metadata` 替代
- SHA256 hash 跟现有 oauth-routes 一致
- `oauth:admin` 跟 `reports:read` 单 scope 即满足 (requireAnyScope)

## 待办 (后续 plan)

### Plan C (续 SaaS)
- reports 物化视图 (大表加速)
- usage retention (90 天清理)
- 报表导出 CSV
- OAuth client 批量导入
- Tenant 级 usage quota (限流)
- channel/skill 维度的端点接入 (本期留 TODO)

### 跨 plan 增强
- 大 KB 文档异步嵌入队列 (B-2 留 TODO)
- agent /run 真实 LLM 接入 (claude-agent-sdk)
- KB 文档版本保留策略 (B-2 留 history 但无清理)

## 关键文件路径

- Spec: `projects/panmira/specs/2026-07-06-resource-engine-design.md` §6
- 实施 plan: `docs/superpowers/plans/2026-07-06-panmira-plan-B3.md`
- OAuth CRUD: `src/api/routes/oauth-client-routes.ts` (204 行)
- 报表端点: `src/api/routes/reports-routes.ts` (108 行)
- usage tracker: `src/services/usage-tracker.ts` (79 行)
- 唯一索引迁移: `src/db/migrations/2026-07-06-usage-reports-unique.sql`
- 测试: `src/services/__tests__/usage-tracker.test.ts` + `src/api/routes/__tests__/oauth-client-routes.test.ts` + `reports-routes.test.ts`

## 实网入口

- `https://deepx.fun/api/v2/admin/oauth-clients` (Bearer + oauth:admin)
- `https://deepx.fun/api/v2/admin/reports/{token|skill|mcp|channel|knowledge}` (Bearer + reports:read)
- `https://deepx.fun/oauth/token` (client_credentials)

## 风险与教训

1. **ON CONFLICT 需要 unique index** — 既存 `usage_reports` 没 unique index, ON CONFLICT 不工作 → 手 ALTER 加 idx_usage_reports_unique
2. **schema 跟 DB 漂移** — `usage_reports.updated_at` 在 schema 但 DB 没有,导致 recordUsage 报 column 不存在 → 用 cost_usd/metadata 替代
3. **commit message 跟实际不一致** — 之前 e2719971 说改 `version` 但只改了 test; commit 2b4f53b3 加调用没加 import → 部署前必须看 git diff
4. **query string 在 url.match() 里要 strip** — handler 收到的 url 带 query,必须先 split
5. **fire-and-forget 异步写** — 业务调用链不应被 usage 写入阻塞, 但要保证错误不漏 (console.error)
6. **tenant 隔离** — 报表 SQL 强制 `WHERE tenant_id = $ctx.tenantId` 防越权

## 上下文恢复指引
下次会话开头:
1. 读 `.claude/handoff-2026-07-06-panmira-plan-B3.md` (本文件)
2. 读 B-2 handoff 拿 plan A/B 上下文
3. 读 `panmira-rebuild-state.md` + `panmira-deploy-workflow.md` memory
4. 看 git log: `fix/memory-system-2026-06-27` 11 个 plan-B commits
5. 检查 pm2: `ssh mah` → `pm2 list` 看到 panmira online
6. 继续 plan C (物化视图 / quota / channel-skill 接入)

## 下一步选择
- [A] 计划 C: 报表物化视图 + tenant quota (加速大表 + 限流)
- [B] 接入 skill/channel 维度的使用记录 (当前留 TODO)
- [C] 报表导出 CSV / 仪表盘
- [D] 别的
