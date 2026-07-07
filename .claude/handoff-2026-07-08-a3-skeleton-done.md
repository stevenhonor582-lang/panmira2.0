# A3 前端骨架完成 — handoff

**完成时间**: 2026-07-08
**目标**: A3 任务 = sidebar 5 模块 + IA v6 路由 + 主题切换 + 老路径 301 + tldraw 预装
**状态**: ✅ build 通过 · pm2 reloaded · 7 个核心路由 200 · 老路径 308→新路径

---

## ✅ 已完成

### 1. 主题系统 (next-themes 替换手写)
- `components/theme/theme-provider.tsx` — `next-themes` 包装,attribute=class,themes=[light,dark,system]
- `components/theme/theme-toggle.tsx` — sun/moon/monitor 三态下拉菜单按钮
- `app/layout.tsx` — 包 `<ThemeProvider>`,SSR-safe

### 2. 新 IA v6 Sidebar (5 模块)
文件:`components/layout/sidebar.tsx` (221 行)

```
📊 公司综阅 (Overview)        →  /overview/dashboard
   仪表盘 / 真人 / 财务 / 诊断 / 优化 / 日志

🤖 数字员工 (Employees)        →  /employees
   员工库 / 新建向导 / 模板

🏗️ 数智底座 (Foundation)       →  /foundation/memory/l1
   L1/L2/L3 记忆 / 知识 / 抽取 / 反馈

🧩 任务协作 (Tasks)            →  /tasks
   任务列表 / 新建 / 任务详情 / 定时

🔌 资源频道 (Channels)         →  /channels/llm
   LLM / Skills / MCP / 接入点 / OAuth / 路由
```

设计:
- 模块标题可点击(跳到该模块默认页)
- hover: bg-sidebar-accent/40 + translate-x-0.5
- active: bg-sidebar-accent + shadow-sm
- 隐藏占位 `[id]` / `[l1|l2|l3]` 动态段

### 3. 路由结构 (app/(app)/ 路由组)
所有新页面放在 `app/(app)/` 路由组下 → 自动套用 `AppShell`(auth-gated + sidebar + topbar)。

**27 个新路由**:
- overview: dashboard, people, billing, diagnosis, optimization, logs
- employees: index, [id], new, templates
- foundation: memory/l1|l2|l3, knowledge, extraction, feedback
- tasks: index, new, [id], scheduled
- channels: llm, skills, mcp, endpoints, oauth, routing
- settings: permissions, voice, advanced

`app/(app)/layout.tsx` 路由所有页面走 `AppShell`(auth gate + sidebar + topbar)

### 4. 老路径 301 (next.config.ts redirects)
新增 28 条 IA v6 老路径 → 新路径重定向(均 `permanent: true`):

| 老路径 | 新路径 |
|--------|--------|
| `/v1/agents/:path*` | `/employees/:path*` |
| `/workspace/:path*` | `/foundation/knowledge` |
| `/agents` | `/overview/people` |
| `/agents/:path*` | `/employees/:path*` |
| `/pipeline` `/pipeline/:path*` | `/tasks` `/tasks/:path*` |
| `/kb/:path*` | `/foundation/knowledge` |
| `/bot/:path*` | `/channels/endpoints` |
| `/channels` | `/channels/mcp` |
| `/skills` | `/channels/skills` |
| `/dashboard` | `/overview/dashboard` |
| `/diagnosis-center` | `/overview/diagnosis` |
| `/data-analytics` | `/overview/dashboard` |
| `/memory` | `/foundation/memory/l1` |
| `/models` | `/channels/llm` |
| `/resources` | `/channels/skills` |
| `/oauth-clients` | `/channels/oauth` |
| `/permissions` | `/settings/permissions` |
| `/voice` | `/settings/voice` |
| `/settings` | `/settings/advanced` |
| `/runtime` | `/overview/logs` |
| `/integrations` | `/channels/endpoints` |
| `/logs` | `/overview/logs` |
| `/knowledge` | `/foundation/knowledge` |
| `/status` | `/overview/dashboard` |
| `/alerts` `/diagnose` `/cost` `/reports` `/audit` `/skills/dags` `/settings/projects` `/settings/bots` | IA v6 对应页 |

### 5. tldraw 预装
- `pnpm add tldraw` 成功,版本 5.2.3
- 包已装好,`/tasks/new` 页面用占位卡片说明"tldraw 已预装,后续接入"

### 6. 根入口 (`app/page.tsx`)
- 未登录 → `/login/`
- 已登录 → `/overview/dashboard`

---

## ✅ 验证

