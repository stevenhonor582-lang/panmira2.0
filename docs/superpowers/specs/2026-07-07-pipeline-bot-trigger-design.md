# Pipeline Bot Trigger · Design

> 2026-07-07 · 分支 feat/pipeline-bot-trigger
> 让飞书 bot 收到消息时,如果该 bot 关联 agent_template_id 且有匹配 pipeline,自动触发。

## 1. 目标

飞书 bot 收到用户消息 → 自动查找以该 bot 的 agent_template_id 为起点的 pipeline → 跑 → 把最后节点 output 发回用户。无需人工到 web UI 触发。

## 2. 范围(Scope Lock)

**只动 2 个文件 + 1 测试 + 1 文档**:
- 新建 `src/services/pipeline-bot-trigger.ts`
- 修改 `src/feishu/feishu-bot-starter.ts` (在 dispatcher 加 hook)
- 新建 `src/services/__tests__/pipeline-bot-trigger.test.ts`
- `.claude/handoff-2026-07-07-pipeline-bot-trigger.md`

**不动**:
- `src/bridge/message-bridge.ts`(原 bot 流程,作为 fallback)
- 任何 `src/engines/*` / `src/api/routes/*` / `src/telegram/*` / `src/wechat/*` (本期只支持飞书)
- DB schema
- 任何 web-next

## 3. 设计

### 3.1 触发流程

```
飞书消息进入
  ↓
[NEW] pipeline-bot-trigger.check(agentTemplateId, message)
  ↓
  ├─ 无 agentTemplateId → 返 null,fallback 到 bridge.handleMessage
  ├─ 无匹配 pipeline → 返 null,fallback
  └─ 找到 pipeline → 跑 executePipeline → 返最后节点 output
        ↓
       把 text 发回用户
        ↓
  ↓ 失败 → fallback 到 bridge (用户不会没响应)
```

### 3.2 缓存

- 启动时一次性查 DB,缓存 `agentTemplateId → Pipeline[]`
- 不在每次消息都查(避免 N+1)
- 提供 `invalidateCache()` 方法备用

### 3.3 多 pipeline 处理

- 简化:匹配多个 pipeline 时,**只跑第一个**(按 name 排序)
- 标记为 "v0 简化" — 后续可改成"按 trigger 关键词路由"

### 3.4 错误处理

| 错误 | 行为 |
|---|---|
| 无 agentTemplateId | 返 null,fallback |
| 无 pipeline 匹配 | 返 null,fallback |
| Pipeline 跑失败 | 返 null,fallback(原 bridge 接) |
| Pipeline 跑超时 (>60s) | 取消 + fallback |
| LLM 调用失败 | 透传(由 pipeline-engine 内部 fail-fast) |

## 4. 接口

```typescript
// src/services/pipeline-bot-trigger.ts
export async function findPipelinesForAgent(
  agentTemplateId: string,
): Promise<Pipeline[]>;
// 查 DB,缓存;返所有 nodes 包含该 agent 的 pipeline

export async function triggerPipelineForBot(
  agentTemplateId: string,
  message: string,
  runIdHint: string,
): Promise<{ output: string; runId: string } | null>;
// 找第一个 pipeline → 跑 → 返最后节点 output.text
// 失败返 null
```

## 5. 测试

`src/services/__tests__/pipeline-bot-trigger.test.ts`:

1. 缓存:findPipelinesForAgent 命中 → 不再查 DB
2. 匹配:返回含该 agent 的 pipeline
3. 不匹配:空 agentTemplateId 返 []
4. 触发:triggerPipelineForBot 跑第一个 pipeline, 返 output
5. 失败:executePipeline 返 failed status → 返 null
6. Fallback:无 pipeline → 返 null

## 6. 部署

```bash
cd /home/ubuntu/panmira
npm run build
pm2 reload panmira
```

E2E:用飞书 bot 实际发消息(需要真实 bot 配置,本次 E2E 在 SQL 层验证 + 用 vitest 集成 mock 模拟消息路径)

## 7. 不在范围

- Telegram / 微信 bot 触发(下次)
- 多 pipeline 路由(简化:跑第一个)
- 缓存失效机制(startup-only 够用,DB 变更重启生效)

## 8. 时间
Code 1-2h + Test 0.5h + Deploy 0.5h = 半天
