# Plan F 大 KB 文档异步嵌入队列 · Handoff (2026-07-06)

## 当前任务
panmira 数智资源管理 SaaS · Plan F(异步嵌入队列 + worker)部署完成

## 已完成 (2026-07-06)

### 新表 (1)
- `embedding_jobs` (11 字段)
  - id (uuid PK) + docId + kbId + tenantId
  - status: `pending` / `processing` / `completed` / `failed`
  - totalChunks + embeddedChunks
  - attempts (重试计数, max 3)
  - error (失败信息)
  - createdAt + completedAt

### 新服务 (1)
- `src/services/embedding-worker.ts` (108 行)
  - `startEmbeddingWorker(intervalMs?)` — 默认 5s poll
  - `processOneJob()` — 拿一个 pending job (FOR UPDATE SKIP LOCKED), 标 processing, 逐条调 embedText, UPDATE chunks
  - 失败: attempts+1, 达 3 → 标 failed, 否则重新 pending 等下次重试
  - 启动时立即调 `startEmbeddingWorker()` (在 src/index.ts)

### 新端点 (1)
- `GET /api/v2/admin/embedding-jobs/:id` (knowledge:read|admin) — 查 job 状态

### /upload 改造 (1 文件)
- `src/api/routes/knowledge-base-routes.ts uploadDocumentToKb`:
  - 之前: 同步等 embed 完成, 1 chunk = 1 次 API call
  - 现在: 立即 chunk + 写 chunks (embedding=null) + enqueue job + 返 **202**

### 测试 (159 tests,全 pass)
- embedding-jobs-routes: 5 tests
- embedding-worker: 4 tests
- (含 A/B-1/B-2/B-3/C/D/E 既有 150 tests)

### 部署
- merge: `feat/plan-F-async-embed` → `fix/memory-system-2026-06-27`
- `pnpm tsc` + `pm2 restart panmira`
- PID 34, online 245MB

## 实网验证 (2026-07-06 17:41)

```
1. POST /api/v2/admin/knowledge-bases/:id/documents/upload
   → 202 {docId, jobId, chunks: 1, queued: true, status: 'pending'} 立即返 (< 50ms)
2. GET /api/v2/admin/embedding-jobs/:jobId
   → 200 {status: pending, totalChunks: 1, embeddedChunks: 0, attempts: 0}
3. sleep 8s (worker poll 5s 一次)
4. GET /api/v2/admin/embedding-jobs/:jobId
   → 200 {status: completed, totalChunks: 1, embeddedChunks: 0, attempts: 1}
   (embeddedChunks=0 因为 KB 没配 embedding provider,worker 标 completed 因为 chunks 已存)
5. pm2 log: "[embedding-worker] started, interval=5000ms"
```

## 修复
1. **embedding-worker 测试** — db.select 需 mock 返 KB with embeddingProviderId, 否则 providerId=null 跳过 embedText
2. **?? 和 || 优先级** — 又是这个, 加括号
3. **vi.mock 路径** — 测试在 `__tests__/`, 需 `../../db/index.js`

## Adapt 决策
- **FOR UPDATE SKIP LOCKED** — 多 worker 并发安全 (本期单 worker, 但 SQL 已为多 worker 准备)
- **无 provider 也标 completed** — 文档已存,只是没向量化;后续 plan 配 provider 后可重跑
- **failure 3 次才 failed** — 2 次重试,避免临时网络抖动
- **in-process worker** — 不开独立进程,简化部署;后续可拆

## 待办 (后续 plan)

### Plan G 续 SaaS
- tool calling 接入 (claude-agent-sdk 全套)
- embedding worker 多进程 (cluster mode)
- failed job 重置为 pending (admin 端点)
- 报表 dashboard UI
- embedding_jobs retention (7 天清理)
- 嵌入 API 限流 (per-provider rpm)

### 跨 plan 增强
- 大文档 (>10MB) 切分 + 多 worker 并行
- 嵌入成本追踪 (cost_usd)
- 失败时邮件/Slack 告警

## 关键文件路径

- Spec: `projects/panmira/specs/2026-07-06-resource-engine-design.md` §11.4
- 实施 plan: `docs/superpowers/plans/2026-07-06-panmira-plan-F.md`
- Worker: `src/services/embedding-worker.ts` (108 行)
- Embedding jobs 端点: `src/api/routes/embedding-jobs-routes.ts`
- Upload 改造: `src/api/routes/knowledge-base-routes.ts` (uploadDocumentToKb)
- 测试: `src/services/__tests__/embedding-worker.test.ts` + `src/api/routes/__tests__/embedding-jobs-routes.test.ts`

## 实网入口

- `https://deepx.fun/api/v2/admin/knowledge-bases/:id/documents/upload` (Bearer + knowledge:admin, 返 202)
- `https://deepx.fun/api/v2/admin/embedding-jobs/:id` (Bearer + knowledge:read, 查 job 状态)

## 风险与教训

1. **嵌入 API 慢导致 timeout** — 之前 10MB doc 同步等嵌入会 timeout, 现在 enqueue + worker 异步处理
2. **vi.mock 路径** — 测试在 `__tests__/` 子目录, mock 路径需 `../../db/index.js` (与生产 import 不同)
3. **FOR UPDATE SKIP LOCKED** — PostgreSQL 9.5+ 支持, 防止多 worker 抢同一 job
4. **failed 不重置 pending** — admin 需手动重置,避免无限循环
5. **chunks 写完再 embed** — 上传立即可查 doc,嵌入异步填向量

## 上下文恢复指引
下次会话开头:
1. 读 `.claude/handoff-2026-07-06-panmira-plan-F.md` (本文件)
2. 读 B/C/D/E handoff 拿上下文
3. 读 `panmira-rebuild-state.md` + `panmira-deploy-workflow.md` memory
4. 看 git log: `fix/memory-system-2026-06-27` 累计 21 个 plan commits
5. 检查 pm2: `ssh mah` → `pm2 list` 看到 panmira online
6. 继续 plan G (tool calling / dashboard / 失败重置)

## 下一步选择
- [A] plan G: tool calling 接入 (claude-agent-sdk 全套,让 agent 真调工具)
- [B] plan H: 报表 dashboard UI (admin web 页面, 5 维度可视化)
- [C] plan I: 嵌入 worker 多进程 + retention 清理
- [D] 别的
