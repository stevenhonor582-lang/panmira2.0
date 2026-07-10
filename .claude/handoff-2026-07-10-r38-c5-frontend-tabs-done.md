# R38-C5 前端 tab 改造完成 · 2026-07-10

## 当前任务
R38 Agent-Centric 迁移 spec 阶段 4.1-4.5:把 tab-basics / tab-memory / tab-skills / step-7
从 bot-centric 切到 agent-centric,带 modelId FK 写入和 UI 立即刷新。

## Commit
- `5bd92db` feat(web-next): R38-C5 tab-basics/memory/skills 切到 Agent 中心 + modelId 写入 + invalidate

## 修改文件清单(6 个)
- `apps/web-next/app/(app)/employees/_lib/data.ts` — useAgent hook 暴露 setAgent(4.1)
- `apps/web-next/app/(app)/employees/[id]/_components/tab-basics.tsx` — ModelBindingCard + ContextWindowCard 接 setAgent(4.1);ModelBindingCard save 加 modelId(4.4)
- `apps/web-next/app/(app)/employees/[id]/_components/tab-memory.tsx` — 跳链 ?agentId=&botId= 双向(4.2)
- `apps/web-next/app/(app)/employees/[id]/_components/tab-skills.tsx` — skills endpoint 标注 TODO(4.3,后端 /api/v2/admin/agents/:id/skills 未建)
- `apps/web-next/app/(app)/employees/new/_components/step-7.tsx` — 提交前 modelId 校验 + 红色 banner(4.5)
- `apps/web-next/e2e/specs/r38-tab-basics-model-binding.spec.ts` — 新建 3 个 playwright e2e 用例

## e2e 结果
```
✓ tab-basics 加载 + 专属大模型卡片可见 (1.9s)
✓ 切换不同 model → PATCH body 含 modelId + default_model 联动 (6.2s)
✓ tab-memory 跳链 URL 含 agentId 参数 (2.4s)
3 passed (11.3s)
```

## 实施细节

### 4.1 useAgent 扩展 setAgent
原来 useAgent 只暴露 agent/loading/reload。改:
```ts
return { agent, loading, reload: () => setNonce((n) => n + 1), setAgent };
```
ModelBindingCard 和 ContextWindowCard 的 save() 用 updateAgent 返回的新 Agent 直接 setAgent,
无需等 reload 完成,UI 立即刷新。

### 4.2 tab-memory 跳链
`/foundation/memory/l1?agentId=${id}&botId=${id}` — agentId 优先(对接 R38-C4 memory-routes.ts
新增的 agentId 入参),botId 兼容(当前 foundation/memory 页只读 botId,等后续升级)。

### 4.3 tab-skills endpoint
当前 /api/skills 已 agent-agnostic,无需按 bot/agent 过滤。R38 spec 推荐的
`/api/v2/admin/agents/:id/skills` 后端未建,加 TODO 注释。后端上线后切换。

### 4.4 ModelBindingCard PATCH body modelId
```ts
const patch = buildModelBindingPatch({...});
if (selectedProvider && selectedProvider.id !== currentBinding?.id) {
  (patch as Record<string, unknown>).modelId = selectedProvider.id;
}
```
后端 C3 阶段(已部分达成)会把 modelId 联级写 agents.model_id FK。

### 4.5 step-7 modelId 校验
useEffect 拉 /api/providers,publish 前检查 form.providerId 是否在列表里。
校验失败 → 红色 banner + 发布按钮 disabled + setPhase("error")。
publish 按钮加 data-testid="step7-publish-btn"。

## 验证清单

- [x] tsc --noEmit 在 touched 文件无新错误(data.ts temperature dup / channels/oauth 等是历史 TS 错)
- [x] next build 成功(rm -rf .next + npm run build)
- [x] pm2 reload web-next 成功(PID 269076)
- [x] playwright e2e 3/3 通过
- [x] 没改后端
- [x] 没碰 templates / people 页面(C6 范围)
- [x] 没回退 R36/R37/C1-C4 任何 commit

## 待办(后续 agent)

- C6: (app)/employees/templates/_components + overview/people 页面的 agent 列表展示
- 后端补 /api/v2/admin/agents/:id/skills(tab-skills 切过去)
- 后端补 PATCH /api/v2/employees/:id 接 modelId 字段写 agents.model_id(联级 + cache invalidate)
- 阶段 5 一致性 SQL:bot_configs.agent_id NOT NULL 全填 + 墨言 defaultModel/model_id 修一致

## 重要文件路径

- Spec: `/home/ubuntu/panmira-N1/.claude/R38-MIGRATION-SPEC.md`
- Commit: `5bd92db` on `r36-tab-basics-fixes`
- e2e: `apps/web-next/e2e/specs/r38-tab-basics-model-binding.spec.ts`
- 测试 agent: `1634063d-5862-4230-93d3-1aa166ba0a1c` (玄鉴)
