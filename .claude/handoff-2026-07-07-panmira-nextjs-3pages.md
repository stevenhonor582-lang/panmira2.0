# 3 New Admin Pages on Next.js · Handoff (2026-07-07)

## 当前任务
把 plan-H1 Vite 写的 3 个新页面(Runtime Console / Agent Template Editor / Skill DAG Editor)移植到 Next.js admin(/web-next/)— 因为 panmira 真正用的是 Next.js + shadcn,不是 Vite。

## 已完成

### 3 个 Next.js pages(全在 `apps/web-next/`)
- `app/(admin)/runtime/page.tsx`(208 行)
  - 4 个 stats 卡片(活跃/今日/花费/Bot 数)
  - Session 表格:status badge + 中断按钮(只在 active 可点)
  - 30s 自动轮询(用现有 usePolling hook)
- `app/(admin)/agents/templates/page.tsx`(200 行)
  - 左侧 Agent 列表,右侧 4 Tab 编辑器
  - Tab:身份(name/desc/systemPrompt/isActive)/编排/工具策略/边界&铁律
  - Identity 用 form,其他 Tab 用 textarea + JSON 编辑
- `app/(admin)/skills/dags/page.tsx`(227 行)
  - 版本列表 + JSON 编辑器
  - 校验按钮 → 服务端 cycle/dangling/output 检查
  - 节点预览卡片
- `components/admin/sidebar.tsx`(改 3 行):加 3 个入口(标 NEW 徽章)

### 后端 API(已部署在 fix/memory-system-2026-06-27)
- `GET/POST/PUT/DELETE /api/v2/admin/runtime/{sessions,stats}` + `POST /:id/interrupt`
- `GET/POST/PUT/DELETE /api/v2/admin/skill-dags`
- `GET/PUT /api/v2/admin/agents/:id`(执行蓝图字段)
- 已在 handoff `2026-07-07-panmira-execution-blueprint.md` 记录

## 部署

- **branch**: `feat/nextjs-mvp` HEAD `48b88a2a`
- **merged to main**: `bb39d4d2`
- **origin**: pushed
- **pm2 web-next PID 35**: online, 143MB, 已 reload
- **pm2 panmira PID 34**: online, 210MB

## E2E 验证(全部 ✓)

```
/web-next/login/             HTTP 200
/web-next/runtime/            HTTP 200
/web-next/agents/templates/   HTTP 200
/web-next/skills/dags/        HTTP 200

GET /api/v2/admin/runtime/stats  HTTP 200 + JSON 数据
```

## 浏览器验证步骤

1. https://deepx.fun/web-next/login/ → admin@panmira.com / admin123
2. 侧栏「监控」组 → "Runtime Console"(NEW 徽章)
3. 侧栏「工作台」组 → "Agent 执行蓝图"(NEW 徽章)
4. 侧栏「系统」组 → "Skill DAG 编写"(NEW 徽章)

## 关键教训

⚠️ **panmira 真用的是 /web-next/(Next.js + shadcn + tweakcn)**,不在 /web/(旧 Vite)。所有新功能应该加到 N1 worktree(`/home/ubuntu/panmira-N1/apps/web-next/`),不是 Vite 目录。我之前在 plan-H1 worktree 写的 Vite 代码不能用了,需要移植。

⚠️ **pm2 web-next 进程 cwd = /home/ubuntu/panmira-N1**(不是主仓库)。修改主仓库的 web-next 文件不会生效,必须改 N1 worktree,然后 build + reload。

## 下一步

- [A] 浏览器验证 3 个新页面(用户已能打开)
- [B] 录入测试数据(Skill DAG + Agent template)
- [C] Feishu session 管理(用户之前说最后修)
- [D] DAG 可视化画布(react-flow)
