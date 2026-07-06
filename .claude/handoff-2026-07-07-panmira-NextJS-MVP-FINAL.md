# Panmira Next.js Admin · Final Handoff (2026-07-07)

## ⚡ 完成状态:Phase 1-7 全交付 + merge 到 main + push origin

### 部署信息
- **公网**: https://deepx.fun/web-next/  (HTTPS via nginx)
- **pm2**: `web-next` PID 35, 端口 127.0.0.1:3200, fork mode
- **后端**: panmira PID 34 unchanged, 端口 9100
- **nginx**: `/etc/nginx/sites-enabled/hlzd.conf`:
  ```
  location /web-next/ {
    proxy_pass http://127.0.0.1:3200;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
  ```
- **GitHub**: `stevenhonor582-lang/panmira` — main 已含全部内容
  - main HEAD: `948e9db5`
  - fix 分支: `7751f767` (含后端 fix)
  - feat 分支: `b9e9539d` (保留 reference)
- **测试账号**: `admin@panmira.com` / `admin123`

### 完整路由清单(22 admin + login = 23 总)

| 路由 | 状态 | 实现深度 |
|---|---|---|
| `/login` | ✅ | 邮箱密码 + JWT 持久化 + 鉴权重定向 |
| `/dashboard` | ✅ | 7 状态卡 + 7 天趋势图(Recharts) |
| `/agents` | ✅ | 完整 CRUD + Drawer + tools[] 显示 |
| `/models` | ✅ | CRUD + test + toggle status(仅 embedding) |
| `/knowledge` | ✅ | CRUD + 上传文档 + 检索测试 + 8 类型 |
| `/channels` | ✅ | routing_bindings CRUD(简化版 Channel 实体) |
| `/resources` | ✅ | MCP + Plugin 双 tab + health check trigger |
| `/status` | ✅ | 6 计数 + 24h 错误 + 今日用量 + Bot 排行 |
| `/alerts` | ✅ | 50 条告警 + Bot/类型过滤 |
| `/diagnose` | ✅ | task id → session + events 时间线 |
| `/reports` | ✅ | 5 维度 + 时间范围 + Recharts |
| `/cost` | ✅ | 总成本 + 按维度 + 每日明细 |
| `/audit` | ✅ | actor/action/ip + 条数限制 |
| `/oauth-clients` | ✅ | CRUD + secret 一次性显示 + revoke |
| `/permissions` | ✅ | 4 角色 × 24 scope 矩阵 |
| `/memory` | ✅ | 占位(API internal key) |
| `/voice` | ✅ | 占位(STT + Agent + TTS 说明) |
| `/settings` | ✅ | 9 Section 卡片导航 |
| `/settings/users` | ✅ | 完整 CRUD(真后端 API) |
| `/settings/bots` | ✅ | 简表(从 agents API) |
| `/settings/projects` | ✅ | 占位(文件浏览器 mock) |
| `/settings/coordinator` | ✅ | 占位(飞书群 + bot) |
| `/settings/chain-editor` | ✅ | 占位(Gate/Step/Intent/Guard) |

### Sidebar 7 组分类
1. **工作台**(2): 总览 / Agent
2. **资源池**(3): 模型池 / KB / Skill-MCP
3. **监控**(3): 实时状态 / 预警中心 / 异常诊断
4. **运营**(4): Channel / 报表 / 成本 / 审计
5. **权限**(2): OAuth Client / Permissions
6. **系统**(7): Bots / Projects / Coordinator / ChainEditor / Memory / Voice / 设置

### 通用工具
- `lib/auth.ts` — JWT 持久化(localStorage 三键 token/refresh/user)
- `lib/api.ts` — fetch wrapper(自动 Bearer + 401 自动跳转登录)
- `lib/use-polling.ts` — 自动轮询 hook
  - 可配置 intervalMs(60s Dashboard / 30s Status / 60s Alerts)
  - 切 tab 自动暂停(visibilitychange)
  - 手动 refresh + nextIn 倒计时
- `lib/utils.ts` — cn() class merge

### shadcn 组件(完整 ui/)
button / card / dialog / drawer / sheet / tabs / badge / input / label /
dropdown-menu / avatar / separator / scroll-area / table / chart / skeleton /
select

### 主题
- tweakcn AstroVista (`cmlk6zefr000004lbe9jygsqc`)
- 字体: Outfit + Fira Code (next/font/google)
- oklch 配色 + 深/浅双模式

### 修过的后端 SQL bug
1. `monitoring-routes.ts` × 3:
   - `mv_usage_reports_daily.date = CURRENT_DATE` → TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD')
   - `alerts.message` 不存在 → `error_message`, `created_at` → `timestamp`(bigint)
   - `diagnose` chat_sessions.name → `bot_name`, created_at → `last_used`
   - `errorsRes` timestamp bigint 比较
2. `ops-routes.ts` × 2(cost):
   - mv 没 `cost_usd` 列 → fallback `usage_reports` 原表
   - date varchar 比较 → TO_CHAR 转换

