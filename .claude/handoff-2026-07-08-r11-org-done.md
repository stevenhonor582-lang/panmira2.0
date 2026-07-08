# 会话交接 - 2026-07-08 R11 组织部重构完成

## 当前任务
R11 组织部重构 (P0+P1): 全局改名"真人"→"组织部"+ DB users 扩展 + SID 迁移 MS-XXXXXX + 员工状态板 + 操作菜单 RBAC + 添加员工 6 步向导 + 在职/停用/离职 tab。

## 已完成
- [x] P0-1 全局改名 "真人" → "组织部" (sidebar / topbar / H1 / 文案)
- [x] P0-2 英文 badge 汉化 (ROLE_LABEL / EMPLOYEE_STATUS_LABEL)
- [x] P0-3 DB migration: department / position / employee_status + CHECK 约束
- [x] P0-4 SID 迁移 metmira:\<handle\> → MS-XXXXXX (base32 排除 0/O/I/1)
  - 史德飞固定 MS-SHIDFE / 创始团队 / 创始人
  - 其他 4 个用户随机生成
- [x] P0-5 区分"登录锁定 / 账号启用 / 雇佣状态"三概念
  - locked_until: 红色 chip "登录锁定 Nmin" / 绿色 "登录正常"
  - is_active: 蓝色 "账号启用" / 灰色 "账号禁用"
  - employee_status: 绿(在职) / 黄(停用) / 灰(离职) / 红(已删除)
- [x] P1-6 员工卡片重做为"状态板" (三段式 / 数据栏 3 列 / hover 微动效)
- [x] P1-7 卡片操作菜单 (RBAC):
  - admin: 启用/禁用/在职/停用/离职/重置密码/编辑/删除(仅 departed)
  - operator 看 member: 启用/禁用/停用/编辑
  - operator 看 admin/operator: 只读
- [x] P1-8 添加员工 6 步向导 `/overview/people/new`
  - Step1 基础信息 → Step2 SID → Step3 角色 → Step4 数字员工 → Step5 流水线 → Step6 密码
- [x] P1-9 在职/停用/离职 tab 分区 (URL 不变)
- [x] 后端 RBAC: PATCH/DELETE/reset-password/activity 端点
- [x] 触发器已就位 (最后一个 admin 不能降级/删除)

## 待办 (R12 范围,本次不做)
- [ ] 编辑员工详情 (PATCH 完整表单) - 当前只有卡片菜单内联编辑
- [ ] 离职员工恢复在职的"恢复"按钮 (目前通过菜单标记 active 实现)
- [ ] 仪表盘扩展 (P2,原任务里说放最后做)
- [ ] 数字员工 / employees 模块编辑 (R12)
- [ ] 按 employee_status 聚合的统计图

## 关键决策 / 约束
- **URL 保持 /overview/people** 不变 (只改显示文字)
- **SID 6 位 base32** (排除易混 0/O/I/1), 史德飞固定 MS-SHIDFE
- **三个状态独立**: is_active (登录开关) / employee_status (雇佣状态) / locked_until (系统锁定)
- **删除限制**: 仅 employee_status='departed' 可彻底 DELETE
- **离职自动联动**: PATCH employeeStatus='departed' → is_active=false (但不反向)
- **SID 唯一性**: createUser 时 generateUniqueSid() 重试 3 次
- **密码可选**: 创建时若不传 password, 后端生成 `Pan-<8 chars>` 显示给创建者

## 验证记录
- DB: 5 个用户全部有 department/position/employee_status, SID 全 MS-XXXXXX 格式
- API 测试 (curl):
  - GET /api/auth/users 返回新字段 ✓
  - POST 创建员工 (带 dept/pos) ✓
  - PATCH 改 employeeStatus + department ✓
  - POST reset-password ✓
  - GET activity (24h 调用 / 数字员工 / 任务) ✓
  - DELETE 非 departed 拦截 ✓
  - DELETE departed 后成功 ✓
- 前端路由 200 OK: /overview/people, /overview/people/new
- Playwright q3-33pages.spec.ts: 34/34 通过 (含 /overview/people/[id] 动态路由)

## 用户偏好 / 风格
- 信息密度高 (类 Linear/Notion 卡)
- 状态颜色 oklch 不刺眼 (emerald/amber/zinc/rose/sky)
- lucide-react icons, 不要 emoji
- 状态明确分级 (绿=好/黄=注意/灰=退场/红=异常)

## Git commits
- `9312b4f feat(db): R11 users 扩展 - department/position/employee_status + SID 迁移 MS-XXXXXX`
- `5d27106 feat(web): R11 组织部 - 改名+汉化+员工状态板+操作菜单+添加向导`

## 重要文件 / 路径 / 远端
- migration: `/home/ubuntu/panmira-N1/migrations/2026_07_08_r11_employees.sql`
- 后端 store: `/home/ubuntu/panmira-N1/src/db/user-store.ts`
- 后端 routes: `/home/ubuntu/panmira-N1/src/api/routes/auth-routes.ts`
- 前端卡片: `/home/ubuntu/panmira-N1/apps/web-next/app/(app)/overview/_components/person-card.tsx`
- 前端向导: `/home/ubuntu/panmira-N1/apps/web-next/app/(app)/overview/people/new/page.tsx`
- 备份: `/home/ubuntu/panmira-N1/backups/pre-r11-20260708-161400.sql` (192M)

## 服务状态
- 后端 panmira: online (PID 3720290, port 9100)
- 前端 web-next: online (PID 3723382, port 3200)
- DB: postgresql://ubuntu:ubuntu@localhost:5432/metabot

## HEAD
- main `5d27106` → `9312b4f` → `24dba7b` (R10 baseline)

## 复盘要点
- migration 第一次 ON CONFLICT 失败 (`_migration_log` 无 unique 约束), 改用 NOT EXISTS 子查询
- pgcrypto 扩展需先 `CREATE EXTENSION` (函数 gen_random_bytes 依赖)
- tsc 报错 dist 已生成 (预存在的 http-server.ts 类型问题,与本任务无关)
- next build 通过无 error
