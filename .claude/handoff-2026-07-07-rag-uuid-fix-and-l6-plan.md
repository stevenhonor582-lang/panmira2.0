# Handoff · 2026-07-07 18:00 · RAG uuid 修复 + L6 异步执行规划

## TL;DR
生产 bug 已修:RAG uuid cast 报错(每 8s cron 触发 1 次)。修复后 cron duration 从 16s(重试) 降到 6-9s(干净),日志无 RAG failed。

main HEAD: 6ec39ad2 (merge 1784a35d)

---

## 已完成
- bug fix: pipeline-engine.ts:234 → userId=null,tenantId 在 'system' 时也 null
- rag-service.ts: RagOptions 允许 null
- hybrid-search.ts: visibilityFilter 允许 null,tenantId 缺失跳过 tenant 过滤
- 新增 rag-service 回归 test
- main HEAD: 6ec39ad2 (pushed)
- pm2: 在线跑修复版本
- 测试: 5 + 8 + 23 = 36 ✅

## 下一步:L6 异步执行 + progress 推送
- POST /api/v2/admin/pipelines/run?async=true → 立即返 {runId, status:pending}
- 后台 worker 处理(reuse scheduled-jobs-worker poll 模式)
- 通过 /ws push progress
- UI: Run tab 加实时进度条
- 预计 1 天

详细 plan 见 .claude/handoff-2026-07-07-rag-uuid-fix-and-l6-plan.md
