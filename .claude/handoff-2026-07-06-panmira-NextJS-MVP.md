# Plan Next.js MVP · Handoff(2026-07-06) · 准备 compact

## ⚡ 重要:用户决策已锁定 — Next.js 重写,不要回头

### 当前状态
- HEAD: `a6b6fc3a` (revert 清空 H2-H8 前端 View)
- 后端保留:H1-H9 全部后端代码 + API + auth fix 都在
- 前端:回退到纯原 web(web/src/components/ 只剩 5 个 View: ChatView/MemoryView/SettingsView/VoiceView/DashboardView)
- 13 个原 H2-H8 View 备份在 web/src/components/.archive/(23 个文件,需要时可恢复)

### 用户最新决策(2026-07-06)
| 问题 | 决策 |
|------|------|
| nommira reference | https://operator.panmira.cn/content-ops/proposals(Next.js + shadcn/ui + tweakcn 主题 cmlk6zefr000004lbe9jygsqc) |
| 共存方式 | **D. 完全替代原 web**(纯 admin 后台,放弃 chat/team/memory) |
| 前端框架 | **B. 重写为 Next.js 15 + shadcn + tweakcn** |
| 侧栏 | A. 左侧单层 workspace nav(类似 nommira) |
| 范围 | **MVP 5 天: 顶部 + 侧栏 + Dashboard + Agent** |
| 业务定位 | 企业 AI Agent + 数智底座(LLM/KB/Agent/Skill/MCP/Channel) |

### 5 天计划(已创建 task #75-79)
- **#75** Day 1: Next.js 15 项目初始化 + Tailwind + shadcn/ui + tweakcn 主题
- **#76** Day 2: AdminShell 顶部 + 侧栏 + 路由 + 登录页(用现有 admin JWT)
- **#77** Day 3: Dashboard 页(资源卡 + 趋势图,调 `/api/v2/admin/dashboard/stats`)
- **#78** Day 4: Agent 页(列表 + 详情 Drawer + 创建 + 删除,调 `/api/v2/admin/agents`)
- **#79** Day 5: build + pm2 跑 next start + nginx 反代 `/web-next/` + handoff

### 后端 API(可直接用)
- 6 个 admin API 都已通过测试(/api/v2/admin/dashboard/stats, models, agents, audit, channels, knowledge-bases)
- admin JWT 流程: POST /api/auth/login {email, password} → {accessToken} → Bearer
- 测试账号: `admin@panmira.com` / `admin123` (我重置过密码)
- requireBearer 已支持 user JWT + 通配 scope * (commit 23fd724d)

### 工作流(沿用)
1. 创建 worktree `feat/nextjs-mvp` from fix/memory-system-2026-06-27
   - ⚠ 上次尝试 `git worktree add /home/ubuntu/panmira-N1` 失败(没成功创建)
   - 下次重试用 `git worktree add /home/ubuntu/panmira-N1 -b feat/nextjs-mvp fix/memory-system-2026-06-27`(必须先 cd 到 /home/ubuntu/panmira)
2. 在 worktree 里创建 `apps/web-next/` Next.js 项目
3. TDD + 每天 commit
4. 部署到独立端口(3100) + nginx `/web-next/` 反代
5. 用户验收后,切换 `/web/` 反代到 Next.js + 删 vite 静态文件

### Next.js 项目结构计划
```
panmira/
  apps/
    web-next/                 # 新建 Next.js 项目
      app/                    # App Router
        (admin)/
          layout.tsx          # AdminShell
          dashboard/page.tsx
          agents/page.tsx
        login/page.tsx
        layout.tsx            # Root layout
      components/
        ui/                   # shadcn 组件(Button/Card/Dialog/...)
        admin-shell.tsx
        sidebar.tsx
        topbar.tsx
      lib/
        api.ts                # fetch wrapper
        auth.ts               # login/JWT
      tailwind.config.ts      # tweakcn 主题变量
```

### shadcn + tweakcn 集成命令(下次用)
```bash
cd apps/web-next
npx create-next-app@latest . --typescript --tailwind --app --no-src-dir --import-alias "@/*"
npx shadcn@latest init   # 初始化 shadcn
# 复制 tweakcn 主题变量(https://tweakcn.com/r/themes/cmlk6zefr000004lbe9jygsqc)到 globals.css
npx shadcn@latest add button card dialog drawer sheet tabs badge input
```

### 注意事项
- **不要回退 H9 auth fix** — 后端 user JWT 通了,前端用 Bearer 调用 admin API 必须用 user JWT(不是 OAuth client)
- **完全替代原 web**:ChatView/TeamWorkspace/MemoryView/VoiceView 不保留
- **DashboardView(原 528 行)是 token overview 风格,不是 admin dashboard**:可以参考其 UI 但不直接复用
- **保留后端 API + 测试 client**(h2-dashboard-test / h3a-models-test / h3b-kb-test / h3c-agent-test)

### 已知工作完成
- 备份 H2-H8 13 个 View 在 web/src/components/.archive/(不删,可参考)
- .claude/handoff-2026-07-06-panmira-plan-H1.md 到 H9.md 9 份历史 handoff(可参考)
- spec § 14 设计文档 projects/panmira/specs/2026-07-06-saas-design.md(参考 IA)
- 后端 6 个 admin API 已实现并测试通过

### 关键文件路径(下次会话用)
- 主仓库: /home/ubuntu/panmira
- Worktree(将建): /home/ubuntu/panmira-N1(创建失败,下次重试)
- 后端 API 路由: src/api/routes/(dashboard-routes.ts / agents-crud-routes.ts 等)
- 后端 auth: src/api/routes/auth-routes.ts + src/api/middleware.ts (user JWT)
- OAuth context: src/api/oauth-middleware.ts (requireBearer)
- 前端 backup: web/src/components/.archive/

### 下次会话第一步
```bash
ssh mah
cd /home/ubuntu/panmira
git worktree add /home/ubuntu/panmira-N1 -b feat/nextjs-mvp fix/memory-system-2026-06-27
cd /home/ubuntu/panmira-N1
# 读这份 handoff 文档
cat .claude/handoff-2026-07-06-panmira-NextJS-MVP.md
# 然后开始 Day 1 任务
```
