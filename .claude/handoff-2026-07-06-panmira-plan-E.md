# Plan E agent /run 真实 LLM 接入 · Handoff (2026-07-06)

## 当前任务
panmira 数智资源管理 SaaS · Plan E(agent /run 真实 LLM 接入)部署完成 🎉

## 已完成 (2026-07-06)

### 新服务 (1)
- `src/services/llm-client.ts` (113 行)
  - `loadDefaultLlmProvider()` — 查 provider_configs WHERE is_default=true AND type='LLM', 解密 API key
  - `callLlm({system, messages, maxTokens?, timeoutMs?})` — POST `${baseUrl}/v1/messages` (anthropic format)
  - 响应解析: `{text, usage: {inputTokens, outputTokens, totalTokens}, model, provider, durationMs}`
  - `LlmCallError` 含 statusCode (401/403/429/502/503/504)
  - 30s timeout via AbortController
  - Headers: `x-api-key` + `anthropic-version: 2023-06-01`

### /run 改造 (1 文件)
- `src/api/routes/agent-run-routes.ts`:
  - 之前: stub 返 `{llmContext: {system, usedKbs}}` + note "未来接入"
  - 现在: 真调 `callLlm` 注入 `rag.prompt` 作 system message
  - mode 字段: `real` (默认) / `mock` (跳过真 LLM,返 echo)
  - 响应:
    ```json
    {
      "response": "LLM 真实回答",
      "llm": { "model": "MiniMax-M3", "provider": "MiniMax", "durationMs": 4143, "usage": { "input": 243, "output": 167, "total": 410 } },
      "rag": { "usedKbIds": [...], "retrievedChunks": 1 }
    }
    ```
  - token 追踪: `recordTokenUsage(tenantId, 'agent:' + agentId, totalTokens)`
  - 失败: 401/403/429/502 → 返对应 statusCode + `{error: 'llm_call_failed', message, provider}`

### 测试 (194 tests,全 pass)
- llm-client: 7 tests
- (含 A/B-1/B-2/B-3/C/D 既有 187 tests)

### 部署
- merge: `feat/plan-E-llm-run` → `fix/memory-system-2026-06-27`
- 修复 commit 59f67ef8 (recordTokenUsage import 漏了)
- `pnpm tsc` + `pm2 restart panmira`
- PID 34, online 250MB

## 实网验证 (2026-07-06 17:34) — 🎉 端到端通

```
1. POST /api/v2/agents/:id/run {query: "grounding LLMs", topK: 3, mode: "hybrid"}
   → 200 {
     "response": "Based on the context provided, here's the answer regarding grounding LLMs:\n\n**Grounding LLMs is predominantly done through RAG (Retrieval Augmented Generation).** According to the context [1], RAG works by:\n\n1. **Retrieving** the top-K chunks from a vector database\n2. **Using those chunks as context** for the LLM to generate informed responses\n\nThis pattern helps anchor LLM outputs in actual source data...",
     "rag": { "usedKbIds": ["kb-1"], "retrievedChunks": 1, "promptLength": 681 },
     "llm": { "model": "MiniMax-M3", "provider": "MiniMax", "durationMs": 4143,
              "usage": { "inputTokens": 243, "outputTokens": 167, "totalTokens": 410 } }
   }
2. usage_reports: token 计数 agent:ce0de8dc-... = 410 ✓
3. POST /api/v2/agents/:id/run {query: "...", mode: "mock"}
   → 200 {response: "[MOCK] response for: ...", llm.provider: "mock"}
```

## 修复
1. **recordTokenUsage import 漏了** — 跟 plan B-3 一样, commit 加调用但没加 import → 部署后 500,补 import

## Adapt 决策
- **anthropic-compatible 协议** — GLM-5.2 + MiniMax-M3 都用 `${baseUrl}/v1/messages` 协议
- **直接 fetch** (不用 SDK query-runner) — query-runner 涉及 session/hook/can-use-tool,过度设计;直接 fetch 更可控
- **mock 模式** — dev/test 不消耗 token,前端可调
- **provider 解密** — 用 `crypto.decrypt()`,不 log key

## 待办 (后续 plan)

### Plan F 续 SaaS
- 大 KB 文档异步嵌入队列 (本期同步,慢)
- 多 LLM provider 路由 (按 model name 选 provider)
- LLM 响应 stream (SSE, 长回答)
- tool calling 接入 (claude-agent-sdk 全套)
- 真实 session 续接 (多轮对话)
- LLM cost 追踪 (cost_usd)
- 报表 quota cron (90 天清理)
- admin web dashboard (报表 UI)

### 跨 plan 增强
- LLM 限流 (per-tenant rpm/tpm)
- 缓存相同 query 的 RAG 结果
- 错误重试 (exponential backoff)

## 关键文件路径

- Spec: `projects/panmira/specs/2026-07-06-resource-engine-design.md` §11
- 实施 plan: `docs/superpowers/plans/2026-07-06-panmira-plan-E.md`
- LLM client: `src/services/llm-client.ts` (113 行)
- /run 改造: `src/api/routes/agent-run-routes.ts`
- 测试: `src/services/__tests__/llm-client.test.ts`

## 实网入口

- `https://deepx.fun/api/v2/agents/:id/run` (Bearer + agent:edit, 真 LLM)
  - `mode=mock` — 开发/测试 (无 token 消耗)
  - `mode=real` (默认) — 真 LLM + RAG

## 风险与教训

1. **merge 漏 import 反复出现** — B-3, E 都有同样问题。修复: 部署后必须立刻 curl 一个端到端验证,不能只看测试 pass
2. **API key 解密** — 不能 log provider.apiKey,只 log provider.name
3. **超时控制** — AbortController 必须 clearTimeout 防止泄漏
4. **model fallback** — 当前只用 default provider,生产需多 provider 路由
5. **token 计数** — 用 provider 返的 usage, 不能估算 (会偏差)

## 上下文恢复指引
下次会话开头:
1. 读 `.claude/handoff-2026-07-06-panmira-plan-E.md` (本文件)
2. 读 B/C/D handoff 拿上下文
3. 读 `panmira-rebuild-state.md` + `panmira-deploy-workflow.md` memory
4. 看 git log: `fix/memory-system-2026-06-27` 累计 19 个 plan commits
5. 检查 pm2: `ssh mah` → `pm2 list` 看到 panmira online
6. 继续 plan F (异步嵌入 / 报表 dashboard / tool calling)

## 下一步选择
- [A] plan F: 大 KB 文档异步嵌入队列 (后台 worker)
- [B] plan G: tool calling 接入 (claude-agent-sdk 全套)
- [C] plan H: 报表 dashboard UI (admin web)
- [D] 别的
