# Plan E agent /run 真实 LLM 接入 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (本计划直接由当前会话执行)

**Goal:** 把 `POST /api/v2/agents/:id/run` 从 RAG 准备 stub 升级为真正调 LLM (anthropic-compatible 协议) + token 追踪

**Architecture:**
- `src/services/llm-client.ts` — 拿 default LLM provider_config, 调 `/v1/messages` (anthropic format)
- `agent-run-routes.ts` — 注入 RAG prompt 作 system message, 调 callLlm, 返 {response, usage}
- token 计数 (input/output/total) → recordTokenUsage (count=total)
- mode=mock 跳过真 LLM (开发/测试用)
- 失败兜底 (provider 不可用 / 超时)

**Tech Stack:** Node16 ESM + fetch (native) + Drizzle ORM + Anthropic Messages API

## 全局约束

- 协议: anthropic-compatible (`/v1/messages`), 支持 GLM-5.2 + MiniMax-M3 (现有 provider)
- 默认 provider: provider_configs.is_default=true + type='LLM'
- maxTokens 默认 1024
- 超时 30s (AbortController)
- token 计数: usage.input_tokens + usage.output_tokens → recordTokenUsage
- mock 模式: mode=mock 时返 echo + 不真调 LLM
- 测试: 每文件 ≥3 cases
- 提交: 每任务单独 commit,Conventional Commits

## 任务清单 (4 步)

### Task 1: LLM 调用服务

**Files:**
- Create: `src/services/llm-client.ts`
- Create: `src/services/__tests__/llm-client.test.ts`

**接口:**
```typescript
export interface LlmMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LlmCallOptions {
  system?: string;
  messages: LlmMessage[];
  maxTokens?: number;  // default 1024
  model?: string;       // override default
  timeoutMs?: number;   // default 30000
}

export interface LlmCallResult {
  text: string;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
  model: string;
  provider: string;
}

export async function callLlm(opts: LlmCallOptions): Promise<LlmCallResult>;

export async function loadDefaultLlmProvider(): Promise<{baseUrl, apiKey, model, name} | null>;

export class LlmCallError extends Error { ... }
```

**实现:**
- loadDefaultLlmProvider: 查 provider_configs WHERE is_default=true AND type='LLM'
- 解密 apiKey (用 crypto.decrypt)
- callLlm: POST 到 `${baseUrl}/v1/messages` (anthropic format)
- body: `{model, max_tokens, system, messages: [{role, content}]}`
- response: `{content: [{type: 'text', text: '...'}], usage: {input_tokens, output_tokens}, model, stop_reason}`
- 超时 30s (AbortController)
- 错误: 401/403/404 → 抛 LlmCallError, 含 statusCode

**Tests (5+ cases):**
1. loadDefaultLlmProvider 返 null (无 provider)
2. loadDefaultLlmProvider 返 config
3. callLlm 调 fetch 正确
4. 401 抛 LlmCallError
5. 超时抛错

**Commit:** `feat(plan-E): LLM client (anthropic-compatible)`

### Task 2: /run 集成真实 LLM 调用

**Files:**
- Modify: `src/api/routes/agent-run-routes.ts`

**改造:**
- 已有 rag 准备代码, 加: `if (rag) { result = await callLlm({system: rag.prompt, messages: [{role: 'user', content: query}], maxTokens: 1024}) }`
- 若没 rag, 直接用 query 作 system/user 调 LLM
- 返:
  ```json
  {
    "success": true,
    "data": {
      "agentId": "...",
      "query": "...",
      "response": "LLM 回答文本",
      "rag": {...},
      "llm": { "model": "MiniMax-M3", "provider": "MiniMax", "durationMs": 1234, "usage": {...} },
      "usage": { "knowledgeCalls": 1, "retrievedChunks": 1, "tokens": { "input": 100, "output": 50, "total": 150 } }
    }
  }
  ```
- token 追踪: `recordTokenUsage(ctx.tenantId, 'agent-' + agentId, result.usage.totalTokens)` (count=token 数量)
- 失败: 500 + 错误信息
- 耗时: `Date.now() - start` 记 llm.durationMs

**Tests (2+ cases):**
- handler 仍 reachable (dispatch true)
- mode=mock 时不调 LLM (不抛网络错)

**Commit:** `feat(plan-E): agent /run 集成真实 LLM 调用`

### Task 3: LLM 失败兜底 + mock 模式

**Files:**
- Modify: `src/api/routes/agent-run-routes.ts`
- Modify: `src/api/routes/__tests__/agent-run-routes.test.ts` (加 mock mode case)

**实现:**
- 接受 `mode` 字段: 'real' (默认) / 'mock'
- mock 模式: 不调 LLM, 返 `echo: "Mock response for: ${query}"`
- provider 不可用: 返 503 {error: 'llm_provider_unavailable'}
- LLM 错误: 返 500 {error: 'llm_call_failed', message: ...}
- 超时 30s (AbortController, 超时返 504)

**Tests (4+ cases):**
- mock mode reachable
- mode=mock 路径不被网络调用 (mock fetch 验证)
- 401/403 处理
- 超时处理

**Commit:** `feat(plan-E): LLM 失败兜底 + mock 模式`

### Task 4: 部署 + 实网验证 + handoff

**Files:**
- Create: `.claude/handoff-2026-07-06-panmira-plan-E.md`

**部署:**
```bash
cd /home/ubuntu/panmira-E
git add -A
git commit -m "feat(plan-E): agent /run 真实 LLM 接入"
git checkout fix/memory-system-2026-06-27
git merge feat/plan-E-llm-run --no-ff
cd /home/ubuntu/panmira
pnpm install
pnpm run build
pm2 restart panmira
sleep 5
pm2 list
```

**E2E curl:**
1. POST /agents/:id/run mode=mock → 200 {response: "Mock..."}
2. POST /agents/:id/run (real) → 200 {response: 真实 LLM 回答, usage: {tokens}}
3. usage_reports: token 计数累加

**Handoff:** `.claude/handoff-2026-07-06-panmira-plan-E.md`

**Commit:** `docs(handoff): plan-E LLM 接入 部署完成`

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| LLM API 限流 | catch 429 → 503, 客户端退避重试 |
| API key 泄露 | 解密后只用于本次请求, 不 log |
| LLM 超时 | AbortController 30s, 超时返 504 |
| provider 不可用 | loadDefaultLlmProvider 返 null → 503 |
| 大量 token 消耗 | maxTokens 限制 (默认 1024), usage 记录 |

## 验收

- ✅ LLM client 拿 default provider, 调 /v1/messages
- ✅ agent /run 注入 RAG prompt, 调真 LLM
- ✅ mock 模式跳过真 LLM (开发用)
- ✅ token usage 记录到 usage_reports
- ✅ 失败返 503/500/504 (provider/llm/timeout)
- ✅ 实网 curl 通过 (mock + real)
- ✅ pm2 online
