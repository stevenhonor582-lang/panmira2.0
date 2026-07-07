# Pipeline Real LLM Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 替换 `src/services/pipeline-engine.ts` 的 mock `invokeAgent()` 为真实 LLM 调用(复用 agent-run-routes 模式),让 panmira 多 Agent Pipeline 在生产中真能跑。

**Architecture:** Option C — 完整单 Agent 模式。每个 pipeline 节点 = 加载 agent template(systemPrompt + tools + KB refs) → 调 callLlm(可带 RAG / tools)。pipeline 引擎(DAG / 状态机 / 错误 fail-fast)不动,只换节点执行。

**Tech Stack:** TypeScript · Drizzle ORM · vitest · 已有 llm-client / rag-service / tool-executor / usage-tracker

## Global Constraints

- 主仓库:`/home/ubuntu/panmira`(只在这工作,**不碰** `/home/ubuntu/panmira-N1`)
- 分支:`feat/pipeline-real-llm`(已从 main HEAD `411cb889` 创建)
- 不改 DB schema(不写 migration,不在 design 范围内)
- Test 路径:`src/services/__tests__/<name>.test.ts`(与现有 `llm-client.test.ts` 同级)
- Mock 模式默认关闭。`useMockLlm` 走 executePipeline 参数(测试直调,API 层不暴露)
- 输入序列化截断阈值:**8000 字符**;LlmCallError timeout 默认 30s
- 工具调用单跳(同 agent-run-routes:88-117);不引入多跳循环
- Commit 频率:每完成 1 个 step / 1 个 task 都 commit
- 部署命令:`npm run build` + `pm2 reload panmira`(前端不动)

## File Structure

| 文件 | 状态 | 责任 |
|---|---|---|
| `src/services/pipeline-engine.ts` | Modify | 替换 mock `invokeAgent`;加 useMockLlm 入参;输入序列化 |
| `src/services/__tests__/pipeline-engine.test.ts` | Create | 单元测试(vitest, mock DB / callLlm / rag / tool) |
| `docs/superpowers/plans/2026-07-07-pipeline-real-llm.md` | Create | 本计划 |
| `.claude/handoff-2026-07-07-pipeline-real-llm.md` | Create | 完成后的工作交接 |

不动的文件:`pipeline-routes.ts` / `llm-client.ts` / `rag-service.ts` / `tool-executor.ts` / `usage-tracker.ts` / `agent-run-routes.ts` / 任何 frontend / 任何 web-next 代码。

---

### Task 1: Test 脚手架

**Files:**
- Create: `src/services/__tests__/pipeline-engine.test.ts`

**Interfaces:**
- 暂时无,只建立测试发现

- [ ] **Step 1: 写空测试文件**

创建 `src/services/__tests__/pipeline-engine.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

describe('pipeline-engine', () => {
  it('placeholder - 删除此测试后开始真测试', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 2: 跑测试验证 vitest 发现**

Run: `cd /home/ubuntu/panmira && npx vitest run src/services/__tests__/pipeline-engine.test.ts`
Expected: 1 test passed

- [ ] **Step 3: Commit**

```bash
cd /home/ubuntu/panmira
git add src/services/__tests__/pipeline-engine.test.ts
git commit -m "test(pipeline): scaffold test file"
```

---

### Task 2: 加 InvokeContext + mock 开关(无 DB 调用)

**Files:**
- Modify: `src/services/pipeline-engine.ts:36-60,151-164,166-252`

**Interfaces:**
- Consumes: 现有 `PipelineNode`, `RunTrigger`, `RunResult`, `NodeState` (不改)
- Produces: 新增 `InvokeContext { useMockLlm: boolean; runId: string }` 导出类型
- `executePipeline` 加可选第 5 参数 `useMockLlm: boolean = false`

- [ ] **Step 1: 写失败测试 — executePipeline 接受 useMockLlm**

替换 `src/services/__tests__/pipeline-engine.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../db/index.js', () => ({
  db: { select: vi.fn() },
  pool: { query: vi.fn() },
}));
vi.mock('../llm-client.js', () => ({
  callLlm: vi.fn(),
  LlmCallError: class extends Error {},
}));
vi.mock('../rag-service.js', () => ({
  buildRagContext: vi.fn(),
}));
vi.mock('../tool-executor.js', () => ({
  executeTool: vi.fn(),
  TOOL_DEFINITIONS: [],
}));
vi.mock('../usage-tracker.js', () => ({
  recordTokenUsage: vi.fn(),
  recordKnowledgeUsage: vi.fn(),
}));

