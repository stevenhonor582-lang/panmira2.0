# 会话交接 - 2026-07-09 R17-4 任务画布修复

## 当前任务
修任务画布一直加载中的核心 bug,顺手把节点 IO 契约 / 真人节点中断 UX 补齐。

## 已完成

### 4 个 commit (在 r17-5-kb-mcp 分支)
- `8f771f5` fix(web): 画布加载修复 — TldrawLazy useRef→useState **[核心 bug]**
- `b510226` feat(web): 节点输入输出契约 + Human 节点审批 UI
- `7ccde35` fix(web): recharts width(-1) height(-1) 警告
- `3b084ac` test(e2e): R17-4 画布 smoke

### 核心 bug 根因(已修)
`apps/web-next/components/tasks/task-dag-editor.tsx` 的 `TldrawLazy`:
```tsx
// 旧(bug):
const TldrawMod = React.useRef<...>(null);
const [err, setErr] = React.useState<string | null>(null);
React.useEffect(() => {
  import("tldraw").then((m) => {
    TldrawMod.current = m.Tldraw;   // 设置 ref
    setErr(null);                    // ← no-op! err 已经是 null
  });
}, []);
// → 永不重渲染 → Loader 永转

// 新(修):
const [Comp, setComp] = React.useState<TldrawCmp | null>(null);
React.useEffect(() => {
  let mounted = true;
  import("tldraw").then((m) => { if (mounted) setComp(() => m.Tldraw); });
  return () => { mounted = false; };
}, []);
```

### 验证证据
- `next build`: 通过(只有 turbopack root 的旧 warning)
- Playwright `r17-4-canvas-smoke.spec.ts`: 1 passed (3.5s)
  - 登录 → /tasks/new
  - "画布加载中" 文案 8s 内消失
  - `.tl-container` 可见
  - 点 Bot 节点 → `data-kind=bot` shape 出现
  - 无 tldraw fatal error (license 警告除外)
- Playwright `q3-33pages.spec.ts`: 34 passed (1.1m) — 无回归
- pm2 reload web-next 已执行,server 在 :3200

## 待办(下一轮,需要后端配合)

### Human 节点真正暂停 — 🔴 需要后端
当前 `HumanApprovalCard` 只在画布层验证 UX,后端还没接通。
真暂停需要:

1. **schema**(`src/db/schema.ts`)
   - `pipelineRuns.node_states` 现有 status 枚举:
     `pending | running | success | failed | skipped`
   - 加 `waiting_for_human`(和对应的 UI 状态)
   - 或新建 `pipeline_node_approvals` 表:
     `nodeId, runId, decision(approved/rejected/modified), actor, note, modifiedInput, createdAt`

2. **engine**(`src/services/pipeline-engine.ts`)
   - 当前 `PipelineNode` 没有 `kind` 字段 — 只有 `agentTemplateId`。
     前端 tldraw DAG (6 个 kind) 和后端 node (单 agentTemplateId) 是两套抽象,
     没桥接。
   - 加 `node.kind: 'bot' | 'human' | 'skill' | 'tool' | 'conditional' | 'parallel'`,
     在 `executePipeline` 拓扑循环里:
     ```ts
     if (node.kind === 'human') {
       states[node.id] = { status: 'waiting_for_human', ... };
       await onNodeUpdate(node.id, states[node.id]);
       // 阻塞等:
       const decision = await waitForApproval(runId, node.id);
       if (decision === 'rejected') { failed = true; break; }
       if (decision === 'modified') { nodeInput.set(node.id, modifiedInput); }
     }
     ```
   - `waitForApproval` 可以用 BullMQ / Postgres LISTEN/NOTIFY / in-memory EventEmitter

3. **API**(`src/api/routes/pipeline-routes.ts`)
   - 新加 `POST /api/v2/admin/pipelines/:pid/runs/:runId/nodes/:nodeId/decide`
   - body: `{ decision: 'approved'|'rejected'|'modified', note?, modifiedInput? }`
   - 写 approvals 表,唤醒 engine 的 `waitForApproval`

4. **WS**(`src/api/pipeline-events.ts`)
   - `broadcastPipelineProgress` 加 `node_status=waiting_for_human` 事件
   - 前端 `/tasks/[id]` 监听 → 自动弹审批面板

5. **前端**(`apps/web-next/components/tasks/shape-config-panel.tsx`)
   - 当前 `HumanApprovalCard.decide()` 是 `setTimeout(250ms)` 假调用
   - 接到真 API 后改成 `api('/decide', { method:'POST', body:{...} })`
   - 状态来源改成 polling run detail / WS event,不再读 meta.approvalState

## 关键决策 / 约束
- **不动 sidebar / overview / employees / foundation / channels**(R17-1+ 范围)
- **不动后端 pipeline-engine**(本轮只动前端 + 类型;后端 human 暂停留下轮)
- **license 警告**(`No tldraw license key provided!`)是 console.warn,不阻塞渲染,
  真要消掉需要付费 license key(企业版),用户已认可"接受警告"方案
- **recharts width(-1)** 在共享 `chart.tsx` 修一次,所有 ChartContainer 调用方受益

## 用户偏好 / 风格
- 用户原话:"不要问。直接干。" → 直接动手,报告给结论
- 用户原话:"每个管道断点前后输入输出仔仔细细检查"
  → 加了 `NODE_KIND_CONTRACTS` 表 + `IOContractCard` 在面板显示
- 用户原话:"真人节点干这个" → HumanApprovalCard 先做出 UX,后端留下轮

## 重要文件 / 路径
- 修过的源码:
  - `apps/web-next/components/tasks/task-dag-editor.tsx` (TldrawLazy)
  - `apps/web-next/components/tasks/types.ts` (NODE_KIND_CONTRACTS, ApprovalState)
  - `apps/web-next/components/tasks/shape-config-panel.tsx` (IOContractCard, HumanApprovalCard)
  - `apps/web-next/components/ui/chart.tsx` (minWidth/minHeight)
- 新增 e2e: `apps/web-next/e2e/specs/r17-4-canvas-smoke.spec.ts`
- 后端要改的(下轮):
  - `src/services/pipeline-engine.ts` (PipelineNode.kind + waitForApproval)
  - `src/api/routes/pipeline-routes.ts` (POST /decide 端点)
  - `src/db/schema.ts` (approvals 表 / status 枚举)
  - `src/api/pipeline-events.ts` (waiting_for_human 事件)

## 远端状态
- pm2 进程 `web-next` (id 54) online,跑 :3200
- 分支 `r17-5-kb-mcp`,HEAD `3b084ac`
- main 在 `14e02ad`,本分支 4 commit 领先 main(本轮)+ 1 commit 前序(117c7e5)
