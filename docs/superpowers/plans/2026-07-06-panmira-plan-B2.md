# Plan B-2 数智底座 KB 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans

**Goal:** 在 panmira 数智资源管理 SaaS 落 knowledge_bases 概念层 + 混合检索 + RAG 接入 agent + 8 类 KB 权限模型

**Architecture:**
- `knowledge_bases` 新表(8 类型,tenant/team/owner 三级)
- `documents` + `document_chunks` 加列
- `hybrid-search` 服务(pgvector cosine + tsvector BM25 + RRF 合并)
- `rag-service`(agent kb_refs → retrieve → prompt 拼装)
- 9 个新端点

**Tech Stack:** Drizzle ORM + PostgreSQL 16 + pgvector + Node16 ESM + TypeScript

## 全局约束

- 8 类 KB: industry / product / competitor / solution / pricing / company / department / personal
- 归属: Company(空 team/owner), Team(teamId 非空), Personal(ownerUserId 非空)
- documents.visibility 默认 team,跟随 KB visibility
- documents.version 默认 1,update 自增(留 history)
- 端点前缀 /api/v2/admin/* (auth 豁免) + /api/v2/agents/:id/* (业务端,Bearer)
- Scope: knowledge:read/admin, agent:read/edit/admin
- 混合检索: top-20 向量 + top-20 BM25,RRF 合并,最终 top-K(5~10)
- RAG: agent kb_refs → retrieve → prompt 拼装 → LLM
- 测试: 每文件 ≥3 cases
- 提交: 每任务单独 commit,Conventional Commits

## 任务清单(8 步)

### Task 1: schema 扩展 + 测试

**Files:** Modify src/db/schema.ts, Create src/__tests__/schema-plan-b2.test.ts

**新增表 knowledge_bases:**
- id (uuid PK), tenantId, teamId, ownerUserId
- type (varchar 30, 8 类), name (varchar 200)
- description (text), visibility (varchar 20, default team)
- embeddingProviderId (FK → embedding_providers.id)
- chunkSize (int, default 512), chunkOverlap (int, default 64)
- indexStatus (varchar 20, default pending)
- documentCount (int, default 0), chunkCount (int, default 0)
- createdBy (uuid), createdAt, updatedAt

**新增表 agent_knowledge_refs:**
- id (uuid PK), agentId (FK), kbId (FK)
- topK (int, default 5), minScore (numeric, default 0.5)
- createdAt

**documents 加列:** kbId, kbType, visibility, version, ownerUserId
**document_chunks 加列:** chunkTokenCount

**Tests (4+ cases):**
1. knowledgeBases 16 字段
2. agentKnowledgeRefs FK 正确
3. documents 5 新列存在
4. documentChunks 1 新列存在

**Commit:** feat(plan-B2): knowledge_bases + documents/document_chunks 加列 + 测试

### Task 2: KB CRUD 端点 + RBAC

**Files:** Create src/api/routes/knowledge-base-routes.ts, Create __tests__, Modify routes/index.ts, Modify http-server.ts

**端点:**
- GET /api/v2/admin/knowledge-bases (knowledge:read/admin)
- POST /api/v2/admin/knowledge-bases (knowledge:admin)
- GET /:id (visibility 检查)
- PATCH /:id
- DELETE /:id (软删)
- POST /:id/indexing (异步 202)

**Tests (5+ cases):**
1. 401 无 Bearer
2. create: knowledge:read 403
3. get: team visibility 跨 user 403
4. patch: 非法 type → 400
5. delete: soft 标记

**Commit:** feat(plan-B2): knowledge_bases CRUD 端点 + RBAC

### Task 3: Document 端到 KB + 版本化

**Files:** Modify knowledge-base-routes.ts, Modify __tests__

**端点:**
- GET /api/v2/admin/knowledge-bases/:id/documents
- POST /api/v2/admin/knowledge-bases/:id/documents (bind 已有)
- POST /api/v2/admin/knowledge-bases/:id/documents/upload (新 doc)
- POST /api/v2/admin/documents/:docId/versions

**实现:**
- documents.version 自增 1→2,旧版保留
- text.split(/\n\n+/) 按 chunkSize 切,overlap 64
- 调 embedding_providers 向量化(1024 维)
- 失败重试 3 次,降级保留 chunk embedding=null

**Tests (4+ cases):**
1. bind: docId → kbId 字段更新
2. version: 二次上传 version=2
3. chunk: 2000 字符 → 4 chunks
4. list 倒序

**Commit:** feat(plan-B2): documents 端到 KB + 版本化

### Task 4: 混合检索服务 (pgvector + BM25 + RRF)

**Files:** Create src/services/hybrid-search.ts, Create __tests__

**接口:**
```typescript
export interface SearchOptions {
  query: string;
  kbIds: string[];
  topK: number;
  mode: 'vector' | 'bm25' | 'hybrid';
  visibilityFilter?: { userId: string; teamId?: string; tenantId: string };
}
export interface SearchResult {
  chunkId: string;
  documentId: string;
  content: string;
  score: number;
  vectorRank?: number;
  bm25Rank?: number;
}
export async function hybridSearch(opts: SearchOptions): Promise<SearchResult[]>;
```

**步骤:**
1. getEmbeddingProvider → 调 embedding API (1024 维)
2. pgvector cosine top-20: `1 - (embedding <=> $1::vector) AS score`
3. BM25 top-20: `ts_rank_cd(search_tsv, plainto_tsquery('simple', $1))`
4. RRF: `rrfScore = 1/(k+rank_v) + 1/(k+rank_b)`,k=60
5. visibility: tenant 必匹配, ownerUserId 或 teamId 匹配

**Tests (6+ cases):**
1. mode=vector
2. mode=bm25
3. mode=hybrid
4. visibility personal
5. RRF 数学 k=60
6. topK 限制

**Commit:** feat(plan-B2): 混合检索服务 (pgvector + BM25 + RRF)

### Task 5: 搜索端点 + tsvector 迁移

**Files:** Modify knowledge-base-routes.ts, Modify __tests__, Create src/db/migrations/2026-07-06-bm25-tsvector.sql

**端点:** POST /api/v2/admin/knowledge-bases/:id/search (knowledge:read)

**SQL 迁移 (手 ALTER,auto-migrate 不支持 generated):**
```sql
ALTER TABLE document_chunks
  ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', coalesce(content,''))) STORED;
CREATE INDEX IF NOT EXISTS idx_chunks_tsv ON document_chunks USING GIN(search_tsv);
```

**Tests (3+ cases):**
1. search hybrid 命中
2. mode=vector
3. 401

**Commit:** feat(plan-B2): POST /:id/search 端点 + tsvector 迁移文件

### Task 6: RAG service + agent knowledge-refs

**Files:** Create src/services/rag-service.ts, Create __tests__, Modify agent-routes.ts

**接口:**
```typescript
export interface RagOptions {
  agentId: string; userQuery: string; userId: string;
  tenantId: string; teamId?: string; topK?: number;
}
export interface RagResult {
  retrievedChunks: SearchResult[];
  prompt: string;
  usedKbIds: string[];
}
export async function buildRagContext(opts: RagOptions): Promise<RagResult>;
```

**Prompt 模板:**
```
You are an AI assistant with access to the following knowledge base context.

## Context
[1] (kb=<name>, doc=<title>, version=<v>, score=<s>)
<chunk content>

[2] ...

## User Question
<userQuery>

Please answer based on the context above.
```

**Agent 端点:**
- GET /api/v2/agents/:id/knowledge-refs (agent:read)
- POST /api/v2/agents/:id/knowledge-refs (agent:edit)
- DELETE /:refId (agent:edit)

**Tests (4+ cases):**
1. 2 KB refs → retrieve 从 2 个
2. 0 refs → 空 context
3. minScore 过滤
4. prompt 拼装

**Commit:** feat(plan-B2): RAG service + agent knowledge-refs 端点

### Task 7: agent run 集成 RAG

**Files:** Modify agent-routes.ts, Modify __tests__

**改动:**
- POST /api/v2/agents/:id/run: 查 agent_knowledge_refs
- 若有 refs → buildRagContext → 注入 LLM context
- 写 usage_reports (knowledge 维度 +1)

**Tests (2+ cases):**
1. 0 refs → 不调 RAG
2. 2 refs → 调 buildRagContext 一次

**Commit:** feat(plan-B2): agent /run 集成 RAG

### Task 8: 部署 + 端到端验证 + handoff

**Files:** Create .claude/handoff-2026-07-06-panmira-plan-B2.md

**部署步骤:**
```bash
cd /home/ubuntu/panmira-B2
git add -A
git commit -m "feat(plan-B2): 数智底座 KB 完整实施 (8 任务)"
git checkout fix/memory-system-2026-06-27
git merge feat/plan-B2-knowledge-base --no-ff
cd /home/ubuntu/panmira
psql $DATABASE_URL -f /home/ubuntu/panmira-B2/src/db/migrations/2026-07-06-bm25-tsvector.sql
pnpm install
pnpm run build
pm2 restart panmira
sleep 5
pm2 list
```

**E2E curl 验证:**
1. 拿 token (OAuth client_credentials)
2. POST /api/v2/admin/knowledge-bases → 201
3. POST /:id/documents/upload → 201
4. POST /:id/search → 200 + chunks

**Handoff:** .claude/handoff-2026-07-06-panmira-plan-B2.md

**Commit:** docs(handoff): plan-B2 数智底座 KB 部署完成

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| pgvector 维度不匹配 | Task 1 验证 + Task 4 报错 |
| BM25 generated column 不被 auto-migrate 支持 | 手 ALTER 一次,Task 8 执行 |
| 文档超大同步嵌入超时 | Task 3 异步重试;B-3 加队列 |
| RAG prompt 超 token | topK=5 + 截断 500 字符/chunk |
| 版本化无限增长 | 仅留 history,B-3 加 retention |

## 验收

- ✅ 8 类 KB 可创建 (Personal/Team/Company 各能跑)
- ✅ 文档可上传,自动 chunk + embedding
- ✅ 搜索返回 top-K,hybrid RRF 合并
- ✅ visibility 权限过滤工作
- ✅ agent run 自动注入 RAG
- ✅ 实网 curl 通过
- ✅ pm2 online 无 crash