import { executePipeline } from '../pipeline-engine.js';

describe('pipeline-engine › useMockLlm', () => {
  it('mock 模式: 节点不调 LLM, output 含 [MOCK] 前缀', async () => {
    const pipeline = {
      id: 'p1', name: 'test',
      nodes: [{ id: 'n1', label: 'A', agentTemplateId: 'agent-1' }],
      edges: [],
    };
    const result = await executePipeline(
      pipeline, 'run-1',
      { triggeredBy: 'user' as const, initialInput: { topic: 'AI' } },
      async () => {},
      true, // useMockLlm
    );
    expect(result.status).toBe('completed');
    expect(result.nodeStates.n1.status).toBe('success');
    expect(JSON.stringify(result.nodeStates.n1.output)).toContain('[MOCK');
  });
});
```

- [ ] **Step 2: 跑测试 — 应该失败**

Run: `npx vitest run src/services/__tests__/pipeline-engine.test.ts`
Expected: FAIL — executePipeline 当前不接受第 5 参数

- [ ] **Step 3: 改 `pipeline-engine.ts` — 加 useMockLlm + mock 分支**

修改 `src/services/pipeline-engine.ts`:

顶部 import 区,加:
```typescript
import { db } from '../db/index.js';
import { agents, agentKnowledgeRefs } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { callLlm, LlmCallError, type LlmCallOptions, type LlmTool, type LlmMessage } from './llm-client.js';
import { buildRagContext } from './rag-service.js';
import { executeTool, TOOL_DEFINITIONS } from './tool-executor.js';
import { recordTokenUsage } from './usage-tracker.js';
```

在 `export interface RunResult` 之后加:
```typescript
export interface InvokeContext {
  useMockLlm: boolean;
  runId: string;
}
```

替换 `invokeAgent`(现 151-164 行):
```typescript
async function invokeAgent(
  node: PipelineNode,
  input: unknown,
  ctx: InvokeContext,
): Promise<{ output: unknown; tokensUsed: number }> {
  // 1. Mock 模式短路
  if (ctx.useMockLlm) {
    return {
      output: {
        text: `[MOCK ${node.label}] received ${stringifyInput(input).slice(0, 200)}`,
        agentId: node.agentTemplateId,
        mock: true,
      },
      tokensUsed: 0,
    };
  }

  // 2. 加载 agent template
  const [agent] = await db.select().from(agents).where(eq(agents.id, node.agentTemplateId)).limit(1);
  if (!agent) {
    throw new Error(`agent ${node.agentTemplateId} not found`);
  }

  // 3. 调 LLM(详细实现见 Task 3+)
  return await invokeRealAgent(agent, input, ctx);
}
```

在 `executePipeline` 签名加 useMockLlm(现 166 行):
```typescript
export async function executePipeline(
  pipeline: Pipeline,
  runId: string,
  trigger: RunTrigger,
  onNodeUpdate: (nodeId: string, state: NodeState) => Promise<void>,
  useMockLlm: boolean = false,
): Promise<RunResult> {
```

并把 `await invokeAgent(node, currentInput)` 改为 `await invokeAgent(node, currentInput, { useMockLlm, runId })`。

加临时 `invokeRealAgent` 桩(占位,Task 3 实现):
```typescript
async function invokeRealAgent(
  agent: typeof agents.$inferSelect,
  input: unknown,
  ctx: InvokeContext,
): Promise<{ output: unknown; tokensUsed: number }> {
  // Placeholder — implemented in Task 3
  throw new Error('invokeRealAgent not implemented');
}
```

加 `stringifyInput` 工具(顶部 helper):
```typescript
function stringifyInput(input: unknown): string {
  if (input === null || input === undefined) return '';
  if (typeof input === 'string') return input;
  try {
    const s = JSON.stringify(input, null, 2);
    if (s.length > 8000) {
      return s.slice(0, 8000) + '\n...[truncated, full output in pipeline_runs.node_states]';
    }
    return s;
  } catch {
    return String(input);
  }
}
```

- [ ] **Step 4: 跑测试 — mock 模式应该通过**

Run: `npx vitest run src/services/__tests__/pipeline-engine.test.ts`
Expected: 1 passed

- [ ] **Step 5: Commit**

```bash
cd /home/ubuntu/panmira
git add src/services/pipeline-engine.ts src/services/__tests__/pipeline-engine.test.ts
git commit -m "feat(pipeline): add InvokeContext + useMockLlm + invokeAgent scaffold"
```

---

### Task 3: 真实 LLM 调通(无 RAG, 无 tools)

**Files:**
- Modify: `src/services/pipeline-engine.ts` (替换 invokeRealAgent stub)
- Modify: `src/services/__tests__/pipeline-engine.test.ts`

- [ ] **Step 1: 加失败测试 — 真实模式, 无 RAG 无 tools**

在 `describe('pipeline-engine › useMockLlm', ...)` 后加:

```typescript
describe('pipeline-engine › real LLM (no RAG, no tools)', () => {
  it('agent 不存在 → 节点 failed', async () => {
    const { db } = await import('../../db/index.js');
    (db.select as any).mockReturnValue({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }),
    });

    const pipeline = {
      id: 'p1', name: 't',
      nodes: [{ id: 'n1', label: 'A', agentTemplateId: 'missing' }],
      edges: [],
    };
    const result = await executePipeline(
      pipeline, 'run-1', { triggeredBy: 'user' as const }, async () => {}, false,
    );
    expect(result.status).toBe('failed');
    expect(result.nodeStates.n1.status).toBe('failed');
    expect(result.nodeStates.n1.error).toContain('missing');
  });

  it('成功调用: output.text = LLM text, tokensUsed > 0', async () => {
    const { db } = await import('../../db/index.js');
    const fakeAgent = {
      id: 'agent-1', name: 'A',
      systemPrompt: 'You are helpful.',
      tools: [],
    };
    (db.select as any).mockReturnValue({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([fakeAgent]) }) }),
    });

    const { callLlm } = await import('../llm-client.js');
    (callLlm as any).mockResolvedValue({
      text: 'Hello back',
      toolUses: [],
      stopReason: 'end_turn',
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      model: 'MiniMax-M3', provider: 'MiniMax', durationMs: 100,
    });

    const pipeline = {
      id: 'p1', name: 't',
      nodes: [{ id: 'n1', label: 'A', agentTemplateId: 'agent-1' }],
      edges: [],
    };
    const result = await executePipeline(
      pipeline, 'run-1',
      { triggeredBy: 'user' as const, initialInput: { topic: 'AI' } },
      async () => {},
      false,
    );
    expect(result.status).toBe('completed');
    expect((result.nodeStates.n1.output as any).text).toBe('Hello back');
    expect(result.nodeStates.n1.tokensUsed).toBe(15);
    expect(callLlm).toHaveBeenCalledWith(expect.objectContaining({
      system: 'You are helpful.',
    }));
  });
});
```

- [ ] **Step 2: 跑测试 — 应失败(invokeRealAgent 抛 not implemented)**

Run: `npx vitest run src/services/__tests__/pipeline-engine.test.ts`
Expected: 1 passed (useMockLlm) + 2 failed (real LLM)

- [ ] **Step 3: 实现 invokeRealAgent (无 RAG 无 tools 路径)**

替换 `invokeRealAgent` 桩:

```typescript
async function invokeRealAgent(
  agent: typeof agents.$inferSelect,
  input: unknown,
  _ctx: InvokeContext,
): Promise<{ output: unknown; tokensUsed: number }> {
  // KB refs 查询(若无就不调 RAG)
  const refs = await db.select().from(agentKnowledgeRefs)
    .where(eq(agentKnowledgeRefs.agentId, agent.id));
  // 注:此版本暂无 RAG 注入,Task 4 加

  // 构造 messages
  const messages: LlmMessage[] = [{
    role: 'user',
    content: stringifyInput(input),
  }];

  // 调 LLM(无 tools 路径)
  const result = await callLlm({
    system: agent.systemPrompt ?? '',
    messages,
    maxTokens: 1024,
  });

  // 记 token 用量
  if (result.usage.totalTokens > 0) {
    recordTokenUsage('system', `pipeline:agent:${agent.id}`, result.usage.totalTokens);
  }

  return {
    output: {
      text: result.text,
      agentId: agent.id,
      model: result.model,
      provider: result.provider,
    },
    tokensUsed: result.usage.totalTokens,
  };
}
```

- [ ] **Step 4: 跑测试 — 应全过**

Run: `npx vitest run src/services/__tests__/pipeline-engine.test.ts`
Expected: 3 passed (1 mock + 2 real)

- [ ] **Step 5: Commit**

```bash
cd /home/ubuntu/panmira
git add src/services/pipeline-engine.ts src/services/__tests__/pipeline-engine.test.ts
git commit -m "feat(pipeline): real LLM call (no RAG, no tools) + agent not-found handling"
```

---

### Task 4: RAG 上下文注入

**Files:**
- Modify: `src/services/pipeline-engine.ts`
- Modify: `src/services/__tests__/pipeline-engine.test.ts`

- [ ] **Step 1: 加失败测试 — agent 有 KB refs 时, system prompt 含 RAG 内容**

在最后一个 describe 后加:

```typescript
describe('pipeline-engine › RAG', () => {
  it('agent 有 KB refs → buildRagContext 被调, system 拼接 RAG prompt', async () => {
    const { db } = await import('../../db/index.js');
    const fakeAgent = { id: 'a-rag', name: 'R', systemPrompt: 'Be brief.', tools: [] };
    const fakeRefs = [{ id: 'r1', agentId: 'a-rag', kbId: 'kb1' }];
    let selectCallCount = 0;
    (db.select as any).mockImplementation(() => ({
      from: () => ({
        where: () => ({
          limit: () => {
            selectCallCount++;
            return Promise.resolve(selectCallCount === 1 ? [fakeAgent] : fakeRefs);
          },
        }),
      }),
    }));

    const { buildRagContext } = await import('../rag-service.js');
    (buildRagContext as any).mockResolvedValue({
      prompt: '[RAG-CONTEXT]\nDoc 1\nDoc 2',
      usedKbIds: ['kb1'],
      retrievedChunks: [{ id: 'c1' }, { id: 'c2' }],
      kbBreakdown: { kb1: 2 },
    });

    const { callLlm } = await import('../llm-client.js');
    (callLlm as any).mockResolvedValue({
      text: 'OK', toolUses: [],
      usage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 },
      model: 'MiniMax-M3', provider: 'MiniMax', durationMs: 50,
    });

    const pipeline = {
      id: 'p', name: 't',
      nodes: [{ id: 'n', label: 'R', agentTemplateId: 'a-rag' }],
      edges: [],
    };
    await executePipeline(
      pipeline, 'r', { triggeredBy: 'user' as const, initialInput: { q: '?' } },
      async () => {}, false,
    );
    expect(buildRagContext).toHaveBeenCalled();
    expect(callLlm).toHaveBeenCalledWith(expect.objectContaining({
      system: 'Be brief.\n\n[RAG-CONTEXT]\nDoc 1\nDoc 2',
    }));
  });

  it('agent 无 KB refs → buildRagContext 不调, system = agent.systemPrompt 原始', async () => {
    const { db } = await import('../../db/index.js');
    const fakeAgent = { id: 'a-norag', name: 'X', systemPrompt: 'No RAG here.', tools: [] };
    let n = 0;
    (db.select as any).mockImplementation(() => ({
      from: () => ({
        where: () => ({
          limit: () => {
            n++;
            return Promise.resolve(n === 1 ? [fakeAgent] : []);
          },
        }),
      }),
    }));
    const { buildRagContext } = await import('../rag-service.js');
    const { callLlm } = await import('../llm-client.js');
    (callLlm as any).mockResolvedValue({
      text: 'ok', toolUses: [],
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      model: 'm', provider: 'p', durationMs: 0,
    });

    const pipeline = {
      id: 'p', name: 't',
      nodes: [{ id: 'n', label: 'X', agentTemplateId: 'a-norag' }],
      edges: [],
    };
    await executePipeline(
      pipeline, 'r', { triggeredBy: 'user' as const }, async () => {}, false,
    );
    expect(buildRagContext).not.toHaveBeenCalled();
    expect(callLlm).toHaveBeenCalledWith(expect.objectContaining({
      system: 'No RAG here.',
    }));
  });
});
```

- [ ] **Step 2: 跑测试 — 失败(RAG 路径还没实现)**

Run: `npx vitest run src/services/__tests__/pipeline-engine.test.ts`
Expected: 2 new tests fail

- [ ] **Step 3: 改 invokeRealAgent 加 RAG 注入**

在 `invokeRealAgent` 里,加在构造 messages 之前:

```typescript
// 1. RAG 上下文(若 agent 有 KB refs)
let systemPrompt = agent.systemPrompt ?? '';
if (refs.length > 0) {
  let rag;
  try {
    rag = await buildRagContext({
      agentId: agent.id,
      userQuery: stringifyInput(input),
      userId: 'pipeline:' + _ctx.runId,
      topK: 5,
      mode: 'hybrid',
      minScore: 0,
    });
  } catch (e) {
    // RAG 失败不阻断 — log warning 继续
    console.warn(`[pipeline] RAG failed for agent ${agent.id}:`, (e as Error).message);
  }
  if (rag?.prompt) {
    systemPrompt = systemPrompt ? systemPrompt + '\n\n' + rag.prompt : rag.prompt;
  }
}
```

并把后面 `system: agent.systemPrompt ?? ''` 改为 `system: systemPrompt`。

- [ ] **Step 4: 跑测试 — 全过**

Run: `npx vitest run src/services/__tests__/pipeline-engine.test.ts`
Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
cd /home/ubuntu/panmira
git add src/services/pipeline-engine.ts src/services/__tests__/pipeline-engine.test.ts
git commit -m "feat(pipeline): RAG context injection when agent has KB refs"
```

