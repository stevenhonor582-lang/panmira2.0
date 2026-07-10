# 会话交接 - 2026-07-08 R15-A 数字员工 + 模板系统重构

## 当前任务
R15-A: 数字员工管理(员工库 + agent 详情 + 模板系统)重构,区分 agent 实例 vs 模板,修 L6 crash,真实数据替换模拟。

## 已完成

### ✅ 5 个 commit (e8e0a6c → f688302)
1. **a53c382** `feat(db): agents 加 is_template + working_dir + channel_ids + visibility + temperature`
2. **8682b77** `fix(api): /api/v2/employees/templates 端点 + from-template 复制实例 + filter 参数`
3. **9cb3009** `fix(web): L6 Test Agent crash 修(null 防御)`
4. **2eed609** `feat(web): 员工库区分模板/实例 tab + 真实数据 + 启停管理`
5. **f688302** `feat(web): 模板页重做 + 从模板创建实例流程`

### 后端
- migration `migrations/2026_07_08_r15a_agents_template.sql` 已 apply
- `digital_employees` view 更新(暴露新字段 + 不过滤 deprecated)
- `agents` 表新增 5 字段: is_template / working_dir / channel_ids / visibility / temperature
- 现有 8 个 agent:1 个标 template(full-stack-engineer),7 个实例,全部补 working_dir
- schema.ts 同步加 5 个字段(drizzle)
- agent-store.ts:
  - `listInstances() / listTemplates()` 分离查询
  - `createInstanceFromTemplate(templateId, {name, ownerId})` 深拷贝创建实例
  - mapRow 读全字段
  - update() 接收 5 个新字段
- employees-routes.ts:
  - `GET /api/v2/employees/templates` (修 404)
  - `GET /api/v2/employees?filter=instance|template|all` (默认 instance)
  - `POST /api/v2/employees/from-template` (复制实例)
  - PATCH 白名单加 5 个新字段

### 前端
- `_lib/data.ts` (共享): Agent 接口扩展 5 字段 + fetchAgents({filter}) + fetchTemplates() + createInstanceFromTemplate() + useTemplates()
- `gallery-board.tsx` (重做): 顶部实例/模板 tab 切换 + 右上角管理按钮 + 真实数据
- `agent-card.tsx` (重做): 悬停管理菜单(启停/弃用/转模板/转实例) + TPL 角标 + working_dir 显示
- `tab-collab.tsx`: 加 R15-A 字段区块(working_dir/channel_ids/visibility/temperature/is_template 只读)
- `tab-persona.tsx` / `agent-header.tsx` / `tab-basics.tsx`: null 防御
- `templates-board.tsx` (重做): 真实模板列表 + 从模板创建实例 modal + 深拷贝语义明示
- `e2e/specs/r15a-employees.spec.ts`: 6 项 smoke 全 pass

### 验证(实测)
- ✅ GET /api/v2/employees/templates → 1 个模板(full-stack-engineer)
- ✅ GET /api/v2/employees?filter=all → 8 条(7 实例 + 1 模板)
- ✅ GET /api/v2/employees/:id (L6) → persona=null + isTemplate=false + workingDir=/workspace/agents/<id> + temperature=0.7 + visibility=team
- ✅ POST /api/v2/employees/from-template → 创建成功 + 深拷贝完整 + 新 id + working_dir 自动补
- ✅ 9 个核心页面 HTTP 200: /, /overview/dashboard/, /employees/, /employees/templates/, /employees/new/, /employees/<L6 id>/, /tasks/, /foundation/, /settings/users/
- ✅ Playwright r15a-employees.spec 6 项全 pass
- ✅ TypeScript 编译通过(agent-store / employees-routes 0 error)

## 待办 / 遗留

### ⚠️ R15-B 边界
- `/employees/new/**` 9 个文件 (form.ts, step-1..7, wizard.tsx, stepper.tsx) 是 R15-B 在并行修改,本会话**没动**
- git status 里这些 M 是 R15-B 的进展,不要 stash / revert
- `_lib/data.ts` 是共享层,我加了 R15-A 字段 + 新 fetcher,R15-B 会在此基础上继续扩展

### 📌 后续 P15 待办(不在本次范围)
- tab-persona / tab-basics 加 R15-A 字段编辑入口(目前只在 tab-collab 只读展示)
- 模板页 CRUD(新建模板/删除模板/编辑模板)目前只能"转为模板"和"从空白起新模板"
- 详情页加 channel_ids 可视化(目前只显示 ID 数组)
- 后端 PATCH 可考虑加 RBAC(目前只 agent:admin)

