# Plan B-2 数智底座 KB · Handoff (2026-07-06)

## 当前任务
panmira 数智资源管理 SaaS · Plan B-2(数智底座 KB)部署完成

## 已完成 (2026-07-06)

### Schema (4 schema 任务,auto-migrate 自动建)
1. **knowledge_bases** 新表 (16 字段)
   - id (uuid PK) + tenantId/teamId/ownerUserId (三级归属)
   - type (8 类: industry/product/competitor/solution/pricing/company/department/personal)
   - visibility (private/team/company)
   - embeddingProviderId + chunkSize + chunkOverlap + indexStatus
   - documentCount + chunkCount

2. **agent_knowledge_refs** 新表 (agent 绑 KB,带 topK + minScore 配置)

3. **documents** 加 5 列: kb_id + kb_type + visibility + **kb_version** (改名避开原 text version) + owner_user_id

4. **document_chunks** 加 1 列: chunk_token_count

### 核心服务 (5 服务)
- `src/services/chunker.ts` — 按 paragraph 切,粗略 token 估算
- `src/services/embedder.ts` — OpenAI-compatible embeddings + 3 次重试 + 降级
- `src/services/hybrid-search.ts` — pgvector cosine + tsvector BM25 + **RRF 融合 (k=60)**
- `src/services/rag-service.ts` — 读 agent KB refs → retrieve → 拼装 prompt
- `src/db/migrations/2026-07-06-bm25-tsvector.sql` — tsvector GENERATED 列 + GIN 索引 (手 ALTER)

### 新端点 (10 个)
**Admin 端 (Bearer 跳过 http-server auth,走 route 级 requireBearer):**
- `GET /api/v2/admin/knowledge-bases` — 列表 (knowledge:read OR knowledge:admin)
- `POST /api/v2/admin/knowledge-bases` — 创建 (knowledge:admin)
- `GET /api/v2/admin/knowledge-bases/:id`
- `PATCH /api/v2/admin/knowledge-bases/:id`
- `DELETE /api/v2/admin/knowledge-bases/:id` (软删)
- `POST /api/v2/admin/knowledge-bases/:id/indexing` (异步 202)
- `GET /api/v2/admin/knowledge-bases/:id/documents`
- `POST /api/v2/admin/knowledge-bases/:id/documents` (bind)
- `POST /api/v2/admin/knowledge-bases/:id/documents/upload` (新 doc + chunk + embed)
- `POST /api/v2/admin/documents/:docId/versions` (新版本)
- `POST /api/v2/admin/knowledge-bases/:id/search` (混合/向量/BM25 三模式)

**业务端 (http-server auth 豁免 /api/v2/agents,* ,走 route 级 requireBearer):**
- `GET /api/v2/agents/:id/knowledge-refs`
- `POST /api/v2/agents/:id/knowledge-refs`
- `DELETE /api/v2/agents/:id/knowledge-refs/:refId`
- `POST /api/v2/agents/:id/run` (RAG 集成 + llmContext 准备)

### 测试 (121 tests,全 pass)
- schema-plan-b2: 6 tests
- knowledge-base-routes: 16 tests
- agent-knowledge-routes: 7 tests
- agent-run-routes: 4 tests
- chunker: 6 tests
- hybrid-search: 8 tests
- rag-service: 4 tests
- (含既有 plan-A/B-1/oauth/e2e 测试)

### 部署
- merge: `feat/plan-B2-knowledge-base` → `fix/memory-system-2026-06-27` (merge commit c0e08a06)
- 手 ALTER tsvector: `psql -f src/db/migrations/2026-07-06-bm25-tsvector.sql`
- `pnpm tsc` + `pm2 restart panmira`
- PID 34, online 234MB

## 实网验证 (curl, 2026-07-06 17:00)

```
1. Token: POST /oauth/token {client_credentials} → 200
   access_token=... scope=knowledge:admin agent:read agent:edit
2. Create KB: POST /api/v2/admin/knowledge-bases {type:product}
   → 201 KB ID: 2ff3a880-20d4-4cc5-b803-00c860fa618b
3. List: GET /api/v2/admin/knowledge-bases → 200 [1 KB]
4. Upload doc: POST /:id/documents/upload
   → 201 {docId, chunks:1, embedded:0}
5. Search BM25: POST /:id/search {query:"retrieval", mode:"bm25"}
   → 200 [{chunkId, content, score:0.2}]
6. Search hybrid: POST /:id/search {query:"augmented generation", mode:"hybrid"}
   → 200 [{..., bm25Rank:1, score:0.0164}]
7. New version: POST /api/v2/admin/documents/:docId/versions {content}
   → 201 {kbVersion:2, chunks:1}
8. Bind KB to agent: POST /api/v2/agents/:id/knowledge-refs {kbId, topK:3, minScore:0.1}
   → 201 {refId}
9. Run agent: POST /api/v2/agents/:id/run {query:"grounding LLMs"}
   → 200 {rag:{usedKbIds:[kb-1], retrievedChunks:1, promptLength:681},
          llmContext:{system: "You are an AI assistant with access to..."}}
```