---

### Task 5: 工具调用 1 跳循环

**Files:**
- Modify: `src/services/pipeline-engine.ts`
- Modify: `src/services/__tests__/pipeline-engine.test.ts`

- [ ] **Step 1: 加失败测试 — tool_use 1 跳 + token 累加**

```typescript
describe('pipeline-engine › tool use 1-hop', () => {
  it('第一次 callLlm 返 tool_use → executeTool → 第二次 callLlm 收 tool_result', async () => {
    const { db } = await import('../../db/index.js');
    const fakeAgent = { id: 'a-tool', name: 'T', systemPrompt: 's', tools: [{ name: 'kb_search' }] };
    (db.select as any).mockReturnValue({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([fakeAgent]) }) }),
    });
    const { callLlm } = await import('../llm-client.js');
    (callLlm as any)
      .mockResolvedValueOnce({
        text: '', toolUses: [{ id: 't1', name: 'kb_search', input: { q: 'X' } }],
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        model: 'm', provider: 'p', durationMs: 100,
      })
      .mockResolvedValueOnce({
        text: 'Final answer', toolUses: [],
        usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 },
        model: 'm', provider: 'p', durationMs: 100,
      });
    const { executeTool } = await import('../tool-executor.js');
    (executeTool as any).mockResolvedValue({ output: 'tool-result' });

    const pipeline = {
      id: 'p', name: 't',
      nodes: [{ id: 'n', label: 'T', agentTemplateId: 'a-tool' }],
      edges: [],
    };
    const result = await executePipeline(
      pipeline, 'r', { triggeredBy: 'user' as const }, async () => {}, false,
    );
    expect(executeTool).toHaveBeenCalledWith('kb_search', { q: 'X' }, expect.any(Object));
    expect((result.nodeStates.n.output as any).text).toBe('Final answer');
    expect(result.nodeStates.n.tokensUsed).toBe(45); // 15 + 30
    expect(callLlm).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: 跑测试 — 失败**

Run: `npx vitest run src/services/__tests__/pipeline-engine.test.ts`
Expected: 1 new test fails (tool use path not implemented)

- [ ] **Step 3: 改 invokeRealAgent 加 tool_use 1 跳**

替换 `invokeRealAgent` 末尾的 `callLlm` + return 段:

```typescript
  // 构造 tools(从 agent.tools jsonb 强转)
  const tools: LlmTool[] | undefined = Array.isArray(agent.tools) && (agent.tools as unknown[]).length > 0
    ? (agent.tools as LlmTool[])
    : undefined;

  // 调 LLM
  let result = await callLlm({
    system: systemPrompt,
    messages,
    tools,
    maxTokens: 1024,
  });

  // tool_use 1 跳循环(同 agent-run-routes:88-117)
  if (tools && result.toolUses.length > 0) {
    const toolCall = result.toolUses[0]!;
    let toolResult: { output: unknown; error?: string };
    try {
      toolResult = await executeTool(toolCall.name, toolCall.input, { agentId: agent.id });
    } catch (e) {
      throw new Error(`tool ${toolCall.name} failed: ${(e as Error).message}`);
    }
    messages.push({ role: 'assistant', content: result.text || '' });
    messages.push({ role: 'user', content: `Tool ${toolCall.name} result: ${JSON.stringify(toolResult.output).slice(0, 2000)}` });
    const follow = await callLlm({
      system: systemPrompt,
      messages,
      tools,
      maxTokens: 1024,
    });
    result = {
      ...result,
      text: follow.text,
      usage: {
        inputTokens: result.usage.inputTokens + follow.usage.inputTokens,
        outputTokens: result.usage.outputTokens + follow.usage.outputTokens,
        totalTokens: result.usage.totalTokens + follow.usage.totalTokens,
      },
      durationMs: result.durationMs + follow.durationMs,
    };
  }

  // 记 token 用量
  if (result.usage.totalTokens > 0) {
    recordTokenUsage('system', `pipeline:agent:${agent.id}`, result.usage.totalTokens);
  }

  return {
    output: {
      text: result.text,
      agentId: agent.id,
      model: result.model,
      provider: result.provider,
      toolCalls: result.toolUses,
    },
    tokensUsed: result.usage.totalTokens,
  };
}
```

- [ ] **Step 4: 跑测试 — 全过**

Run: `npx vitest run src/services/__tests__/pipeline-engine.test.ts`
Expected: 6 passed

- [ ] **Step 5: Commit**

```bash
cd /home/ubuntu/panmira
git add src/services/pipeline-engine.ts src/services/__tests__/pipeline-engine.test.ts
git commit -m "feat(pipeline): tool use 1-hop loop with token accumulation"
```

---

### Task 6: 下游节点接收上游 output + stringify 集成

**Files:**
- Modify: `src/services/pipeline-engine.ts`(executePipeline 内部 input 传递,现 200-212 行)
- Modify: `src/services/__tests__/pipeline-engine.test.ts`

- [ ] **Step 1: 加失败测试 — n1.output 序列化为 n2 输入**

```typescript
describe('pipeline-engine › inter-node data flow', () => {
  it('节点 B 收到节点 A 的 output 序列化结果', async () => {
    const { db } = await import('../../db/index.js');
    let n = 0;
    (db.select as any).mockImplementation(() => ({
      from: () => ({
        where: () => ({
          limit: () => {
            n++;
            return Promise.resolve(n % 2 === 1
              ? [{ id: 'aA', name: 'A', systemPrompt: 'A', tools: [] }]
              : [{ id: 'aB', name: 'B', systemPrompt: 'B', tools: [] }]);
          },
        }),
      }),
    }));
    const { callLlm } = await import('../llm-client.js');
    (callLlm as any)
      .mockResolvedValueOnce({
        text: 'A-said-hello', toolUses: [],
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        model: 'm', provider: 'p', durationMs: 1,
      })
      .mockResolvedValueOnce({
        text: 'B-said-back', toolUses: [],
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        model: 'm', provider: 'p', durationMs: 1,
      });

    const pipeline = {
      id: 'p', name: 't',
      nodes: [
        { id: 'n1', label: 'A', agentTemplateId: 'aA' },
        { id: 'n2', label: 'B', agentTemplateId: 'aB' },
      ],
      edges: [{ from: 'n1', to: 'n2' }],
    };
    const result = await executePipeline(
      pipeline, 'r', { triggeredBy: 'user' as const, initialInput: { topic: 'X' } },
      async () => {}, false,
    );
    expect(result.status).toBe('completed');
    // 第二次 callLlm 的 messages[0].content 应包含 n1 的 output
    const secondCall = (callLlm as any).mock.calls[1][0];
    expect(secondCall.messages[0].content).toContain('A-said-hello');
  });

  it('input 超长 → 截断带 notice', async () => {
    const { stringifyInput } = await import('../pipeline-engine.js');
    const big = { data: 'x'.repeat(9000) };
    const out = stringifyInput(big);
    expect(out.length).toBeLessThanOrEqual(8200);
    expect(out).toContain('truncated');
  });
});
```

- [ ] **Step 2: 跑测试 — 第一次跑应失败(stringifyInput 未 export,或 A→B 序列化未做)**

Run: `npx vitest run src/services/__tests__/pipeline-engine.test.ts`
Expected: new tests fail

- [ ] **Step 3: 修 — export `stringifyInput` + verify executePipeline 上下游传递**

改 `pipeline-engine.ts`:
- `function stringifyInput` 前加 `export`(已 export via `export async function invokeRealAgent` 区域,直接 export function)

```typescript
export function stringifyInput(input: unknown): string {
  // ... 已有实现
}
```

检查 `executePipeline` 现 200-212 行的 input 拼接逻辑(已经做了 outputKey 映射,应该 OK)。如果 secondCall 失败,需要把前任的 `output` 序列化给下任:

```typescript
// 在 executePipeline 内的循环中(line 200-212 附近)
if (preds.length > 0) {
  const composed: Record<string, unknown> = { ...(node.inputTemplate ?? {}) };
  for (const predId of preds) {
    const predOutput = states[predId]?.output;
    const outputKey = pipeline.nodes.find(n => n.id === predId)?.outputKey ?? predId;
    composed[outputKey] = predOutput;  // ← 这里保留对象
  }
  currentInput = composed;
}
```

注:`stringifyInput` 是在 `invokeRealAgent` 内部对 input 调的,所以前任 output 是对象传给下任,下任 invokeRealAgent 内 stringifyInput 再序列化。**无需改 executePipeline 的传递逻辑**。只需 export stringifyInput 让测试能直接调。

- [ ] **Step 4: 跑测试 — 全过**

Run: `npx vitest run src/services/__tests__/pipeline-engine.test.ts`
Expected: 8 passed (1 placeholder 删除后)

- [ ] **Step 5: 跑完整测试集,确认没破坏其他**

Run: `npx vitest run`
Expected: 现有所有测试 + 新增 8 个 全过

- [ ] **Step 6: Commit**

```bash
cd /home/ubuntu/panmira
git add src/services/pipeline-engine.ts src/services/__tests__/pipeline-engine.test.ts
git commit -m "feat(pipeline): export stringifyInput + verify A->B output flow"
```

---

### Task 7: build + 部署 + E2E 验证

**Files:** none(纯命令)

- [ ] **Step 1: build(确认 tsc 通过)**

```bash
cd /home/ubuntu/panmira
npm run build 2>&1 | tail -30
```

Expected: `tsc -p tsconfig.build.json` 0 错误,`vite build` 成功,`copy-web-staging` 成功。若有 tsc 错误,**停下来修**,不要硬撑。

- [ ] **Step 2: pm2 reload**

```bash
pm2 reload panmira
sleep 3
pm2 list | grep panmira
```

Expected: panmira 状态 `online`,uptime 重置

- [ ] **Step 3: 验证 pipeline trigger 端点活着(curl health)**

```bash
curl -sS "https://deepx.fun/api/v2/health" 2>&1 | head -5
# 或
curl -sS "http://localhost:9100/health" 2>&1 | head -5
```

Expected: HTTP 200 含 `{"status":"ok"}` 或类似

- [ ] **Step 4: E2E 真实 LLM 跑 1 个 pipeline(2 节点)**

```bash
# 通过 SQL 插 1 个 pipeline + 2 个节点
psql $DATABASE_URL <<'SQL'
INSERT INTO agent_pipelines (id, name, nodes, edges, created_at)
VALUES (
  'e2e-test-pipeline',
  'e2e real llm test',
  '[{"id":"n1","label":"选题","agentTemplateId":"<existing-agent-id>"},
    {"id":"n2","label":"写稿","agentTemplateId":"<existing-agent-id>"}]'::jsonb,
  '[{"from":"n1","to":"n2"}]'::jsonb,
  now()
) ON CONFLICT (id) DO NOTHING;
SQL
# 把 <existing-agent-id> 替换为 agents 表里实际存在的 id

