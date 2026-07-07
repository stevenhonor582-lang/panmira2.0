# Pipeline Real LLM · Design

> 2026-07-07 · 主仓库 /home/ubuntu/panmira · 分支 feat/pipeline-real-llm
> 把 pipeline-engine.ts 的 mock invokeAgent() 换成复用 agent-run-routes 模式的真实 LLM 调用。

## 1. 目标

让 panmira 平台的"多 Agent 编排"(Pipeline)在生产中真的能跑:每个节点通过真实 LLM 处理输入(支持 system prompt / KB RAG / tools),把输出传给下游节点。脚手架 100% 已就位(DB / API / DAG / UI / 4 路由 200),唯一缺口就是 pipeline-engine.ts:151 的 mock invokeAgent()。

## 2. 范围(Scope Lock)

只动 1 个核心文件 + 测试 + 文档:

| 动 | 不动 |
|---|---|
| src/services/pipeline-engine.ts (替换 mock) | 任何 frontend / web-next 代码 |
| tests/pipeline-engine.test.ts (新增) | engines/claude/executor.ts 及其他 engines |
| docs/superpowers/specs/2026-07-07-pipeline-real-llm-design.md (本文件) | agent-run-routes.ts (它是模板,不是改的对象) |
| .claude/handoff-2026-07-07-pipeline-real-llm.md (完成后) | pipeline-routes.ts (API 层不动) |
| src/db/migrations/0023_*.sql (DB 列) | tool-executor.ts / rag-service.ts / llm-client.ts (复用,不重写) |
| | 其他无关模块(bot, voice, embedder) |
| | /home/ubuntu/panmira-N1 (永不动) |

Phase 3 其他 4 项(Bot 触发 / Cron 真跑 / react-flow 画布 / retry+parallel) 全部留作下次。

## 3. 设计

### 3.1 集成层级 = "完整单 Agent" (Option C)

复用 src/api/routes/agent-run-routes.ts:23-166 的 runAgent() 模式:

```
agent template (systemPrompt + tools + KB refs)
  → RAG 注入 KB 上下文到 system prompt
  → callLlm({ system, messages, tools })
  → 若 tool_use → 1 跳 executeTool → 喂回 callLlm
  → 返回 text + usage
```

为什么不选裸 callLlm (A):失去 "agent" 语义,流水线变成字符串模板。
为什么不选 callLlm + tools 不带 RAG (B):agent 失忆,KB 是它的脑,不带 RAG 等于装糊涂。

### 3.2 invokeAgent 新签名(伪代码)

```typescript
async function invokeAgent(
  node: PipelineNode,
  input: unknown,
  ctx: InvokeContext  // { useMockLlm: boolean, runId: string }
): Promise<{ output: unknown; tokensUsed: number }> {
  // 1. 加载 agent template
  const [agent] = await db.select().from(agents)
    .where(eq(agents.id, node.agentTemplateId)).limit(1);
  if (!agent) throw new Error(`agent ${node.agentTemplateId} not found`);

  // 2. Mock 模式(默认关闭;测试/E2E 开启)
  if (ctx.useMockLlm) {
    return {
      output: { text: `[MOCK ${agent.label}] ${stringifyInput(input).slice(0,200)}`, agentId: agent.id },
      tokensUsed: 0,
    };
  }

  // 3. RAG 上下文(若 agent 有 KB refs)
  const refs = await db.select().from(agentKnowledgeRefs)
    .where(eq(agentKnowledgeRefs.agentId, agent.id));
  let systemPrompt = agent.systemPrompt ?? '';
  if (refs.length > 0) {
    const rag = await buildRagContext({
      agentId: agent.id, userQuery: stringifyInput(input),
      userId: 'pipeline:' + ctx.runId, topK: 5, mode: 'hybrid', minScore: 0,
    });
    systemPrompt = (systemPrompt ? systemPrompt + '\n\n' : '') + rag.prompt;
  }

  // 4. 调 LLM
  const messages: LlmMessage[] = [{ role: 'user', content: stringifyInput(input) }];
  const tools = Array.isArray(agent.tools) && agent.tools.length > 0
    ? (agent.tools as LlmTool[]) : undefined;
  let result = await callLlm({ system: systemPrompt, messages, tools, maxTokens: 1024 });

  // 5. tool_use 1 跳循环(同 agent-run-routes:88-117)
  if (tools && result.toolUses.length > 0) {
    const call = result.toolUses[0]!;
    const toolResult = await executeTool(call.name, call.input, { agentId: agent.id });
    messages.push({ role: 'assistant', content: result.text || '' });
    messages.push({ role: 'user', content: `Tool ${call.name} result: ${JSON.stringify(toolResult.output).slice(0,2000)}` });
    const follow = await callLlm({ system: systemPrompt, messages, tools });
    result = {
      ...result, text: follow.text,
      usage: { inputTokens: result.usage.inputTokens + follow.usage.inputTokens,
               outputTokens: result.usage.outputTokens + follow.usage.outputTokens,
               totalTokens: result.usage.totalTokens + follow.usage.totalTokens },
      durationMs: result.durationMs + follow.durationMs,
    };
  }

  // 6. 记 usage
  if (result.usage.totalTokens > 0) {
    recordTokenUsage(null, 'pipeline-node:' + node.id, result.usage.totalTokens);
  }

  return {
    output: { text: result.text, agentId: agent.id, model: result.model,
              provider: result.provider, toolCalls: result.toolUses },
    tokensUsed: result.usage.totalTokens,
  };
}
```

