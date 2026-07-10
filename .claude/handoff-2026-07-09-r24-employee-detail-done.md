# 会话交接 - 2026-07-09 R24 数字员工详情页全面优化

## 当前任务
R24: 数字员工详情页 7 tab 全面优化(用户深度反馈一次性修)

## 已完成

### 4 个 git commit
1. `733b6da` feat(web): 数字员工 tab 名改(基础信息/技能)+ 保存按钮统一
2. `a9b2411` fix(web): 人格 tab 查看/编辑样式统一 + 铁律改名
3. `610f6de` feat(web): 技能 tab 合并(删 capabilities)+ skill 描述 + 添加工作
4. `58a2f8c` fix(web): 记忆 tab 接真实 memories + 协作说明 + 任务绑定按钮

### 逐 tab 改动

| Tab | 改动 | 文件 |
|-----|------|------|
| tab-tabs | 基础→基础信息, 能力→技能 | tab-tabs.tsx |
| 基础信息 | 移除 2 处重复 EditBar,EditPane 统一保存(1 个按钮);字段名全中文 | tab-basics.tsx + edit-mode.tsx |
| 人格 | 系统提示词查看态 = mono pre 卡片(跟编辑同款);"五条铁律"→"铁律";字段名全中文 | tab-persona.tsx |
| 技能 | 删 capabilities ChipListEditor;skills 每个 chip 显示描述(SKILL_DESCRIPTIONS 18 条);添加按钮工作(PATCH agent.skills);系统默认提示 | tab-skills.tsx |
| 记忆 | 删 mock 样本;接真实 /api/v2/foundation/memory/l1\|l2\|l3?bot_id=agent.id;每层 3 条;没数据→暂无记忆 | tab-memory.tsx |
| 协作 | 顶部加协作关系图说明(内链外链/谁引用谁);移除 EditBar | tab-collab.tsx |
| 任务 | 删 mock pipelines;接真实 GET /api/v2/admin/pipelines;绑定/解绑按钮(PATCH nodes);不再跳 tasks | tab-tasks.tsx |
| 日志 | 不动 | — |

### edit-mode.tsx 核心改动
- EditPane 统一管理 编辑/保存/取消 按钮组(顶部右侧同一位置)
- 新增 `onSave?: (ctx) => Promise<void>` + `isDirty?: boolean` props
- 保存按钮根据 isDirty 启用/禁用(没改动灰,改了亮)
- 删除 EditBar 导出(全部 tab 内容不再放重复保存按钮)
- EditableTextarea 新增 `mono` prop(查看态可选 mono pre 卡片样式)
- agentToDraft 新增 owner_user_id 支持

## 验证

### Build
- `npx next build` ✓ 无错误

### Playwright
- q3-33pages.spec.ts: 34/34 passed ✓
- r13b-edit.spec.ts: 3/3 passed ✓ (更新了 test agent ID 为真实数据)
- r15a-employees.spec.ts: 4/6 passed (2 个失败是预存:L6 Test Agent 不在 DB)

### pm2
- web-next reload ✓ (PID 4125153, online, 119MB)

## 关键决策 / 约束
- capabilities 字段保留在 DB(不删字段),前端不再单独显示
- skills 描述用内置映射(SKILL_DESCRIPTIONS),没映射的显示原始 id
- ChipListEditor 添加通过 PATCH agent.skills/tools 工作(已验证)
- 记忆用真实数据(bot_id 精确匹配 agent.id)
- 任务绑定:通过 PATCH pipeline.nodes 加/删 bot 节点(node.agentTemplateId === agent.id)
- 全中文(除 skill 命名空间 id 如 superpowers:brainstorming)
- 后端完全不动(全部用现有 PATCH 端点)

## 重要文件 / 路径
- 前端组件: `apps/web-next/app/(app)/employees/[id]/_components/`
  - tab-tabs.tsx, edit-mode.tsx, tab-basics.tsx, tab-persona.tsx
  - tab-skills.tsx, tab-memory.tsx, tab-collab.tsx, tab-tasks.tsx
- 数据层: `apps/web-next/app/(app)/employees/_lib/data.ts`
- 后端(未动): `src/api/routes/employees-routes.ts` (PATCH 白名单已支持 skills/tools/owner_user_id)
- 后端(未动): `src/api/routes/pipeline-routes.ts` (PATCH 支持 nodes 更新)
- 后端(未动): `src/api/routes/r10-data-routes.ts` (GET /api/v2/foundation/memory/:layer 支持 bot_id 过滤)

## 待办
- 无 R24 遗留

## 用户偏好 / 风格
- 全中文 UI
- 保存按钮只有 1 个(不能重复)
- 不显示 mock 数据(没数据就显示"暂无")
- 操作不跳模块(能就地操作的就就地)
