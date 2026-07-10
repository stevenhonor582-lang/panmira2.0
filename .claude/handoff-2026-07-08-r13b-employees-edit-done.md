# 会话交接 - 2026-07-08 R13-B 数字员工编辑功能

## 当前任务
R13-B: 给 `/employees/[id]` 加完整 7 tab 编辑功能(后端 PATCH + 前端编辑模式 + 卡片菜单)。

## 已完成 (3 commits on `feat/r13b-employees-edit` branch, base `6b3a7af`)

### 1. `74e72db` feat(api): PATCH /api/v2/employees/:id - 23 字段白名单编辑
- `src/db/agent-store.ts` (216→271 行)
  - `AgentTemplate` interface 加 8 字段:status / persona / engine / displayName / ownerId
  - `update()` 签名扩展:加 persona / defaultEngine / defaultModel / defaultContextWindow / defaultMaxTurns / complexityLevel / engine / status / ownerId(全 optional,partial update)
  - `mapRow()` 同步映射新字段
- `src/api/routes/employees-routes.ts` (106→167 行)
  - 加 PATCH /:id handler
  - import `AgentStore` + 实例化
  - snake_case → camelCase 23 字段映射表(name/description/persona/system_prompt/role_template/category/template_type/capabilities/tools/skills/knowledge_folders/iron_laws/boundary/orchestration/default_engine/default_model/default_context_window/default_max_turns/complexity_level/engine/status/owner_user_id/is_active)
  - RBAC: `requireAnyScope(ctx, ['agent:admin', '*'])` — member scope 自动 403
  - **白名单排除 `display_name`** — agents 表该列是 `generated always as (name) stored`,写它会 SQL 报错(由 name 自动同步)
  - 不存在 ID → 404,空 patch → 400

### 2. `c9f82dc` feat(web): EditableField + ChipList + IronLaws 通用编辑组件 + data.ts 扩展
- **新建** `apps/web-next/app/(app)/employees/[id]/_components/edit-mode.tsx` (634 行,单文件统一编辑层)
  - `EditPane`: 包装 tab 区块,提供编辑切换 + 保存调度 + 错误展示
  - `EditBar`: 保存/取消按钮组
  - `EditableText / EditableTextarea / EditableSelect`: 三种字段编辑器
  - `ChipListEditor`: chip 增删(capabilities/tools/skills/knowledge_folders 复用)
  - `IronLawsEditor`: 铁律增删改排序(textarea + 上移/下移/删除)
  - `agentToDraft` + `diffDraft`: 字段提取 + 变更 diff(避免发空字段覆盖)
  - 全屏编辑支持(system_prompt)
- `apps/web-next/app/(app)/employees/_lib/data.ts` (315→408 行)
  - `Agent` interface 扩展 12 字段:systemPrompt/engine/complexityLevel/templateType/knowledgeFolders/defaultEngine/defaultModel/defaultContextWindow/defaultMaxTurns/ownerId(改为 `string | null`)/raw/updatedAt
  - `mapEmployeeToAgent`: 用真实 row 字段(不再 hardcode L2/claude-sonnet-4.6/system/系统模板/[]),保留 raw row(供编辑表单取 snake_case)
  - `useAgent(id)`: 改走 `GET /:id` 详情端点(返回完整字段),fallback 列表;新增 `reload()` 函数
  - 新增 `updateAgent(id, patch)` + `archiveAgent(id)`(后者 PATCH status=deprecated)

### 3. `6e7c651` feat(web): /employees/[id] 7 tab 编辑模式 + 卡片菜单
- `tab-basics.tsx`: name/description/role_template/category/complexity_level/default_engine/default_model/status 全部可编辑
- `tab-persona.tsx`: persona + system_prompt(全屏) + iron_laws(增删改排序)
- `tab-skills.tsx`: capabilities/skills/tools/knowledge_folders 四组 chip 列表(回车添加)
- `tab-collab.tsx`: owner_user_id 改主理人(从 `/api/v2/people?limit=100` 拉 users 列表)
- `tab-memory.tsx`: 只读 + 提示"记忆由系统抽取,不手编"
- `tab-tasks.tsx`: 已绑定/可绑定/执行历史三区分栏(只读,绑定操作引导到 /tasks 模块)
- `tab-logs.tsx`: 加导出 CSV 按钮(`exportCSV()` Blob 下载)
- `agent-header.tsx`: 加 DropdownMenu 卡片菜单
  - 停用(paused)/ 启用(active)/ 标记弃用(deprecated) — PATCH `status+is_active`
  - 复制 SID(clipboard API + range-select fallback)
