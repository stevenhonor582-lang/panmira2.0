# 会话交接 - 2026-07-10 R41-C 数字员工分配过滤修复

## 任务
R41-C:修复组织部"分配数字员工"时下拉框显示已被他人绑定实例的 bug。

## 一句话目标
把 `user_agent_bindings` 表挂回 drizzle schema,作为绑定的 canonical
source of truth;`agents.owner_user_id` 保留为 denormalized cache,所有
写路径(filter=PATCH+assign)都同步维护两张表。

## 完成
- [x] schema.ts: 新增 `userAgentBindings` 表模型 + `agents.ownerUserId`
- [x] employees-routes.ts: `filter=unassigned` 改用 `NOT EXISTS user_agent_bindings`
- [x] agents-crud-routes.ts: 新增 `POST/DELETE /api/v2/admin/agents/:id/assign`
- [x] people-routes.ts PATCH: 同时写 `user_agent_bindings`(add/remove/set 三分支)
- [x] V025 migration: 创建表(防御性)+ 从 `agents.owner_user_id` 回填
- [x] 后端 build + pm2 reload panmira: EXIT=0,3 个 TS error 全是 pre-existing
- [x] web-next pm2 reload: HTTP 200 on overview/people/:id
- [x] curl 端到端验证: assign/unassign/list 双向都对,跨用户隔离也对
- [x] commit 6aa36e7

## 验证结果

| 场景 | 期望 | 实际 |
|------|------|------|
| `filter=unassigned`(无 owner) | 6 个未绑 instance | ✓ 6 |
| POST assign A→agent | unassigned -1,bound +1 | ✓ 6→5 / 4→5 |
| DELETE unassign | 反向还原 | ✓ 5→6 / 5→4 |
| 跨用户隔离:A 绑后 B 列表 | B 看不到 A 的 agent | ✓ B unassigned 6→5 |
| 走老路径 PATCH /people/:id/agents | 也写 m:n 表 | ✓ B unassigned 6→5 |
| 老路径 PATCH remove | 清 m:n 表 + 反向 unassigned | ✓ 5→6 |

## 关键决策 / 约束
- **保留 `owner_user_id`**:不破坏 R14-BC 已有的查询兼容性,作为 cache 维护
- **user_agent_bindings 加 `(tenant_id, user_id, agent_id, role)` UNIQUE**:已有
  DB index `uq_uab` 利用这个 conflict target 做 ON CONFLICT 幂等
- **不写前端**:前端 `filter=unassigned&owner=X` 的 URL 不变,后端契约兼容
- **角色默认 `owner`**:和现有 legacy `UPDATE agents SET owner_user_id=X` 一致
- **tenant_id 取自 agent.tenant_id**:避免 PATCH 没传 tenant 时的孤儿 binding

## 待办(后续 R41+ 任务)
- [ ] R41-D 系列后续(看 .claude/R41-UNIFIED-SOURCE-SPEC.md)
- [ ] R42:user_agent_bindings 加 audit(created_by/binding_source/duration 字段)
- [ ] web-next person-tabs.tsx line 464 的 pre-existing TS error
  (`ResourceItem[]` vs `UnassignedAgent[]`)独立工单处理

## 重要文件 / 路径
- 修改:`src/db/schema.ts`(ownerUserId + userAgentBindings)
- 修改:`src/api/routes/agents-crud-routes.ts`(assign / unassign routes)
- 修改:`src/api/routes/employees-routes.ts`(filter=unassigned 重写)
- 修改:`src/api/routes/people-routes.ts`(PATCH 同步 m:n 表)
- 新增:`db/migrations/V025__r41c_enable_user_agent_bindings.up.sql`
- 新增:`db/migrations/V025__r41c_enable_user_agent_bindings.down.sql`

## commit
6aa36e7 — feat(api,db): R41-C 启用 user_agent_bindings(m:n)+ 分配过滤修复