# Trigger(用真 LLM)
curl -sS -X POST "https://deepx.fun/api/v2/pipelines/e2e-test-pipeline/trigger" \
  -H "Content-Type: application/json" \
  -d '{"triggeredBy":"user","initialInput":{"topic":"AI Agent"}}' \
  2>&1 | tee /tmp/e2e-trigger.json
```

Expected: 返回含 `runId`,`status: "completed"`(或 running,等 30-60s)

- [ ] **Step 5: 查 run 详情,确认 token 真实**

```bash
RUN_ID=$(jq -r '.runId' /tmp/e2e-trigger.json)
curl -sS "https://deepx.fun/api/v2/pipelines/e2e-test-pipeline/runs/$RUN_ID" | jq '.nodeStates | to_entries[] | {node: .key, status: .value.status, tokensUsed: .value.tokensUsed, outputText: (.value.output.text // null)}'
```

Expected:
- n1.status = "success", tokensUsed > 0
- n2.status = "success", tokensUsed > 0
- outputText 非 "[MOCK" 开头(是真实 LLM 输出)

- [ ] **Step 6: 若失败 — 用 mock 模式先排错**

如果 tokenUsed = 0 或 status = failed,加 useMockLlm: true 排错:

```bash
# 找 pipeline-routes.ts 里的 trigger endpoint,看是否支持 body 解析
# 若不支持,临时在 trigger handler 加 body.useMockLlm 透传(小改动,仅排错用)
# 若支持,直接:
curl -sS -X POST "https://deepx.fun/api/v2/pipelines/e2e-test-pipeline/trigger" \
  -H "Content-Type: application/json" \
  -d '{"triggeredBy":"user","initialInput":{},"useMockLlm":true}'