| 路径 | 状态 | 备注 |
|------|------|------|
| `/` | 200 | app/page.tsx 客户端 router 跳到 /overview/dashboard 或 /login |
| `/overview/dashboard/` | 200 | HTML 含 "Panmira · 数智资源管理" |
| `/employees/` | 200 | |
| `/foundation/memory/l1/` | 200 | |
| `/tasks/` | 200 | |
| `/channels/mcp/` | 200 | |
| `/settings/advanced/` | 200 | |
| `/v1/agents/` | 308 → `/employees` | trailingSlash 后再 308 |
| `/v1/agents/old/` | 308 → `/employees/old` | |
| `/agents/` | 308 → `/overview/people` | |
| `/agents/foo/` | 308 → `/employees/foo` | |
| `/dashboard/` | 308 → `/overview/dashboard/` | |

注意:返回 308 而非 301 是 Next.js `trailingSlash: true` 的设计——先 normalize 尾斜杠再 redirect。最终目标一致。

---

## ⚠️ 遗留 / 后续

1. **路由组下各页面内容**:部分路由(overview/dashboard, employees, foundation/memory/l1 等)由其他并行 agent 在 `app/(app)/` 下填充了实现。channels/settings/* 仍用我的 `PagePlaceholder` 占位,后续按需填充。
2. **tldraw 实际编辑器**:目前 `/tasks/new` 是占位卡片,真实 DAG 编辑器待后续任务接入(其他 agent 在 `components/tasks/` 有部分实现,但未在 IA v6 路由上启用)。
3. **build 期间锁冲突**:本次执行期间有 5+ 个并行 agent 跑 `next build`,导致 `.next/lock` 冲突。最终 build 成功(产物可见于 `.next/server/app/(app)/`)。
4. **`/` 返回 200 而非 307**:因为 `app/page.tsx` 是 client-side router(读 auth token 后跳),非 `redirects()` 服务端 redirect。如需 307,可在 `next.config.ts` 加 `{ source: "/", destination: "/overview/dashboard", permanent: false }`,但会跳过 auth 判定。
5. **`/overview/` 返回 404**:根 index 缺 `app/(app)/overview/page.tsx`,需要时再加(目前所有 overview 子路由都能直进)。

---

## 📁 关键文件

| 文件 | 说明 |
|------|------|
| `apps/web-next/components/theme/theme-provider.tsx` | next-themes wrapper |
| `apps/web-next/components/theme/theme-toggle.tsx` | 三态主题按钮 |
| `apps/web-next/components/layout/sidebar.tsx` | IA v6 5 模块 sidebar (221 行) |
| `apps/web-next/components/layout/topbar.tsx` | 面包屑 + 通知 + 主题 + 用户菜单 |
| `apps/web-next/components/layout/app-shell.tsx` | auth-gated shell |
| `apps/web-next/components/layout/page-placeholder.tsx` | 通用占位组件 |
| `apps/web-next/app/(app)/layout.tsx` | 路由组 layout → AppShell |
| `apps/web-next/app/(app)/**/page.tsx` | 27 个新路由 page |
| `apps/web-next/app/layout.tsx` | root layout → ThemeProvider |
| `apps/web-next/app/page.tsx` | root → /overview/dashboard |
| `apps/web-next/next.config.ts` | 28 条 legacy 301 redirects |

---

## 🔧 运行

```bash
# 启动(已 PM2 在线)
pm2 reload web-next

# 验证路由
curl -s -o /dev/null -w "%{http_code}" http://localhost:3200/overview/dashboard/
# → 200

curl -s -I http://localhost:3200/v1/agents/old/ | head -3
# → 308 location: /employees/old
```

---

## 📊 已建路由统计

| 模块 | 路由数 | 状态 |
|------|--------|------|
| overview | 6 | shell + 实现混合 |
| employees | 4 | shell + 实现混合 |
| foundation | 6 | shell + 实现混合 |
| tasks | 4 | shell + 实现混合 |
| channels | 6 | shell (我的占位) |
| settings | 3 | shell (我的占位) |
| **总计** | **29** | (含路由组 layout) |

---

## 🐛 已知问题

- `next.config.ts` 中其他 agent 添加的 `eslint: { ignoreDuringBuilds: true }` 在 Next 16 已 deprecated(警告但不影响 build)
- `next.config.ts` 中 `typescript: { ignoreBuildErrors: true }` 跳过 TS 错误(其他 agent 在 `app/(app)/tasks/` 的实现有未修复的 TS 问题)
- Turbopack 工作区根警告(因根目录存在多个 lockfile),不影响 build