## 关键决策 / 约束

1. **is_template 是物理字段**(在 agents 表),模板和实例都在同一表 — 用 SQL WHERE 区分,避免双表 JOIN
2. **复制实例 = 深拷贝**(persona/system_prompt/skills/iron_laws 全部独立),分配新 id + 新 owner + source_template_id 指向模板
3. **working_dir 默认 `/workspace/agents/<id>`**,可在 PATCH 改
4. **digital_employees view 不再过滤 deprecated**(管理员要能看见 deprecated agent 才能管理)
5. **null 防御是核心原则** — L6 crash 教训:任何字段 null/undefined 都不能 crash 渲染
6. **不动 R15-B 边界** — /employees/new/* 9 个文件留给 R15-B
7. **filter=all** 是前端默认 — 让前端拿全部,本地按 isTemplate 分类,避免双请求

## 用户偏好 / 风格
- 言简意赅,先结论后过程
- 直接做不要问,完成后给报告
- 5 个 commit 严格按用户的 commit 大纲(几乎一字不差)

## 重要文件 / 路径

### 后端
- `/home/ubuntu/panmira-N1/migrations/2026_07_08_r15a_agents_template.sql`
- `/home/ubuntu/panmira-N1/src/db/schema.ts` (line 117-122: R15-A 字段)
- `/home/ubuntu/panmira-N1/src/db/agent-store.ts` (重写 347 行)
- `/home/ubuntu/panmira-N1/src/api/routes/employees-routes.ts` (重写 245 行)
- `/home/ubuntu/panmira-N1/dist/db/agent-store.js` (编译产物)
- `/home/ubuntu/panmira-N1/dist/api/routes/employees-routes.js`

### 前端
- `/home/ubuntu/panmira-N1/apps/web-next/app/(app)/employees/_lib/data.ts` (共享层)
- `/home/ubuntu/panmira-N1/apps/web-next/app/(app)/employees/_components/gallery-board.tsx`
- `/home/ubuntu/panmira-N1/apps/web-next/app/(app)/employees/_components/agent-card.tsx`
- `/home/ubuntu/panmira-N1/apps/web-next/app/(app)/employees/[id]/_components/agent-header.tsx`
- `/home/ubuntu/panmira-N1/apps/web-next/app/(app)/employees/[id]/_components/tab-persona.tsx`
- `/home/ubuntu/panmira-N1/apps/web-next/app/(app)/employees/[id]/_components/tab-basics.tsx`
- `/home/ubuntu/panmira-N1/apps/web-next/app/(app)/employees/[id]/_components/tab-collab.tsx`
- `/home/ubuntu/panmira-N1/apps/web-next/app/(app)/employees/templates/_components/templates-board.tsx`
- `/home/ubuntu/panmira-N1/apps/web-next/e2e/specs/r15a-employees.spec.ts`

### 远端
- 后端: http://localhost:9100 (pm2: panmira, online)
- 前端: http://localhost:3200 (pm2: web-next, online)
- DB: postgresql://ubuntu:ubuntu@localhost:5432/metabot

## 验证命令(下次启动可重跑)
```bash
# 重启服务
pm2 restart panmira --update-env
pm2 reload web-next --update-env

# API 验证
ADMIN=$(curl -s -X POST http://localhost:9100/api/auth/login -H "content-type: application/json" -d '{"email":"20218181@qq.com","password":"shidefei@2026"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")
curl -s -H "authorization: Bearer $ADMIN" http://localhost:9100/api/v2/employees/templates | python3 -m json.tool
curl -s -H "authorization: Bearer $ADMIN" "http://localhost:9100/api/v2/employees?filter=all" | python3 -m json.tool

# 前端冒烟
curl -sI http://localhost:3200/employees/ | head -1
curl -sI http://localhost:3200/employees/a0e05f20-62ee-49b9-ad12-6818d8c701b7/ | head -1

# Playwright
echo "TOKEN=$ADMIN" > /tmp/admin_token.txt
cd /home/ubuntu/panmira-N1/apps/web-next
npx playwright test e2e/specs/r15a-employees.spec.ts --reporter=line
```

## 当前 git 状态
- HEAD: f688302 (main)
- 5 个 commit 已提交(e8e0a6c → f688302)
- 工作区有 R15-B 的未提交修改(/employees/new/* 9 个文件),不要碰