## Adapt 决策
- `version` 改名 `kb_version` (避开 `documents.version` 既存 text 列)
- `createdBy` 用 `null` (不是空串) — `documents.created_by` 既存 NOT NULL
- `folderId` 用 `'root'` (FK `documents_folder_id_fkey` 限定) — 不是新增 'kb-root'
- `/api/v2/agents/*` 加 http-server auth 豁免 — 由 route 级 requireBearer 处理
- read 操作改用 `requireAnyScope` (不是 `requireScopes`) — 单 scope 满足
- 8 类 KB 校验: 缺 ownerUserId=personal 拒绝,type=company 不带 team/owner 拒绝

## 待办 (继续 plan B)

### Plan B-3 报表 + OAuth client CRUD (1 周估时)
- usage_reports 写入路径 (各资源使用 audit 时)
- 5 类报表端点 (token/skill/mcp/channel/knowledge)
- OAuth client CRUD 端点 (/api/v2/admin/oauth-clients)
- tenant_id 注入 OAuth client (本期用了 SQL 手插)

### 未完成的 B-2 增强
- 真实 LLM 接入 (claude-agent-sdk) — agent /run 当前是 RAG 上下文准备 stub
- tsvector 自动 populate (新建 chunk 时同步 search_tsv) — 当前靠 GENERATED 列自动
- 大文档异步嵌入队列 — 当前同步 (10MB+ 超时风险)
- 嵌入失败指标 (Prometheus) — 当前仅 console.error
- RAG prompt 截断 (超 token limit) — 当前每 chunk 完整保留

## 关键文件路径

- Spec: `projects/panmira/specs/2026-07-06-resource-engine-design.md`
- 实施 plan: `docs/superpowers/plans/2026-07-06-panmira-plan-B2.md`
- KB 端点: `src/api/routes/knowledge-base-routes.ts` (407 lines)
- Agent 端点: `src/api/routes/agent-knowledge-routes.ts` + `agent-run-routes.ts`
- 混合检索: `src/services/hybrid-search.ts` (RRF 纯函数可单测)
- RAG service: `src/services/rag-service.ts`
- 嵌入: `src/services/embedder.ts`
- 分块: `src/services/chunker.ts`
- tsvector 迁移: `src/db/migrations/2026-07-06-bm25-tsvector.sql`
- 测试: `src/__tests__/schema-plan-b2.test.ts` + `src/api/routes/__tests__/*.test.ts` + `src/services/__tests__/*.test.ts`

## 实网入口

- `https://deepx.fun/oauth/token` (client_credentials)
- `https://deepx.fun/api/v2/admin/knowledge-bases` (需要 Bearer + knowledge:read/admin scope)
- `https://deepx.fun/api/v2/agents/<id>/run` (RAG 集成, 需 agent:edit scope)

## 风险与教训

1. **Vite/Vitest ESM 解析坑** — `src/db/schema.js` (tsc 编译产物) 留下后,namespace import 拿不到 B-1/B-2 导出。修复: 测试前 `rm -f src/db/schema.js*` 或用 `.ts` 扩展 import。
2. **同名列冲突** — `documents.version` (text) vs 我加的 `version` (integer) 撞名,改名 `kb_version` 解决。
3. **FK 约束** — `documents.folder_id` FK → `folders.id`,默认 'root' 已存在,不要新造 'kb-root'。
4. **requireScopes 语义** — B-1 已用 ALL 模式,本计划 read 端点改 `requireAnyScope` 才符合预期。
5. **OAuth token 是 opaque** — http-server auth 用 `verifyAccessToken` (JWT) 不能验 OAuth opaque token,所以 `/api/v2/agents/*` 必须豁免 http-server auth,由 route 级 `requireBearer` 用 `validateAccessToken` 验。
6. **schema 加列需手 ALTER** — `auto-migrate.ts` 不支持 GENERATED column,tsvector 迁移文件手跑。

## 上下文恢复指引
下次会话开头:
1. 读 `.claude/handoff-2026-07-06-panmira-plan-B2.md` (本文件)
2. 读 `panmira-rebuild-state.md` + `panmira-deploy-workflow.md` memory
3. 读 `projects/panmira/specs/2026-07-06-resource-engine-design.md` §3.4
4. 看 git log: `fix/memory-system-2026-06-27` 10 个 plan-B2 commits
5. 检查 pm2: `ssh mah` → `pm2 list` 看到 panmira online
6. 继续 plan B-3 (OAuth client CRUD + 报表)

## 下一步选择
- [A] 继续 plan B-3 (OAuth client CRUD + 报表,1 周)
- [B] 把 agent /run 接入真实 LLM (claude-agent-sdk)
- [C] 大文档异步嵌入队列
- [D] 别的
