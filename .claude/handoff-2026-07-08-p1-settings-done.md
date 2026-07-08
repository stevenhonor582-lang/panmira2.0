# P1 收尾 · Settings 3 个页面实装 + next.config env 注入 + 历史 pipelines 归档

> **完成时间**: 2026-07-08 (UTC+8)
> **HEAD 前**: `99b0454` (P0 完成,HEAD `ebf195d` 已含 P6 收尾)
> **HEAD 后**: 见 `git log` 三条 commit
> **增量**: 6 文件 / +约 850 行 / 0 删除

---

## 1. Settings 3 个页面实装 (Task 1)

### 1.1 新增共享组件

| 路径 | 作用 |
|------|------|
| `apps/web-next/components/settings/settings-subnav.tsx` | 顶部 dense-config subnav,镜像 `ChannelsSubnav`,3 个 tab: 权限 / 语音 / 高级 |
| `apps/web-next/components/settings/settings-shell.tsx` | 12 栅格 + 侧栏 meta + content,4px radius chrome,镜像 `ChannelsPageShell` |
| `apps/web-next/app/(app)/settings/layout.tsx` | 把 SettingsSubnav 注入路由组 |

设计风格: 4px radius / Geist Mono IDs / 三色 chip(role)、emerald/amber/rose 状态 pill、
红色 destructive variant for danger zone。**不动** A3 sidebar / topbar / theme。

### 1.2 /settings/permissions

```
[meta rail]  [content]
 total       Users table (DenseTable):
 admin       Name · Email · Role chip · Phone · Status · Locked Until · Action
 operator    Role dropdown (admin/operator/member,按 RBAC 矩阵禁用)
 member      - admin 不能改自己的 role (前端禁用,后端 canManageUser 兜底)
 locked      - operator 只能改 member;不能改 admin
 inactive    - unlock / 启用·停用 操作
             [+ 新增 operator/member] → modal
                  name / email / phone / role
                  POST /api/auth/users
```

**RBAC 矩阵** (前端镜像 + 后端 canManageUser 强制):

| 当前用户 | 可改目标 | 可创建角色 |
|----------|----------|------------|
| admin | operator / member(非自身) | operator / member |
| operator | member(非自身) | member |
| member | 只读 | 不能 |

后端 403 (例如「最后一名 admin 不可降级」) 直接以 toast 显示。

**API 合约**: `GET /api/auth/users` → `{users: A1User[]}` ;
`POST /api/auth/users` `{name,email,phone?,role,password}` → 201 ;
`PATCH /api/auth/users/:id` `{role?|phone?|isActive?|unlock?}` → 200 。

### 1.3 /settings/voice

```
[meta rail]  [content · 2 列]
 persona     ┌─ config ──────────┐  ┌─ test ──────────┐
 provider    │ provider(local/... │  │ sample phrase   │
 voice_id    │  /openai/11/edge) │  │ [测试]          │
 rate        │ voice_id input     │  │ last result pill│
 lang        │ sample rate select │  │ status/saved/   │
 saved       │ language select    │  │ persona mini    │
             └────────────────────┘  └─────────────────┘
             [both surfaces snapshot · 2 列对比]
```

每个 persona (真人 outbound / 数字员工 reply) 独立 config。

**存储**: `localStorage[panmira.voice.config.v1]` `{human, digital}`。
**测试**: `POST /api/tts` with current config + 固定 sample phrase。
**未做**: 后端 voice_settings 表(全局偏好,而非 per-browser)。

### 1.4 /settings/advanced

```
[meta rail]  [content]
 dev_mode    ┌─ toggles ──────┐  ┌─ danger zone ─────┐ (rose ring)
 verbose     │ 开发者模式       │  │ [重置确认] 红色    │
 ls_keys     │ 详细错误日志     │  │ [导出数据] outline │
 ls_size     └─────────────────┘  └────────────────────┘
 build       [system info · 4 列:server version/build hash/db version/uptime]
 uptime      [dev_mode=on 时显示:]
             [internal error log]  [ws events · last 50]
```

**重置逻辑**: 删除所有 `panmira.*` localStorage 键,
**保留** `panmira.token` / `panmira.refresh` / `panmira.user`(避免强制登出)。
**导出**: JSON 快照(已剔除敏感字段)。
**WS events**: 监听 `window.dispatchEvent(new CustomEvent('panmira:ws-event', ...))` 后端桥可对接。

---

## 2. next.config.ts env 注入 (Task 2)

### 2.1 改动

```ts
// 旧
async rewrites() {
  return [{ source: "/api/:path*", destination: "http://localhost:9100/api/:path*" }];
}

// 新
const backendBaseUrl = process.env.PANMIRA_BACKEND_URL ?? "http://localhost:9100";
async rewrites() {
  return [{ source: "/api/:path*", destination: `${backendBaseUrl}/api/:path*` }];
}
```

### 2.2 新增/更新文件

| 路径 | 内容 | git |
|------|------|-----|
| `apps/web-next/.env.web-next` | `PANMIRA_BACKEND_URL=http://localhost:9100` | **ignore** |
| `apps/web-next/.env.web-next.example` | 同上 + 注释说明 | **commit** |
| `apps/web-next/.gitignore` | 增加 `!.env.web-next.example` 例外 | commit |

### 2.3 验证

```bash
cd /home/ubuntu/panmira-N1/apps/web-next
PANMIRA_BACKEND_URL=http://localhost:9100 npm run build
# 期望: 0 error, 0 warning(除了 turbopack.root 无关警告)
```

✓ 实测 75 routes,settings 3 个静态预渲染。

