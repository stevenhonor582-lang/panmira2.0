# 会话交接 - 2026-07-08 R14-D billing 重构完成

## 当前任务
R14-D: 把 `/overview/billing` 从"积分+频道+开发用语"重构成"以 Token 为中心 + 按人统计 + 清晰"

## 已完成
- [x] 探明数据模型 — activity_events 无 pipeline_id, bot_id 全 NULL, bot_name 是 join 关键字
- [x] 后端 `src/api/routes/billing-aggregate-routes.ts` (334 行,新建)
- [x] http-server.ts 注册 import + 数组 + dispatch
- [x] tsc 编译通过 (2 个已存在的 RouteContext 类型错误与本次无关, noEmitOnError=false 仍生成 dist)
- [x] pm2 restart panmira 重启后端
- [x] curl 验证 `/api/v2/admin/billing-aggregate` 返回真实数据
  - 30 天: 5.94M Token, $1.81 USD
  - byEmployee 6 行 (史德飞 100%), byAgent 5 行 (得一 65%), bySource 7 行
  - sum 对齐 month (加 __unattributed__ 兜底)
- [x] 前端 4 个组件: types.ts / token-overview.tsx / by-employee.tsx / by-agent.tsx / by-source.tsx
- [x] 重写 `apps/web-next/app/(app)/overview/billing/page.tsx`
- [x] `next build` 通过
- [x] Playwright q3-33pages: **34/34 通过** (1.0 分钟)
- [x] 2 个 git commits:
  - `10a7a19 feat(api): R14-D /api/v2/admin/billing-aggregate - 4 维度 Token 统计`
  - `22f7c26 feat(web): R14-D billing 重写 - Token 为中心 + 按员工/数字员工/来源 + 图表 + 全中文`

## 关键决策 / 约束 (不可丢失)

### 数据模型现实 (与用户原始 SQL 不同)
1. `activity_events.bot_id` 全部为 NULL (0/4414), 不能用它关联 agents
2. `activity_events.user_id` 是飞书 `ou_xxx` 格式, **users 表无 feishu_user_id** 无法关联
3. `activity_events` **没有 pipeline_id 字段**
4. `agents.name` 含 "--后缀" (如"得一--替补模板"), activity_events.bot_name 只存前缀("得一")
5. agents 有 owner_user_id FK 到 users.id, 5 个数字员工都属史德飞

### 关联方案 (实际可行)
- 区域 ② 按员工: `activity_events.bot_name -> agents.name LIKE 'bot_name--%' -> agents.owner_user_id -> users.id`
- 区域 ③ 按数字员工: 同上 LIKE 匹配,带 `__unattributed__` 兜底 (信言 agent 已被删,90k token 归未归属)
- 区域 ④ "按使用来源" 替代了用户的"按频道/任务": 直接按 user_id 前缀分组, label = "飞书用户 xxx" / "Web 控制台" / "API 调用"

### 文案原则
- 全中文, 除 "Token" 保留 (用户明确)
- 删除: "积分" / "代批四" / "真实账单接入" / "channel" / "knowledge" / "input_tokens" 等
- 数据 0 显示 "—" (formatTokens/formatCost/formatPct)
- 财务/积分 → 财务 · Token 消耗
- 计费维度 → 按使用来源

### 不算钱 (用户明确)
- 频道 (channels) 不计费
- 知识库 (knowledge base) 不计费
- 只统计 Token 相关

## 用户偏好 / 风格 (没变)

## 重要文件 / 路径 / 远端 URL
- 后端: `src/api/routes/billing-aggregate-routes.ts`
- 后端注册: `src/api/http-server.ts` (import 行 + 数组 + dispatch if 分支)
- 前端页面: `apps/web-next/app/(app)/overview/billing/page.tsx`
- 前端组件目录: `apps/web-next/app/(app)/overview/_components/billing/`
- 端点: `GET http://localhost:9100/api/v2/admin/billing-aggregate` (Bearer token 必填)
- 页面: `http://localhost:3200/overview/billing/`
- HEAD: `22f7c26` (在 `a5b874f` 之后)

## 待办 / 可优化
- [ ] activity_events.cost_usd 大部分为 NULL, "预估费用" 偏低 ($1.81 / 5.94M Token). 后续若接入真实成本上报,会自动反映在 KPI 卡 + 员工表 + 数字员工列表
- [ ] `activity_events.user_id` 是飞书 ou_, users 表加 `feishu_user_id` 字段后可以把"按使用来源"还原成"按真实员工"。当前用 ou_ 前缀短显示
- [ ] agents 表加 status='deprecated' 的 "信言" 已删, 该 bot_name 的 token 计入"未归属数字员工" (90K). 可选: 在 agents 表里恢复或加 alias
- [ ] git status 还有未提交的 modified 文件 (auth-routes.ts / dashboard-aggregate-routes.ts / people-routes.ts / user-store.ts) — 不是本次任务范围, 留给其他子任务
