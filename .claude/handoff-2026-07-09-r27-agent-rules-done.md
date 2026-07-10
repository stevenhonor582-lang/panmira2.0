# 会话交接 - 2026-07-09 R27 Agent 新建与权限归属规则

## 当前任务
落地用户确认的 5 条 R27 Agent 新建与权限归属规则(命名/工作目录、bot 一对一、层级、归属人选择器、复制独立实例)。

## 已完成

### 规则 1:命名 + 工作目录 ✅
- DB migration `migrations/2026_07_09_r27_agent_rules.sql`: 部分唯一索引 `uq_agents_name_instance`(WHERE is_template=false),模板可同名、实例间不重名
- `src/db/agent-store.ts`:
  - `toPinyinInitials()` 中文→拼音首字母(不盈→by, 守静→sj, 墨言→my)
  - `generateWorkingDir()` = `/workspace/agents/<slug>-<6位随机>`
  - `create()` / `createInstanceFromTemplate()`:实例间重名检查(模板豁免)+ 未传 working_dir 自动生成
- 前端 `tab-collab.tsx`:工作目录字段加"只读"标记,UI 不可手改
- 前端 `step-1.tsx`:向导填名字时实时预览工作目录(`/workspace/agents/<拼音>-随机6位`),标记"只读 · 不可手改"

### 规则 2:渠道(bot 入口)一对一 ✅
- `src/db/agent-store.ts` `findBotBindingConflict()`:channel_ids jsonb 包含检查
- `update()`:绑定前逐个校验每个 bot,冲突抛 `code=bot_already_bound` + 中文消息"该入口已绑定 XXX,请先在该 agent 解绑"
- 路由层 409:`http-server.ts` PUT + `employees-routes.ts` PATCH
- 前端 `tab-collab.tsx`:复用 EditPane 错误展示(409 → "保存失败: 该入口已绑定 XXX...")

### 规则 3:真人→Agent 层级 ✅(架构已支持,确认不变)
- 一真人多 agent(owner_user_id)
- 一 agent 一主理人(owner_user_id 单值)
- 一 agent 多 bot 入口(channel_ids)

### 规则 4:归属人选择器 ✅
- 前端 `tab-collab.tsx`:主理人编辑态从 EditableSelect 下拉 → ResourcePicker(单选真人,items = 所有 active 员工)
- 前端 `person-tabs.tsx` EmployeesTab:复选框列表 → ResourcePicker,只显示未归属/已归属此真人的 agent
- 后端 `employees-routes.ts`:GET /api/v2/employees 新增 `filter=unassigned&owner=<personId>`(owner_user_id IS NULL OR = owner)

### 规则 5:复制 = 独立实例 ✅(已支持 + 强化)
- `createInstanceFromTemplate()`:新工作目录(用 generateWorkingDir,不复用模板的)+ `_hint=已创建独立实例` 返回标识

## 验证记录

### 后端 API(curl)
- 重名 → HTTP 409 `{error:name_taken, message:实例名称"不盈--全栈开发"已存在,请用其他名称}`
- 工作目录生成 → 守静--测试R27 → `/workspace/agents/sjr27-g6sd1n`
- bot 冲突 → HTTP 409 `{error:bot_already_bound, message:该入口已绑定 玄鉴--数智底座模板,请先在该 agent 解绑}`
- 克隆 → 不盈--克隆测试R27 → `/workspace/agents/byr27-ozi3xb` + is_template=false + `_hint=已创建独立实例`
- unassigned 过滤 → 6 个 agent(owner=史德飞i OR 未归属)
- 测试数据已清理

### 前端(Playwright)
- R27-collab:员工详情协作 tab 工作目录只读标记可见 ✅
- R27-person:真人详情数字员工 tab 加载 ✅
- R27-wizard:向导 step1 填名字 → 工作目录自动预览(拼音 sj)✅
- 回归:r15a-employees 6 用例全过 ✅

### 构建
- 后端 `tsc -p tsconfig.build.json`:通过(2 个预存 TS 错误在 http-server.ts:1043/1083,与 R27 无关,noEmitOnError=false 仍 emit)
- 前端 `npx next build`:✓ Compiled successfully in 22.9s

## 关键决策 / 约束
- name 唯一只在实例间(模板可同名),用部分唯一索引 `WHERE is_template=false`
- 工作目录英文:拼音首字母(6字母上限)+ 6位随机,不可手改
- bot 一对一:用 jsonb `@>` 包含检查;一个 agent 可绑多 bot,一个 bot 只归一个 agent
- 归属人选择用 R25 的 ResourcePicker(单选真人)
- 复制 = 新工作目录(不复用原)
- 全中文错误提示
- `api()` 不抛 4xx,wizard.tsx submit 手动检查返回体 error/message

## 提交(git log fd11bdb..HEAD)
- 5c53bd6 feat(db): agents.name 唯一约束 + 重名检查/工作目录生成/bot 绑定校验
- 97c19ca feat(web): 归属人选择器(ResourcePicker)+ 工作目录只读 + bot 冲突提示
- 1315cb1 feat(web): 创建向导工作目录预览 + 真人添加 agent 过滤未归属(后端 filter)
- 4b429ec feat(web): 真人详情数字员工 tab 用 ResourcePicker + 过滤未归属
- 881c179 test(web): R27 Agent 规则 e2e 冒烟

## 重要文件 / 路径
- `migrations/2026_07_09_r27_agent_rules.sql` — 唯一约束(已 apply)
- `src/db/agent-store.ts` — toPinyinInitials/generateWorkingDir/findBotBindingConflict/assertInstanceNameUnique
- `src/api/http-server.ts` — POST /api/agents(409 name_taken)+ PUT(409 bot_already_bound)
- `src/api/routes/employees-routes.ts` — PATCH 409 + from-template 409 + GET filter=unassigned&owner
- `apps/web-next/app/(app)/employees/[id]/_components/tab-collab.tsx` — 主理人 ResourcePicker + 工作目录只读
- `apps/web-next/app/(app)/employees/new/_components/step-1.tsx` — 工作目录预览
- `apps/web-next/app/(app)/employees/new/_components/wizard.tsx` — submit 409 处理
- `apps/web-next/app/(app)/overview/people/[id]/_components/person-tabs.tsx` — EmployeesTab ResourcePicker + 未归属过滤
- `apps/web-next/e2e/specs/r27-agent-rules.spec.ts` — 3 冒烟用例

## 待办 / 遗留
- 无功能遗留。5 条规则全落地。
- 预存 TS 错误(http-server.ts:1043/1083 RouteContext 类型)非 R27 引入,不在本次范围。
- r15b-wizard step2 用例仍失败(预存,文本"实时预览·真实数据"早已改成"实时名片·预览",非 R27 引入)。
