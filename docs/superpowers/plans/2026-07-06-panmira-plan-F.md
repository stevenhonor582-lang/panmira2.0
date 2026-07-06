# Plan F 大 KB 文档异步嵌入队列 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (本计划直接由当前会话执行)

**Goal:** 把 KB 文档上传从同步嵌入改造为异步队列,大文档 (>10MB) 不阻塞 HTTP 响应,失败自动重试

**Architecture:**
- `embedding_jobs` 新表 (id, doc_id, kb_id, status, attempts, error, ...)
- KB upload 立即 chunk + 写 chunks (embedding=null), enqueue job → 返 202
- `embedding-worker` 后台 poll pending jobs, 逐条调 embedText, update chunks
- 失败: 重试 3 次 → 标 failed
- 启动时 `startEmbeddingWorker()` (in-process, 不开单独进程)

**Tech Stack:** Drizzle ORM + PostgreSQL 16 + Node16 ESM + setInterval

## 全局约束

- 状态: `pending` / `processing` / `completed` / `failed`
- 单条处理 (一次只处理一个 job), 防 embedding API 限流
- Poll 间隔: 5s
- 重试: 失败 attempt+1, 达到 3 → failed
- 端点 prefix `/api/v2/admin/*`
- Scope: `knowledge:admin` / `knowledge:read`
- 测试: 每文件 ≥3 cases
- 提交: 每任务单独 commit,Conventional Commits

## 任务清单 (4 步)

### Task 1: embedding_jobs schema + 端点

**Files:**
- Modify: `src/db/schema.ts` (末尾加 embeddingJobs)
- Create: `src/api/routes/embedding-jobs-routes.ts`
- Create: `src/api/routes/__tests__/embedding-jobs-routes.test.ts`
- Modify: `src/api/routes/index.ts` (export)
- Modify: `src/api/http-server.ts` (注册)

**Schema:**
```typescript
export const embeddingJobs = pgTable('embedding_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  docId: varchar('doc_id', { length: 255 }).notNull(),
  kbId: uuid('kb_id').notNull(),
  tenantId: uuid('tenant_id').notNull(),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  totalChunks: integer('total_chunks').notNull().default(0),
  embeddedChunks: integer('embedded_chunks').notNull().default(0),
  attempts: integer('attempts').notNull().default(0),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});
```

**端点:**
- `GET /api/v2/admin/embedding-jobs/:id` (knowledge:read|admin) — 查 job 状态

**Tests (5+ cases):**
1. exports function
2. returns false for non-jobs URL
3. handles GET /:id
4. does NOT match POST/PATCH/DELETE
5. URL with subpath

**Commit:** `feat(plan-F): embedding_jobs schema + GET 端点`

### Task 2: KB upload 改造为 enqueue

**Files:**
- Modify: `src/api/routes/knowledge-base-routes.ts`

**改造:**
- uploadDocumentToKb 现在:
  1. 创 document
  2. 立即 chunk + 写 chunks (embedding=null)
  3. enqueue embedding job (单条 job 覆盖所有 chunks)
  4. 返 202 {jobId, docId, chunks, queued: true}
- 不再同步等 embed 完成
- 失败 (queue 写失败) → 返 500 + 错误

**关键:**
- embedding 写 chunks 时 UPDATE 而不是 INSERT (不能重复 row)
- worker 处理时:
  - 拿 doc 所有 chunks (embedding IS NULL)
  - 逐条调 embedText
  - 写 chunk.embedding
  - 递增 embeddedChunks, 全部完成 → status=completed

**Tests (3+ cases):**
1. handler reachable
2. 错误: 缺 title/content → 400 (不需要 DB)
3. enqueue 失败路径

**Commit:** `feat(plan-F): KB upload 改造为 enqueue 模式 (202 即时返)`

### Task 3: embedding worker

**Files:**
- Create: `src/services/embedding-worker.ts`
- Create: `src/services/__tests__/embedding-worker.test.ts`
- Modify: `src/index.ts` (启动时 startEmbeddingWorker)

**接口:**
```typescript
export function startEmbeddingWorker(intervalMs?: number): NodeJS.Timeout;
export function stopEmbeddingWorker(timer?: NodeJS.Timeout): void;
export async function processOneJob(): Promise<{processed: boolean, jobId?: string}>;
```

**实现:**
- setInterval 每 5s 调 processOneJob
- processOneJob:
  - 拿一个 pending job (SELECT ... LIMIT 1 FOR UPDATE SKIP LOCKED)
  - status → processing, attempts+1
  - 拿 doc 的所有 chunks (embedding IS NULL)
  - 逐条调 embedText (用 doc 的 KB.embeddingProviderId)
  - 写 chunk.embedding (UPDATE document_chunks SET embedding=$1 WHERE id=$2)
  - 全部完成 → status=completed, completedAt=now()
  - 任何失败 → 标 attempts+1, 错误 3 次 → failed

**Tests (4+ cases):**
1. startEmbeddingWorker 返 timer
2. stopEmbeddingWorker 停止
3. processOneJob 改 status
4. 错误重试机制

**Commit:** `feat(plan-F): embedding worker (5s poll + 3 次重试)`

### Task 4: 部署 + 实网验证 + handoff

**Files:**
- Create: `.claude/handoff-2026-07-06-panmira-plan-F.md`

**部署:**
```bash
cd /home/ubuntu/panmira-F
git add -A
git commit -m "feat(plan-F): 异步嵌入队列 + worker"
git checkout fix/memory-system-2026-06-27
git merge feat/plan-F-async-embed --no-ff
cd /home/ubuntu/panmira
pnpm install
pnpm run build
pm2 restart panmira
sleep 5
pm2 list
```

**E2E curl:**
1. POST /api/v2/admin/knowledge-bases/:id/documents/upload
   → 202 {jobId, docId, chunks, queued: true} (立即返, 不等嵌入)
2. GET /api/v2/admin/embedding-jobs/:jobId
   → 200 {status: pending|processing|completed, embeddedChunks, totalChunks}
3. 等 5-10s 后再查 → status=completed, embeddedChunks=totalChunks
4. RAG 检索 → 命中 (chunk.embedding 已填充)

**Handoff:** `.claude/handoff-2026-07-06-panmira-plan-F.md`

**Commit:** `docs(handoff): plan-F 异步嵌入队列 部署完成`

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| Worker 单进程瓶颈 | 后续可拆独立进程,本期 in-process 够用 |
| 嵌入 API 慢 (10MB doc) | 单条处理 + 限流 (5s 间隔), 不并发 |
| 失败重试无限循环 | attempts 限 3 次,failed 状态终结 |
| 任务丢失 (重启) | status=processing 重启后会变孤儿,本期加简单恢复 (下次 processOneJob 把超过 1h processing 的重置为 pending) |
| embedding_jobs 表爆炸增长 | 加 retention (7 天清理 completed/failed) - 后续 plan |

## 验收

- ✅ embedding_jobs 表创建
- ✅ upload 立即返 202 (不等嵌入)
- ✅ worker 后台跑, 5s poll
- ✅ 失败 3 次重试, 标 failed
- ✅ chunk.embedding 实际填充
- ✅ RAG 检索可命中 (嵌入完成前 false recall, 完成后命中)
- ✅ 实网 curl 通过
- ✅ pm2 online
