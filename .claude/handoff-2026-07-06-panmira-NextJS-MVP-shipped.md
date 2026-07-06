# Plan Next.js MVP · 5 天完成 · Handoff(2026-07-06)

## ⚡ 当前状态:5 天 MVP 全部完成 + 生产部署

### 部署信息
- **公网**: https://deepx.fun/web-next/  (HTTPS)
- **pm2**: `web-next` PID 35,fork mode,内存 147MB
- **端口**: 127.0.0.1:3200 (`next start`)
- **nginx**: hlzd.conf 加 location /web-next/ → :3200
- **后端**: panmira@PID 34 unchanged (deepx.fun:9100)

### 5 天 commit 链(feat/nextjs-mvp 分支)
| Day | commit | 内容 |
|---|---|---|
| 1 | `38b9f32d` | Next.js 16 + React 19 + Tailwind v4 + shadcn/ui + tweakcn AstroVista |
| 2 | `fa6fc541` | AdminShell + 登录页 + 鉴权守卫 + lib/auth.ts + lib/api.ts |
| 2 | `25bdd8bd` | UI 微调: sidebar 分组 + 动态面包屑 + 底部状态卡 |
| 3 | `11a3e1f8` | Dashboard 接 API + 7 状态卡 + 7 天趋势图(Recharts) |
| 4 | `19f2485a` | Agent 完整 CRUD (列表 + 详情 + 创建/编辑/删除) |
| 5 | (本次) | 生产 build + pm2 + nginx + handoff |

### 实测功能
- ✅ 登录:`https://deepx.fun/web-next/login/` → POST `/api/auth/login` → JWT 持久化
- ✅ Dashboard:`/web-next/dashboard/` → 7 张状态卡(真实数据)+ Recharts 趋势图
- ✅ Agent:`/web-next/agents/` → 4 行表格 + 搜索 + 创建/编辑/删除 + Detail Drawer
- ✅ Sidebar 8 项 + 3 分组 + active dot
- ✅ Topbar 动态面包屑 + 主题切换 + 通知 + 用户菜单 + 退出
- ✅ Dark / Light 双模式

### 测试账号
- email: `admin@panmira.com`
- password: `admin123` (生产前重置)

### 已迁功能(3 个)
1. Login
2. Dashboard
3. Agent (CRUD)

### 待迁功能(17 个 View — 用户要求保留,除 chat/team)
**资源池**:
- 模型池 (ModelsView + ProvidersSection)
- 数智底座 KB (KnowledgeView + KnowledgeSection)
- Skill / MCP (ResourcesView + SkillsSection + ChainEditor)

**业务**:
- Channel (ChannelsView + CoordinatorSection)
- Memory (MemoryView)
- Voice (VoiceView)

**监控**:
- Status (StatusView)
- Alerts (AlertsView)
- Diagnose (DiagnoseView)

**报表**:
- Reports (ReportsView)
- Cost (CostView)
- Audit (AuditView)

**权限**:
- OAuth Clients (OAuthClientsView)
- Permissions (PermissionsView + BotPermissionsPanel)

**设置**:
- SystemSection + UsersSection + BotsSection + ProjectsSection
(原 SettingsView 13 个 Section)

### 可复用组件
- shadcn: button / card / dialog / drawer / sheet / tabs / badge / input /
  dropdown-menu / avatar / separator / scroll-area / label / table / chart /
  skeleton
- 自建: Sidebar(分组) + Topbar(动态面包屑)
- API wrapper: lib/auth.ts + lib/api.ts

### 已知约束 / 决策
- **basePath**: `/web-next/`(nginx 反代前缀)
- **trailingSlash**: true(避免 308 循环)
- **allowedDevOrigins**: deepx.fun + localhost
- **后端调用**: 全部通过 nginx 同源(相对路径 `/api/...`)
- **API**: admin JWT(role=admin → scope *) 直接调 admin API
- **风格**: AstroVista(橙红 #oklch 38.58,Outfit + Fira Code)

### 关键文件路径
- worktree: `/home/ubuntu/panmira-N1`
- apps: `/home/ubuntu/panmira-N1/apps/web-next/`
- pm2 配置: `apps/web-next/ecosystem.config.cjs`
- nginx: `/etc/nginx/sites-enabled/hlzd.conf`(line 83 area)
- next.config: `apps/web-next/next.config.ts`
- globals.css (theme): `apps/web-next/app/globals.css`
- 截图: `.claude/day{1,2,3,4,5}*.png`

### 下一步 plan 建议
**Phase 2: 全功能迁移(2-3 周)**

建议优先级:
1. **P0 高频**: 模型池 + KB + Channel + Status(每天都用)
2. **P1 报表**: Reports + Cost + Audit(管理决策需要)
3. **P2 权限**: OAuth + Permissions + Settings(配置管理)
4. **P3 长尾**: Memory + Voice + Skill + Alerts + Diagnose(按需)

每页模式参考 Agent:
- 列表 + 搜索 + CRUD
- 复杂字段用 Detail Drawer
- 后端 API 已存在(H 阶段已实现,只在调通)

### 上下文恢复指引
下次会话开头:
1. 读 `.claude/handoff-2026-07-06-panmira-NextJS-MVP-shipped.md`(本文)
2. `ssh mah` → `pm2 list` 看到 web-next online
3. 浏览器访问 `https://deepx.fun/web-next/login/`
4. 用 `admin@panmira.com` / `admin123` 登录
5. 选下一个要迁的 View,按 Agent 页模式实施
