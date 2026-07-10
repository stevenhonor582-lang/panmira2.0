# 会话交接 - 2026-07-08 R14-BC 真人详情全可编辑

## 当前任务
修复"组织部 → 真人详情页(/overview/people/[id]) 7 tab 全只读"等系列 bug,让真人详情跟数字员工(/employees/[id]) 一样可编辑。

## 已完成

### 后端 (2 commits)
- `00eae86` fix(api): /api/auth/users/:id PATCH 扩展 name/email/avatarUrl
  - user-store.ts: +updateName +updateEmail +updateAvatarUrl
  - auth-routes.ts: PATCH 接收 name/email/avatarUrl(空值校验 + email 格式 + 409 conflict)
- `b6c5837` feat(api): /api/v2/people/:id/{stats,usage,agents} 端点
  - GET stats: todayDone/todayErrors/status/activity24h/weekTokens/weekPct
  - GET usage?days=30: 30 天 daily + byAgent + byTask
  - GET agents: 列出 owner_user_id = :id
  - PATCH agents: add/remove/set 三种 action

### 前端 (2 commits)
- `a5b874f` fix(web): person-card 修菜单遮挡 + 删查看按钮 + 重做有意义信息
  - 删卡片 overflow-hidden(菜单被裁 bug 修复)
  - 菜单 z-30 → z-50
  - 删"查看"按钮(用户原话"跟编辑重复,查看没意义")
  - 数据栏从无意义"24h调用"改成:
    · 今日完成(✓ 绿色) / 今日异常(⚠ 红色) / 当前状态(忙碌/空闲/离线)
  - 新增本周 token 进度条(weekPct%)
  - data.ts: Person 加 avatarUrl,patchPerson 支持 name/email/avatarUrl
  - data.ts: 新增 fetchPersonStats/fetchPersonUsage/fetchPersonAgents/patchPersonAgents
- `b292b8d` feat(web): /overview/people/[id] 7 tab 全可编辑 + 资源图表 + 协作说明
  - 新建 _components/person-edit-mode.tsx (250 行)— 仿 R13-B edit-mode
  - 新建 _components/person-tabs.tsx (814 行)— 7 个 Tab 子组件
  - 重写 page.tsx (459 → 215 行)

### 验证
- TypeScript: 后端 + 前端 0 错误
- Next build: 成功(33 页面全编译)
- PM2: panmira + web-next 在线(9100 / 3200)
- 端到端 curl:
  · PATCH /api/auth/users/{id} {department, position, name} → 200
  · GET /api/v2/people/{id}/stats → {todayDone, status, weekPct, ...}
  · GET /api/v2/people/{id}/usage?days=30 → {totalTokens, daily, byAgent, byTask}
  · GET /api/v2/people/{id}/agents → 数组
- Playwright: 33 页 e2e 33 passed / 1 flaky(logs 单跑通过)

## 7 Tab 详细修复对照

| Tab | 修复前 | 修复后 |
|-----|--------|--------|
| basic | 只读 | 7 字段全可编辑(name/email/phone/department/position/role/avatarUrl) |
| employees | 显示全部 agents(误) | 显示该 user 的 agents + 添加/移除按钮(调 PATCH agents) |
| tasks | 显示 createdBy===id | 同 + 区分"已绑定"说明 |
| decisions | 空状态文案 | 真实说明(approve/reject 工作流未上线) |
| collaborators | 显示 agents chip | 加说明 + 三类(数字员工/KB/模板)管理 + 能力概览 |
| resources | 空状态 | recharts BarChart + PieChart + Top 5 + KPI |
| activity | 空状态 | 24h timeline,按 user_id 过滤 activity_events |

## 待办

- [ ] 用户实际跑下来如果有数据(今日完成/异常/本周 token > 0),需要先种活动数据
- [ ] DecisionsTab 接 approve/reject 工作流(目前占位)
- [ ] CollaboratorsTab 的 KB 管理跳转到底座页(目前只是说明)
- [ ] ActivityTab 的过滤(按 agent / 类型 / 时间)
- [ ] 真人编辑保存后 UI 乐观更新(目前 reload fetch)
- [ ] member 角色 self-edit 边界测试(canManageUser RBAC 已有)

## 关键决策 / 约束
- 不动 /employees(R13-B 已做)
- 不动 billing/dashboard/diagnosis/logs/optimization/sidebar
- RBAC:admin 全权,operator 改 member,member 只改自己(canManageUser 已存在)
- recharts 已装,直接用
- 菜单用 absolute z-50(父删了 overflow-hidden 即可,无需 portal)
- 数据为 0 时显示 "—" 不是 0(✓ 已遵守)

## 重要文件 / 路径
- 后端:
  - `src/db/user-store.ts` (397 → 425 行)
  - `src/api/routes/auth-routes.ts` (756 → 798 行)
  - `src/api/routes/people-routes.ts` (137 → 361 行)
- 前端:
  - `apps/web-next/app/(app)/overview/_components/data.ts` (+R14-BC fetcher)
  - `apps/web-next/app/(app)/overview/_components/person-card.tsx` (重做)
  - `apps/web-next/app/(app)/overview/people/[id]/page.tsx` (459 → 215 行)
  - `apps/web-next/app/(app)/overview/people/[id]/_components/person-edit-mode.tsx` (新)
  - `apps/web-next/app/(app)/overview/people/[id]/_components/person-tabs.tsx` (新,814 行)

## 用户偏好 / 风格
- 言简意赅,不要问 A/B/C,直接做完给报告
- 视觉风格:状态板、边框、font-mono 数据、不动声色的色彩(oklch)

## Git
- 4 个 commit 已上 main,无 push(用户未要求)
- HEAD: `b292b8d feat(web): /overview/people/[id] 7 tab 全可编辑 + 资源图表 + 协作说明`
- 父 commit: 9b96e19 (R13-D)
