# R44-1 提升为模板修复 - 2026-07-10

## 任务

R42 拆表时把 promote 端点误删,前端 UI 提示"已删除"被永久误删。
4 个永久丢失功能中的第 1 个,用户原话"选 a,先修一下,我们再讨论下方法论"。

## 4 原则遵守情况

| 原则 | 状态 | 证据 |
|------|------|------|
| 1. 功能清单先行 | OK | 见下方"功能清单点验表" |
| 2. 旧功能必保 | OK | agent-card.tsx 菜单全部保留(停用/启用/弃用/生成实例),person-tabs.tsx 菜单全部保留(复制为模板/解绑) |
| 3. rebuild 硬约束 | OK | rm -rf .next && npm run build → BUILD_ID MQZvgWsLdsxn3lTZj3UN(17:56:54,> 当前时间 17:57:05);pm2 reload web-next pid 434615 online;pm2 reload panmira pid 431522 online |
| 4. 完成后停下 | OK | 只做 R44-1,未碰 R44-2(转为实例)/R44-3(复制为模板)/R44-4(真人创建 UI) |

## 功能清单点验表

### 后端:src/api/routes/agents-crud-routes.ts

| 路由 | 改前 | 改后 |
|------|------|------|
| GET /api/v2/admin/agents | 存在 | 存在(未动) |
| POST /api/v2/admin/agents | 存在 | 存在(未动) |
| GET/PATCH/DELETE /api/v2/admin/agents/:id | 存在 | 存在(未动) |
| POST /api/v2/admin/agent-templates/:id/instantiate | 存在 | 存在(未动) |
| POST/GET /api/v2/admin/agent-templates | 存在 | 存在(未动) |
| GET/DELETE /api/v2/admin/agent-instances(/...) | 存在 | 存在(未动) |
| GET/POST/DELETE /api/v2/admin/agents/:id/mcp-refs(...) | 存在 | 存在(未动) |
| POST/DELETE /api/v2/admin/agents/:id/assign | 存在 | 存在(未动) |
| **POST /api/v2/admin/agent-instances/:id/promote-to-template** | **缺** | **新增** ✓ |

### 前端:agent-card.tsx 3 点菜单(实例卡片)

| 菜单项 | 改前 | 改后 |
|--------|------|------|
| 停用 (pause, 仅 active) | 存在 | 存在(未动) |
| 启用 (activate, 仅 paused/deprecated) | 存在 | 存在(未动) |
| 标记弃用 (deprecate) | 存在 | 存在(未动) |
| 生成实例 (generateInstance, 仅 template) | 存在 | 存在(未动) |
| **提升为模板 (promoteToTemplate, 仅非 template)** | **缺** | **新增** ✓ |

### 前端:person-tabs.tsx 数字员工 tab 每行菜单

| 菜单项 | 改前 | 改后 |
|--------|------|------|
| **提升为模板 (promote)** | **缺** | **新增** ✓ |
| 复制为模板 (copyAsTemplate) | 存在(R43 恢复) | 存在(未动) |
| 解绑 (unbind) | 存在 | 存在(未动) |

### 前端:apps/web-next/app/(app)/employees/_lib/data.ts

| Helper | 改前 | 改后 |
|--------|------|------|
| updateAgent | 存在 | 存在(未动) |
| archiveAgent | 存在 | 存在(未动) |
| fetchAgents / fetchTemplates | 存在 | 存在(未动) |
| createInstanceFromTemplate | 存在 | 存在(未动) |
| **promoteInstanceToTemplate** | **缺** | **新增** ✓ |
| promoteAgent (deprecated stub) | 存在 | 存在(保留 deprecated 注释) |
| demoteAgent / copyAsTemplate (deprecated stub) | 存在 | 存在(未动) |

## 验证结果

| 验证项 | 结果 | 证据 |
|--------|------|------|
| 后端 tsc build | OK | dist/api/routes/agents-crud-routes.js 含 "promote-to-template" 字符串(grep -c = 2) |
| 后端 pm2 reload | OK | panmira pid 431522 online 11m |
| 前端 npm run build | OK | .next/BUILD_ID = MQZvgWsLdsxn3lTZj3UN,时间戳 2026-07-10 17:56:54 |
| 前端 pm2 reload | OK | web-next pid 434615 online |
| 路由注册 | OK | curl -X POST .../promote-to-template 返回 401 unauthenticated(非 404) |
| e2e promote 端到端 | **待用户跑** | 无 token,已写 scripts/e2e/test-r44-1-promote.sh,用户补 TO K 即可跑 |

## 关键设计

- **创建新模板,不是改原 instance** — 按用户原话"提升为模板"= 创建,不是转换
- **解绑 bot_configs** — 必须,否则原 instance 仍占着 bot,后续操作混乱
- **不删原 instance** — 蓝图字段(12 个)+ 蓝图+全字段(20+)都保留
- **复制关联表**(skill/kb/mcp, target_type='template')
- **错误码**:404 agent_not_found / 400 name_taken / 400 already_template(已通过架构保证,instance 表里没有 is_template 字段)
- **Dialog 命名**:用户填新模板名,默认 "<原名>-模板",校验非空

## 端点契约

```
POST /api/v2/admin/agent-instances/:id/promote-to-template
Body: { name?: string }   // 可选,默认 <instance.name>-模板
Auth: Bearer token + scope: agent:admin

201 {
  "agent": { ...newTemplate row... },
  "source_instance_id": "...",
  "bots_unbound": <number>,
  "refs_copied": { "skills": <n>, "knowledge": <n>, "mcp": <n> }
}

400 { "error": "name_taken" }      // 同名模板已存在
404 { "error": "agent_not_found" }  // instance 不存在
500 { "error": "internal_error" }   // 事务回滚
```

## commit

- HEAD: **894235b** feat(api,web): R44-1 提升为模板 路由+UI
- 5 files changed, 322 insertions(+), 11 deletions(-)

## 改动文件

- `src/api/routes/agents-crud-routes.ts` (+133 行:新 promote-to-template 路由)
- `apps/web-next/app/(app)/employees/_components/agent-card.tsx` (+89/-6:菜单项 + Dialog)
- `apps/web-next/app/(app)/employees/_lib/data.ts` (+24 行:promoteInstanceToTemplate helper)
- `apps/web-next/app/(app)/overview/people/[id]/_components/person-tabs.tsx` (+33/-4:菜单项 + handlePromoteToTemplate)
- `scripts/e2e/test-r44-1-promote.sh` (新:用户补 token 可跑 e2e)

## 已知遗留

- e2e curl 验证需用户提供 TO K 才能跑(用户登录用的 JWT 或 opaque token)
- R44-2(转为实例)/R44-3(复制为模板的细化)/R44-4(真人创建 UI)等用户拍板再继续
- 旧 deprecated stub(promoteAgent / demoteAgent / copyAsTemplate)保留,未删

## 状态

- HEAD: 894235b
- 改动: 5 files / +322 / -11
- 风险: 低(后端纯新增路由,事务完整;前端只在 dropdown menu 加项 + 新 Dialog)
- 下一步:等用户拍板 R44-2/3/4