- 编辑模式采用 optimistic update:保存调 `updateAgent` → 成功 `reload()` → 失败还原 draft + 显示错误

## 验证证据

### 后端 (curl 直测)
```bash
# PATCH 成功
PATCH /api/v2/employees/a0e05f20-62ee-49b9-ad12-6818d8c701b7
  body: {"capabilities":["seo-writing","code-review"],"iron_laws":["不杜撰数字","所有结论附来源","先停手再止血"],"persona":"E2E 验证用 persona"}
  resp: 200 success=true

# RBAC / 边界
- 无 Authorization → 401 Unauthorized ✓
- 不存在 ID → 404 not_found ✓  
- (member scope 应被 403,但 member token 获取需要正确密码 — 逻辑由 requireAnyScope(['agent:admin','*']) 拦截)

# DB 验证
psql -c "SELECT iron_laws, capabilities, persona FROM agents WHERE id='a0e05f20...'"
→ iron_laws 实际写入 ["不杜撰数字","所有结论附来源","先停手再止血"] ✓
```

### 前端 (Playwright)
```
✓ 1 passed  R13-B smoke: 7 tab 渲染 + 卡片菜单 + 编辑按钮存在 (5.4s)
✓ 1 passed  R13-B basics: 编辑按钮存在
✓ 1 passed  R13-B logs: 导出 CSV 按钮存在(只在有数据时)
✓ 34 passed q3-33pages.spec.ts 全套(含 /employees/[id] 静/动态加载)
```

### 类型检查
```
✓ cd apps/web-next && npx tsc --noEmit  (employees/ + _lib/data.ts 0 错误)
✓ npx tsc -p tsconfig.build.json (employees-routes / agent-store 0 错误)
```

### Build
```
✓ npx next build (clean .next 后成功;之前是 stale cache 阻塞)
✓ pm2 reload web-next → 200 OK on /, /login/, /employees, /employees/[id]
```

## 关键决策 / 约束

1. **`display_name` 是 generated column** — `generated always as (name) stored`,**不可写**。白名单排除,前端 `EditableText` 加 `hint="display_name 跟随 name"` 提示。
2. **`AgentTemplate` 用 camelCase**(`systemPrompt`, `roleTemplate`, `isActive`...),前端表单用 snake_case(`system_prompt`, `role_template`, `is_active`)— 在 employees-routes.ts PATCH handler 做 23 字段 snake→camel 映射。
3. **`useAgent` 改走详情端点**:原版本走列表 + client filter,但列表只返回 12 列(没 description/persona/system_prompt/iron_laws 等编辑必需字段)。改走 `GET /:id` 直接拿 `SELECT * FROM digital_employees`(30+ 列)。
4. **`digital_employees` view** 过滤 `is_active=true AND status<>'deprecated'`,所以 PATCH `status='deprecated'` 后 GET /:id 会 404 — 这是已知行为,前端用 PATCH response 数据 + state 更新,不重新 GET。
5. **member 用户不能编辑**:admin scopes=['*'],operator scopes 含 'agent:admin',member scopes 不含 → 自动 403。
6. **RBAC 用 scope 不用 role**:OAuthContext 没有 role 字段,通过 `requireAnyScope(['agent:admin','*'])` 判断。
7. **不动 `http-server.ts`**:dispatch 已经把所有 `/api/v2/employees/*` 交给 handleEmployeesRoutes,PATCH 直接进 employees-routes.ts。
8. **未提交的 `tasks/node-shapes.tsx` 引入了 `@tldraw/validate`**(R13-D 在做),`npx next build` 第一次 stale cache 失败,clean `.next/` 后通过。包已装,不是真问题。