### 3.3 输入序列化

- 前任 output 是任意对象,LLM 接收字符串
- stringifyInput():null/undefined → "",对象 → JSON.stringify(obj, null, 2) 后截断到 8000 字符
- 大对象截断时附加提示,完整内容在 pipeline_runs.node_states 可查

### 3.4 PipelineNode 字段扩展

不新增 schema 列(避免 DB migration)。useMockLlm 开关在 pipeline_runs 层(per-run),默认 false。

### 3.5 错误处理

| 错误 | 行为 |
|---|---|
| agent not found | 节点 failed,error = agent ${id} not found,pipeline fail-fast |
| LlmCallError(503) | 节点 failed,error 含 provider,pipeline fail-fast |
| LlmCallError(504 timeout) | 节点 failed,error = LLM timed out,pipeline fail-fast |
| executeTool 抛错 | 节点 failed,不喂回 LLM |
| KB 检索失败 | 不阻断,log warning,继续调 LLM |

### 3.6 Token 累加

pipeline_runs 加列 total_tokens_used INTEGER。每节点 tokensUsed 累加到 run 级;前端 DAG timeline 已展示 per-node,再加 sum。

### 3.7 性能

- 单节点 5-30s(LLM 决定)
- 3 节点 pipeline: < 2min
- 不引入 job queue / 异步 / 轮询(留 Phase 3 后续)
- POST /pipelines/:id/trigger 保持 sync

## 4. 测试策略

tests/pipeline-engine.test.ts (vitest, 单文件 ~250 行):

1. DAG 拓扑排序 / Cycle 检测(已有,改 import 路径)
2. mock 模式:节点 A → 节点 B,token=0,不调 callLlm
3. 真实模式无 tools 无 RAG:mock callLlm 验证 system / messages / token 累加
4. 真实模式带 RAG:buildRagContext 被调 1 次,system 拼接
5. 真实模式带 tools + 1 跳 tool_use:executeTool 被调,最终用 follow-up text
6. agent 不存在 → 抛错,节点 failed
7. callLlm 抛 LlmCallError → 节点 failed,error 含 provider
8. 下游节点收到上游 output 的序列化结果

所有 LLM / RAG / Tool 调用用 vitest mock,不调真实 API。

## 5. 部署

```bash
cd /home/ubuntu/panmira
npm run build                # tsc -p tsconfig.build.json + vite + copy
psql ... -f src/db/migrations/0023_*.sql  # DB 列
pm2 reload panmira           # 后端 reload(前端不用动)
```

E2E 验证(deepx.fun):
1. 创建 pipeline: agentA (选题) → agentB (写稿),2 节点
2. POST /api/v2/pipelines/:id/trigger { useMockLlm: false }
3. 等 30-60s
4. GET /api/v2/pipelines/:id/runs/:runId 验证:status=completed,token 累加,真实 LLM 输出

## 6. 不在范围(下次)

- Bot 触发 Pipeline
- Cron 真跑
- react-flow DAG 画布
- 多跳 tool_use / 并行 / 分支 / 真实 retry
- 异步执行 + 进度推送
- KB RAG 缓存复用

## 7. 风险

| 风险 | 缓解 |
|---|---|
| 输入过大撑爆 LLM context | stringifyInput 截断 8000 字符 |
| 工具调用慢 | timeoutMs 30s / 节点(沿用 llm-client 默认) |
| RAG 拉跨 | 失败不阻断 |
| API key 失效 | LlmCallError 透出 |
| Token 计费爆 | 不在本 scope;前端已有 cost dashboard |

## 8. 时间

- Code 3-4h + Test 1-2h + Build+deploy+E2E 1h = 半天

---

核心论据:这不是创造新东西,是把 80% 已经验证存在的零件(llm-client / rag-service / tool-executor / agent-run-routes)对接上一个 20 行的洞。