```bash
curl /api/auth/users/  →  401
# 等价于直连 backend 9100 /api/auth/users/
# 证明: env 注入的反代正常工作,trailingSlash 保持一致。
```

---

## 3. 历史 3 个 pipelines 无主 → 史德飞 + archived (Task 3)

### 3.1 问题

```
select id, name, owner_id, status, created_at from agent_pipelines where owner_id is null;
                  id                  |          name           | owner_id | status |          created_at
--------------------------------------+-------------------------+----------+--------+-------------------------------
 140c8b32-f638-42e2-b5f2-740895d6a215 | e2e real llm test       |          | active | 2026-07-07 12:17:44.638933+08
 d3a58b5e-b4bf-4c9a-b326-ce378c36f505 | e2e parallel+retry test |          | active | 2026-07-07 13:06:36.081948+08
 12ce1fdb-d514-4e25-b529-6dd8e42aa9cb | L6 Test Pipeline        |          | active | 2026-07-07 18:01:30.227387+08
(3 rows)
```

3 个 e2e / L6 测试遗留 pipelines,owner 字段 NULL,生产界面会出现「无主资源」异常。

### 3.2 处理 (走方案 A:接管 + 归档)

```sql
BEGIN;
UPDATE agent_pipelines
SET
  owner_id = (SELECT id FROM users WHERE email = '20218181@qq.com' LIMIT 1),
  status = 'archived'
WHERE owner_id IS NULL;
COMMIT;
```

### 3.3 验证

```
pipelines           | 13
pipelines-archived  | 3
pipelines-no-owner  | 0
```

---

## 4. 整体验证

### 4.1 服务状态

```
PID 53  web-next    N/A      fork   online  23.0mb (重启后) port 3200
PID 52  panmira     1.0.0    fork   online  231.1mb           port 9100
```

### 4.2 前端路由

| 路由 | 期望 | 实测 |
|------|------|------|
| `/settings/permissions/` | 200 | **200** |
| `/settings/voice/` | 200 | **200** |
| `/settings/advanced/` | 200 | **200** |
| `/api/auth/users/` (rewrite) | 401(无 token) | **401** |
| `/api/auth/login/` | 401 | **401** |

### 4.3 DB view

| 实体 | 数量 |
|------|------|
| people | 5 |
| digital_employees | 7 |
| model_pool | 5 |
| endpoints | 5 |
| agents-active | 7 |
| users | 5 |
| pipelines | 13 |
| **pipelines-archived** | **3** |
| **pipelines-no-owner** | **0** |
| documents | 2526 |

### 4.4 Build

```
PANMIRA_BACKEND_URL=http://localhost:9100 npm run build
→ 75 routes 编译,0 error,0 业务 warning
```

---

## 5. 遗留 / 待办

| # | 项 | 阻塞 | Owner |
|---|----|------|-------|
| 1 | `panmira.voice.config` 后端持久化(voice_settings 表) | 用户偏好跨设备同步 | 待 P2 |
| 2 | `panmira:ws-event` 接入实际 WS 网关(目前仅前端 dev panel) | dev mode 完整可视化 | 待 P2 |
| 3 | 路由级 pre-flight: 拦截 `/api/*` 在 `app/(app)/*` 内(避免 SSR 期间 401 触发跳转) | 体验 | 待 P2 |
| 4 | R3 角色精细化(RBAC matrix 当前是 admin/operator/member 三段) | 场景扩展 | 待 P3 |

---

## 6. Git

### 6.1 Commits

```
feat(web): P1 settings 3 个页面实装 (/settings/permissions + /voice + /advanced)
fix(web): next.config rewrites 改 env 注入 (PANMIRA_BACKEND_URL)
feat(db): P1 pipelines 无主 → 史德飞 + archived (3 个)
```

### 6.2 改动文件清单

| 类别 | 文件 |
|------|------|
| **新建** | `apps/web-next/components/settings/settings-subnav.tsx` |
| | `apps/web-next/components/settings/settings-shell.tsx` |
| | `apps/web-next/app/(app)/settings/layout.tsx` |
| | `apps/web-next/app/(app)/settings/permissions/page.tsx` |
| | `apps/web-next/app/(app)/settings/voice/page.tsx` |
| | `apps/web-next/app/(app)/settings/advanced/page.tsx` |
| | `apps/web-next/.env.web-next.example` |
| **修改** | `apps/web-next/next.config.ts`(rewrites 改 env) |
| | `apps/web-next/.gitignore`(加 `!.env.web-next.example`) |
| **DB** | `agent_pipelines` 3 行 UPDATE(无 migration 文件,纯数据清理) |

---

## 7. 设计原则 (读 skill 后落地)

**Design Read 一行(P1 整体)**:
"Reading this as: B2B settings center for 数字员工平台 admin,
偏 dense-config / infrastructure 风格,tailwind utilities + Geist Mono +
restrained chrome + accordion + delete-confirm pattern + 数智底座 列控。"

实际落地选择:

- **不用 cards 堆** — meta rail 在侧、content 在主,12-col grid
- **危险动作** — destructive variant,红 ring + 红 bg + 二次确认 modal,默认 cancel
- **Geist Mono** — 所有 ID / email / token / 角色 / 时间戳
- **数据确认** — 修改前 modal 确认,默认 cancel(`doReset` 用 `setResetting`)
- **状态色** — `ok`(emerald)/ `warn`(amber)/ `err`(rose)/ `muted`(灰)/ `info`(sky)
- **Role chip** — admin violet / operator sky / member muted,1.5px dot
- **不动 A3 sidebar / topbar / theme / lib/auth / lib/api** — 完全保持原状