```

注:`useMockLlm` 通过 API 暴露非本设计范围,排错**只用于 E2E 失败时**,完成后 revert。

- [ ] **Step 7: Commit (E2E evidence 文件可选)**

```bash
cd /home/ubuntu/panmira
# 若有 SQL 改动,提交
git status
# 若有排错小改(临时 mock 透传),确认已 revert
git diff src/api/routes/pipeline-routes.ts  # 应为空
```

---

### Task 8: 写 handoff + 最终 commit + push

**Files:**
- Create: `.claude/handoff-2026-07-07-pipeline-real-llm.md`

- [ ] **Step 1: 写 handoff**

```markdown
# Pipeline Real LLM · Handoff (2026-07-07)

## 任务
替换 pipeline-engine.ts mock invokeAgent → 真实 LLM 调用(完整单 Agent 模式)

## 已完成
- 7 个测试全过(1 mock + 2 基础 + 2 RAG + 1 tool_use + 2 上下游)
- build 0 错误
- pm2 reload panmira 成功
- E2E 真实 LLM pipeline 跑通(token > 0,非 mock 输出)

## 关键决策
- 集成层级:Option C 完整单 Agent(同 agent-run-routes 模式)
- 不改 DB schema(total 从 node_states 算)
- 工具调用单跳
- useMockLlm 仅测试/E2E 排错,API 不暴露