### pm2 启动配置
```js
// apps/web-next/ecosystem.config.cjs
{
  name: "web-next",
  script: "node_modules/next/dist/bin/next",
  args: "start -p 3200 -H 127.0.0.1",
  cwd: "/home/ubuntu/panmira-N1/apps/web-next",
  exec_mode: "fork",
  env: { NODE_ENV: "production", PORT: "3200" }
}
```

### next.config.ts 关键配置
```ts
{
  basePath: "/web-next",
  trailingSlash: true,
  allowedDevOrigins: ["deepx.fun", "*.deepx.fun", "localhost", "127.0.0.1"]
}
```

### 完整 commit 链(main 分支)
- `948e9db5` merge: Phase 1-7 Next.js MVP 上线
- `7751f767` fix(backend): monitoring + ops SQL bugs
- `8052d57c` merge: Phase 1-6 Next.js MVP (22 路由 + sidebar + polling)
- `b9e9539d` feat(web-next): Phase 6 续 · Status + Alerts polling
- `652b4dbf` feat(web-next): Phase 6 · Dashboard 60s 自动刷新
- `c71a575f` feat(web-next): Phase 5 · Settings 4 占位 Section
- `465e4614` feat(web-next): Phase 4 · Settings 总览 + Users CRUD
- `4d1eab94` docs(handoff): Phase 3 完整功能迁移完成
- `37276577` feat(web-next): Models status toggle 补
- `552fd5a2` feat(web-next): Memory + Voice 占位
- `7b9e2ed4` feat(web-next): Permissions 4×24 矩阵
- `4f74a376` feat(web-next): OAuth Client + sidebar
- `70a9ac92` feat(web-next): Audit 审计日志
- `32c416d7` feat(web-next): Cost 成本分析
- `cfcea27b` feat(web-next): Reports 资源报表
- `08258bfa` feat(web-next): Diagnose 异常诊断
- `7b5be371` feat(web-next): Alerts 预警中心
- `d09a8c6f` feat(web-next): Resources MCP + Plugin
- `7ff188e3` feat(web-next): Status 实时状态
- `6602cc94` feat(web-next): Channel 路由绑定
- `85b3c868` feat(web-next): KB CRUD + 检索测试
- `38f779a9` feat(web-next): Models LLM + Embedding
- `429bd3e2` deploy: pm2 + nginx 生产部署
- `19f2485a` feat(web-next): Agent 完整 CRUD
- `11a3e1f8` feat(web-next): Dashboard 7 卡 + 趋势
- `25bdd8bd` ui(web-next): sidebar 分组 + 面包屑
- `fa6fc541` feat(web-next): AdminShell + 登录
- `38b9f32d` feat(web-next): Next.js 16 + shadcn + tweakcn

### 关键文件路径
- 主仓库: `/home/ubuntu/panmira`(main 在此)
- 旧 worktree: `/home/ubuntu/panmira-N1`(开发用,可清理)
- apps/web-next: `apps/web-next/`(新前端)
- pm2 配置: `apps/web-next/ecosystem.config.cjs`
- nginx: `/etc/nginx/sites-enabled/hlzd.conf`
- handoff 文档: `.claude/handoff-2026-07-{06,07}-*.md`

### 变更统计
- 411 files changed
- 43,513 insertions
- 4,584 deletions

### 待办(后续 plan)
1. **Channel 完整实体**(等 plan B 资源池)
   - 当前用 `routing_bindings` 表(groupId/pattern/targetBots)
   - 完整需要 `channels` 表(type/team_id/config/agent_ids/health_status)
2. **SettingsView 13 个 Section 的完整功能**
   - 当前 9 个 section 都是简表/占位
   - 原 BotsSection/ChainEditor 是复杂内部 state 编辑器
3. **Memory 完整 CRUD viewer**(API 需 internal key 鉴权)
4. **Voice 流式会话**(需 RTC SDK 集成)
5. **⌘K 命令面板**(nommira 风格 — 全局搜索 + 跳转)
6. **Dashboard 加更多图表**(CPU/延迟/错误率分布)
7. **polling 间隔可配置**(用户设置)
8. **KB Agent 页也加 polling**(实时数据)

### 上下文恢复指引
下次会话开头:
1. 读 `.claude/handoff-2026-07-07-panmira-NextJS-MVP-FINAL.md`(本文)
2. `ssh mah` → `pm2 list` 看到 web-next online
3. 浏览器访问 `https://deepx.fun/web-next/login/`
4. 用 `admin@panmira.com` / `admin123` 登录
5. 检查 22 路由全部能进,验证 Dashboard polling 工作

### 重启指引
```bash
# 重启后端
pm2 restart panmira
# 重启前端
pm2 restart web-next
# 重启 nginx
sudo nginx -s reload
# 查看状态
pm2 list
curl -sI https://deepx.fun/web-next/dashboard/
```

### 删除旧 worktree(可选)
```bash
git worktree remove /home/ubuntu/panmira-N1
git branch -D feat/nextjs-mvp  # 分支已 merge
```
