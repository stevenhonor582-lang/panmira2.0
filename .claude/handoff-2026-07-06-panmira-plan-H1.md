# Plan H1 · 前端 IA 重构 + ⌘K 命令面板 · Handoff(2026-07-06)

## 当前任务
panmira-web IA 重构(spec § 14 12 流程页入口)+ ⌘K 命令面板 部署完成

## 已完成
- [x] H1.0 worktree + plan 文档
- [x] H1.1a vitest 基线 + Sidebar 组件 + 路由分组数据
- [x] H1.1b Layout 拆分(ChatLayout 保留 / AdminLayout 新建)+ 路由分拆
- [x] H1.2 ⌘K 命令面板(全局,跳转 + 搜索 + 键盘导航)
- [x] H1.3 部署 + 验证 + handoff

## 关键变更

### 新增组件
- `web/src/components/Sidebar.tsx`(新,42 行):数据驱动侧栏,NavLink active 高亮
- `web/src/components/Sidebar.module.css`(新):分组样式 + hover/active 状态
- `web/src/components/AdminLayout.tsx`(新,30 行):grid 布局(topbar + sidebar + main + ⌘K)
- `web/src/components/AdminLayout.module.css`(新,82 行):CSS Grid,响应式
- `web/src/components/CommandPalette.tsx`(新,128 行):⌘K 全局命令面板
- `web/src/components/CommandPalette.module.css`(新):modal 样式
- `web/src/components/__tests__/Sidebar.test.tsx`(新):4 tests
- `web/src/components/__tests__/CommandPalette.test.tsx`(新):6 tests
- `web/src/store/command-palette.ts`(新):zustand slice
- `web/src/store/__tests__/command-palette.test.ts`(新):3 tests
- `web/src/routes.ts`(新):SIDEBAR_GROUPS(4 组 12 入口)
- `web/vitest.config.ts`(新):前端测试基线

### 重构
- `web/src/components/Layout.tsx` → `web/src/components/ChatLayout.tsx`(817 行,保留 chat UI 不变)
- `web/src/App.tsx`:路由分拆(ChatLayout 用 chat 路由,AdminLayout 用 admin 路由)
- `web/package.json`:加 test / test:watch scripts,加 vitest + testing-library devDeps

### Admin 路由清单(spec § 14 的 12 流程页 + 3 横切页)
- `/app` 总览(工作台)
- `/app/status` 实时状态(工作台)
- `/app/alerts` 预警中心(工作台)
- `/app/models` 模型池(资源)
- `/app/knowledge` 数智底座(资源)
- `/app/resources` Skill/MCP 池(资源)
- `/app/agents` Agent 列表(配置)
- `/app/channels` Channel 接入(配置)
- `/app/permissions` 权限配置(配置)
- `/app/reports` 资源报表(管理)
- `/app/cost` 成本分析(管理)
- `/app/oauth-clients` OAuth Client(管理)
- `/app/settings` 系统设置(管理,ChatLayout)
- `/app/audit` 审计日志(管理)

### Chat 路由(保留 ChatLayout + 原 chat UI)
- `/app/chat` ChatView
- `/app/team` TeamWorkspace
- `/app/memory` MemoryView
- `/app/voice` VoiceView

### 向后兼容
- `/admin/*` → 重定向到 `/app/settings`
- `/dashboard` → 重定向到 `/app`
- `/` → 重定向到 `/app`

## 测试
- 13 tests pass (4 Sidebar + 3 store + 6 CommandPalette)
- `npm test` 3.17s

## 部署
- branch: fix/memory-system-2026-06-27
- HEAD: e57e4768 merge: plan-H1
- 4 个 commit: 1bdb163c plan doc / 8accb6fd Sidebar / bf40aff3 Layout 拆分+⌘K / e57e4768 merge
- pm2 panmira: online (PID 2652773, 22 restart count)
- dist/web/index.html mtime: 2026-07-06 18:25:19

## e2e 验证
- `https://deepx.fun/web/` HTTP 200, 1449b, PanMira title
- `https://deepx.fun/web/app` HTTP 200 (SPA fallback ✓)
- `https://deepx.fun/web/app/models` HTTP 200
- `https://deepx.fun/web/app/chat` HTTP 200
- `https://deepx.fun/oauth/jwks` HTTP 200 (后端未受影响)
- `https://deepx.fun/api/v2/admin/embedding-providers` HTTP 401 (auth 工作)

## 关键文件路径
- Plan: `docs/superpowers/plans/2026-07-06-panmira-plan-H1.md`
- Sidebar: `web/src/components/Sidebar.tsx`
- AdminLayout: `web/src/components/AdminLayout.tsx`
- CommandPalette: `web/src/components/CommandPalette.tsx`
- Routes: `web/src/routes.ts`
- ChatLayout: `web/src/components/ChatLayout.tsx`(原 Layout.tsx 重命名)

## 下一步(Plan H2)

按 spec § 14 实装 12 流程页的内容页面。候选:
- **Dashboard 总览**(资源卡片 + 趋势图)— 选 1
- **模型池**(LLM/Embedding CRUD + 测试 + fallback)
- **数智底座**(KB 树 + 上传 + 检索测试)
- **Agent 列表**(列表 + 详情 + 编排入口)

## 已知事项
- 后端 TS 检查有 baseline 错误(mcp-health.ts recordMcpUsage 未导入、style-profile playwright 缺失),不影响本次 plan(H1 只改前端)
- 后端 build 需后续 plan 修复