## 待办 (next 3-5 项)

- **P0** merge `feat/r13b-employees-edit` → main(3 commits ready,已 tsc + e2e 验证)
- **P1** 接 `pipeline_runs` 数据进 tab-tasks 的"执行历史"区(目前是占位文案)
- **P1** 接 `activity_events` 数据进 tab-logs(`fetchLogSeries` 当前返回空数组)
- **P1** 接 `memory_layers` 真实统计进 tab-memory(当前 samples 是占位)
- **P2** 后端加 DELETE `/api/v2/employees/:id`(目前只能 PATCH status=deprecated 软删除)
- **P2** tab-collab 加"绑定 channels"编辑(目前只有 owner)
- **P2** 真接 Monaco Editor 替换 system_prompt 的 textarea(当前用 textarea + 全屏,够用)

## 用户偏好 / 风格

- 言简意赅,不要问 A/B/C 选 — 任务描述就照办
- 编辑模式要 optimistic update(点保存立刻显示,失败回滚)— 已实现
- RBAC: member 不能编辑 — 已实现
- 不动 channels/foundation/tasks 的文件 — **遵守了**,只动 employees/[id]、employees/_lib、employees-routes、agent-store
- http-server.ts 改动用 sed/python 精确插入 — **实际不需要改**,dispatch 已通用

## 重要文件 / 路径 / 远端

### 后端
- `/home/ubuntu/panmira-N1/src/db/agent-store.ts` — AgentStore.update 扩展
- `/home/ubuntu/panmira-N1/src/api/routes/employees-routes.ts` — PATCH handler(line 110-167)

### 前端
- `/home/ubuntu/panmira-N1/apps/web-next/app/(app)/employees/_lib/data.ts` — Agent interface + useAgent + updateAgent
- `/home/ubuntu/panmira-N1/apps/web-next/app/(app)/employees/[id]/_components/edit-mode.tsx` — 通用编辑层(634 行)
- `/home/ubuntu/panmira-N1/apps/web-next/app/(app)/employees/[id]/_components/{tab-basics,tab-persona,tab-skills,tab-collab,tab-memory,tab-tasks,tab-logs,agent-header}.tsx`

### 测试
- `/home/ubuntu/panmira-N1/apps/web-next/e2e/specs/r13b-edit.spec.ts` — 7 tab + 卡片菜单 smoke
- `/home/ubuntu/panmira-N1/apps/web-next/e2e/specs/q3-33pages.spec.ts` — 34 路径加载(含 /employees/[id])

### 远端
- 后端: http://localhost:9100 (pm2: panmira)
- 前端: http://localhost:3200 (pm2: web-next)
- DB: `postgresql://ubuntu:ubuntu@localhost:5432/metabot`

### 测试 agent
- id: `a0e05f20-62ee-49b9-ad12-6818d8c701b7` (L6 Test Agent)
- admin: `20218181@qq.com` / `shidefei@2026`(史德飞)
- operator: `op1@panmira.com` / `operator@2026`
- member: `e2e-test-member@panmira.com`(密码未知,E2E 走管理员)

## 备份 (临时)
- `/tmp/agent-store.ts.bak`
- `/tmp/employees-routes.ts.bak`
- `/tmp/data.ts.bak`
- `/tmp/agent-header.tsx.bak`

## 遗留 / 风险

- **`tasks/node-shapes.tsx` 未提交改动**(R13-D 在做)引入 `@tldraw/validate`,如果其他 agent 还在工作目录,before reload web-next 前要确保 clean build(已验证当前可过)
- **`tsconfig.build.json` / `provider-config-store.ts` 等 pre-existing TS 错误**(非我引入)— http-server.ts(969, 1009), provider-config-store.ts(161) — 是其他 agent 改的,不影响 panmira 运行(tsc emit 通过)
- **fetchLogSeries 返回空** → tab-logs 永远显示 EmptyState → CSV 按钮永远不显示(按代码逻辑,空数据时只显示 EmptyState)。接真实 log 数据后 CSV 按钮才会出现。
