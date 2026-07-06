# Plan G tool_use 循环 · Handoff (2026-07-06)

## 当前任务
panmira 数智资源管理 SaaS · Plan G(LLM tool_use 循环)部署完成 🎉

## 已完成 (2026-07-06)

### 新服务 (1)
- `src/services/tool-executor.ts` (98 行)
  - `TOOL_DEFINITIONS` — 工具 schema 数组 (anthropic 格式)
  - `executeTool(toolName, input, ctx)` — 工具分发
  - `executeKnowledgeSearch(agentId, tenantId, input)` — 在 agent 绑的 KB 搜索 (复用 hybrid-search)
  - topK 限制 1-10 (clamp)

### LLM client 扩展
- `llm-client.ts` 加 `tools` 参数 + `LlmToolUse` 返 + `stopReason`
- response 解析: content 数组 → text + toolUses

### /run 改造 (1 文件)
- `agent-run-routes.ts`:
  - 之前: LLM 一次性返 text
  - 现在: 检测 `toolUses.length > 0` → executeTool → 喂回 LLM (1 跳, 防无限循环)
  - 响应: `llm.toolCalls: [{tool: {name, input}, result: {output, error}}]`
  - token 累加 (tool_use 算 2 次 LLM)
  - 工具只在有 RAG context 时启用 (`enableTools = body.tools !== false && rag !== null`)

### 测试 (165 tests,全 pass)
- tool-executor: 6 tests
- (含 A/B-1/B-2/B-3/C/D/E/F 既有 159 tests)

### 部署
- merge: `feat/plan-G-tool-use` → `fix/memory-system-2026-06-27`
- `pnpm tsc` + `pm2 restart panmira`
- PID 34, online 245MB

## 实网验证 (2026-07-06 17:44) — 🎉 tool_use 端到端

```
1. POST /api/v2/agents/:id/run {query: "What is grounding LLMs? Please use knowledge_search..."}
   → 200 {
     mode: "real",
     response: "# Grounding LLMs\n\n**Grounding** refers to the process of anchoring...",
     llm: {
       model: "MiniMax-M3",
       provider: "MiniMax",
       usage: { totalTokens: 1670 },  // 2 次 LLM (tool call + follow-up)
       toolCalls: [{ tool: { name: "knowledge_search", input: {query: "grounding LLMs", topK: 3}}, result: {...} }]
     }
   }
2. POST /api/v2/agents/:id/run {query: "test", mode: "mock"}
   → 200 {response: "[MOCK] response for: test"}
```

## 修复
- 无(此次 plan 部署顺利)

## Adapt 决策
- **1 跳限制** — 防 LLM 反复调 tool 进无限循环,够用 90% 场景
- **工具仅在有 RAG 时启用** — 无 RAG 的话 LLM 没理由调工具
- **复用 hybrid-search** — 不写新检索,知识库搜索=KB 搜索
- **toolCalls 暴露在响应** — 客户端可看到 LLM 调了什么,debug 友好

## 待办 (后续 plan)

### Plan H+ 续 SaaS
- 多轮 tool_use (LLM 决定何时停止)
- 更多工具: web_search, calculator, file_read, code_exec
- tool_use 配额 (per-tenant tool calls/day)
- tool result 缓存 (相同 input 返缓存)
- stream tool_use 进度 (SSE)

### 跨 plan 增强
- LLM streaming (当前返完整 text)
- tool input validation (按 schema 严格校验)
- tool 错误重试 (调 tool 失败时让 LLM 重试)

## 关键文件路径

- Spec: `projects/panmira/specs/2026-07-06-resource-engine-design.md` §11.5
- 实施 plan: `docs/superpowers/plans/2026-07-06-panmira-plan-G.md`
- Tool executor: `src/services/tool-executor.ts` (98 行)
- LLM client (扩展): `src/services/llm-client.ts`
- /run 改造: `src/api/routes/agent-run-routes.ts`
- 测试: `src/services/__tests__/tool-executor.test.ts`

## 实网入口

- `https://deepx.fun/api/v2/agents/:id/run` (Bearer + agent:edit)
  - `mode=mock` — 跳过 LLM
  - `mode=real` (默认) — LLM + RAG + tool_use

## 风险与教训

1. **1 跳限制** — LLM 可能想连续调多 tool, 当前会截断; 后续 plan 加多轮
2. **tool 数量** — 当前只 1 个 (knowledge_search), 扩展时注意 LLM context window
3. **tool result 大小** — 喂回 LLM 前截断 2000 字符,避免爆 context
4. **token 翻倍** — tool_use 算 2 次 LLM, 配额消耗翻倍
5. **错误处理** — tool execute 失败 (例如 KB 不可达) → result 含 error 字段, LLM 看到可调整

## 上下文恢复指引 (准备 compact)
下次会话开头:
1. 读 `.claude/handoff-2026-07-06-panmira-plan-G.md` (本文件)
2. 读 `panmira-rebuild-state.md` + `panmira-deploy-workflow.md` memory
3. 读 B/C/D/E/F handoff 拿上下文
4. 看 git log: `fix/memory-system-2026-06-27` 累计 24 个 plan commits
5. 检查 pm2: `ssh mah` → `pm2 list` 看到 panmira online
6. 继续 plan H+ (dashboard / 多轮 tool / 更多工具)

## 下一步选择
- [A] plan H: 报表 dashboard UI (admin web 5 维度可视化)
- [B] plan I: 多轮 tool_use + 更多工具 (web_search, calculator)
- [C] plan J: LLM streaming (SSE 长回答)
- [D] 别的