## 主仓库路径
- 分支:feat/pipeline-real-llm
- 改了:src/services/pipeline-engine.ts + tests/pipeline-engine.test.ts

## 部署
- npm run build
- pm2 reload panmira
- 前端不用动

## 下次开会
- 在 main 上:git merge feat/pipeline-real-llm --no-ff
- 删除分支:git branch -d feat/pipeline-real-llm

## 不在范围(下次)
- Bot 触发 Pipeline
- Cron 真跑
- react-flow DAG 画布
- 多跳 tool_use / 并行 / 分支
- 异步执行 + 进度推送
- KB RAG 缓存复用
```

写到 `/home/ubuntu/panmira/.claude/handoff-2026-07-07-pipeline-real-llm.md`

- [ ] **Step 2: 最终 commit + push**

```bash
cd /home/ubuntu/panmira
git add .claude/handoff-2026-07-07-pipeline-real-llm.md
git commit -m "docs(handoff): pipeline real LLM - session handoff"
git log --oneline -8
git push -u origin feat/pipeline-real-llm 2>&1 | tail -10
```

Expected: push 成功,远端 `feat/pipeline-real-llm` 分支 HEAD = 你的最终 commit

---

## Self-Review Checklist(实施前)

- [x] Spec coverage:design.md 8 个章节全部覆盖(目标/范围/设计/测试/部署/范围外/风险/时间)
- [x] No placeholders:所有代码块完整,可直接复制
- [x] Type consistency:`InvokeContext` / `useMockLlm` / `stringifyInput` 命名一致
- [x] File paths:全部 absolute,基于 `/home/ubuntu/panmira`
- [x] Mock pattern:vi.mock 路径正确(`../../db/index.js` 等,跟 llm-client.test.ts 一致)
- [x] DB 不改:无 migration
- [x] 范围锁:不动 pipeline-routes / frontend / 其他 engines
