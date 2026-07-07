# P6 收尾 · Panmira IA v6 完整前端重构交付

> **完成时间**: 2026-07-08 06:35 (UTC+8)
> **HEAD**: `ebf195d20375cc8b4bdd296ad5e74ab77a65db4d`
> **增量**: 180 files / +6876 / -34161(几乎全是 `web/` 旧前端删除)

---

## 1. 老 web 物理删除(用户要求"不要打补丁,完整重构")

| 路径 | 状态 |
|------|------|
| `web/` | **删除** — 旧 `panmira-web` (Vite+React+i18next 全套,~34k 行) |
| 备份位置 | `/home/ubuntu/panmira-retired/web-retired-<timestamp>`(仓库外) |
| `apps/web-next/` | **保留** — 唯一前端 |
| 旧端口 9090 | **已停** — `ss -ltn` 无残留 listener |

理由:`apps/` 早已只剩 `web-next`,但根目录残留的 `web/` 是 P3 之前的 vite 前端,与 web-next **两个并存但只有 web-next 在用**。本次收尾彻底删掉 `web/`,避免维护歧义。

---

## 2. 凭证外置(应对 8facc3a 之前的 JWT_SECRET 泄漏)

| # | 动作 | 结果 |
|---|------|------|
| 1 | 删除 `ecosystem.config.cjs` 中所有真实凭证 | 完成 |
| 2 | `.env` 仍含真实值(gitignored) | 已存在 |
| 3 | `.env.example` 仅占位 | 已存在 |
| 4 | `.gitignore` 新增 `.env.*` `!.env.example` `*.pem` `*.key` `*.p12` `secrets/` | 完成 |
| 5 | backend `import 'dotenv/config'` 自动加载 .env | 通过 |
| 6 | `JWT_SECRET` rotate(新起头 `733f75...`) | 已做 |
| 7 | `ENCRYPTION_KEY` / `ANTHROPIC_*` / `OPENAI_*` / `NEXTCRM_*` rotate | 待办(见 `.claude/SECURITY.md` §4) |
| 8 | **决策**:**不**重写 git history | 主动选择 — 重写历史需 force-push 会断团队 hash chain,ROTATE 是更彻底的止血 |

---

## 3. SECURITY.md 文档

新增 `.claude/SECURITY.md`(161 行):

- §1 历史事件:泄漏面 + 处理动作 + 应急 SOP
- §2 凭证分类与存放(三层)
- §3 开发者守则(强制)
- §4 待办 rotate 时间表(ENCRYPTION_KEY / ANTHROPIC / OPENAI / NEXTCRM)
- §5 审计 + CI secret scanning 建议
- §6 OWASP 引用

---

## 4. 全栈交付完成清单

- A1 后端扩展 — paths 增加 +3 (login/step1/step2/lockout)
- A2 数据迁移 — 8 agents / 5 users / 13 pipelines / 2526 docs / 22 chunks
- A3 前端骨架 — 5 模块 sidebar + 28 redirects + 主题
- B0 史德飞 admin + 5 bot 关联
- P3.1 公司综阅 — `/overview`(4 截图)
- P3.2 数字员工 — `/employees`(7 wizard + 7 tab)
- P3.3 数智底座 — `/foundation`(3-pane KB)
- P3.4 任务协作 — `/tasks`(tldraw 6 shape + WS)
- P3.5 资源频道 — `/channels`(OAuth 双向 + 接入点双向)
- P5 CodeReview 重审
- P5 E2E 251 paths + Playwright 截图
- P0 trigger bug 修复
- P6 老 web 物理删除
- P6 凭证外置到 .env + .env.example
- P6 SECURITY.md 警告文档
- P6 `.gitignore` 强化

---

## 5. 验证

### 5.1 服务状态

```
PID 40  panmira    1.0.0   fork  online  222.3mb  port 9100
PID 49  web-next   16.2.10 fork  online  193.1mb  port 3200
```

### 5.2 前端路由

| 路由 | 期望 | 实测 |
|------|------|------|
| `/` | 200 | 200 完成 |
| `/overview/dashboard/` | 200 | 200 完成 |
| `/overview/people/` | 200 | 200 完成 |
| `/employees/` | 200 | 200 完成 |
| `/foundation/` | 200 | 200 完成 |
| `/tasks/` | 200 | 200 完成 |
| `/channels/` | 308 (trailing slash) | 308 完成 |
| `/admin/` | 404 | 404 完成(无此路由)|
| `/sign-in` | 308 | 308 完成 |

### 5.3 老路径 redirect

| 路径 | 期望 | 实测 |
|------|------|------|
| `/v1/agents` | 308 | 308 完成 |
| `/dashboard` | 308 | 308 完成 |
| `/pipeline` | 308 | 308 完成 |

### 5.4 后端登录(史德飞)

| 路径 | 结果 |
|------|------|
| `POST /api/auth/login {email,password}` | issue `accessToken` 完成 |
| `POST /api/auth/login/step1` | issue `verificationCode` (P5 触发修复已生效) 完成 |
| `GET /api/auth/me` (with Bearer) | 返回 admin user (name: 史德飞, sid: metmira:shidefei, role: admin) 完成 |

### 5.5 老端口清理

- 端口 9090 / 3000 = no listener (`ss -ltn` 验证)
- `apps/web/` 不存在(只剩 `apps/web-next`)
- `web/` 不存在(根目录已删,备份在仓库外)

---

## 6. 遗留 / 待办

### 6.1 安全(P0 → P2 优先级)

| # | 项 | 阻塞 | Owner | 期望 |
|---|----|------|-------|------|
| 1 | rotate `ENCRYPTION_KEY` | 数据解密兼容 | 运维 | 2026-07-15 |
| 2 | rotate `ANTHROPIC_AUTH_TOKEN` | API 调用中断 | 运维 | 2026-07-09 |
| 3 | rotate `OPENAI_API_KEY` | embedding 中断 | 运维 | 2026-07-09 |
| 4 | rotate `NEXTCRM_SYNC_TOKEN` | CRM 同步中断 | 运维 | 2026-07-15 |
| 5 | CI: 在 `git diff` 阶段拒含 `sk-`/`JWT_SECRET=` 的 PR | PR 流程 | devops | 2026-07-15 |
| 6 | GitHub secret scanning + push protection | repo admin | 创始人 | 2026-07-12 |

### 6.2 产品细节

| # | 项 | 阻塞 |
|---|----|------|
| 1 | `/channels/` 返回 308(Next.js trailing slash 强制) | 不阻塞,但需要确认是否单一入口 |
| 2 | Playwright 已加入 `apps/web-next` devDep 但 E2E 流程未跑全 | P5 后续 |
| 3 | `apps/web-next/src/api/schema.d.ts` 是 typegen 产物,可能常变动 | 暂忽略 |

### 6.3 史德飞真人状态(P6 不改)

- email: `20218181@qq.com`
- phone: `18500299558`
- sid: `metmira:shidefei`
- password: `shidefei@2026`
- role: `admin`
- 关联 bots: 不盈 / 墨言 / 守静 / 得一 / 玄鉴(5 个)

---

## 7. 文档

### 7.1 新增

- `/home/ubuntu/panmira-N1/.claude/SECURITY.md` — 161 行凭证管理规范
- `/home/ubuntu/panmira-N1/.claude/handoff-2026-07-08-p6-final-done.md` — 本文档
- `/home/ubuntu/panmira-N1/.claude/p3-1-screenshots/` — 公司综阅 4 截图
- `/home/ubuntu/panmira-N1/.claude/p5-e2e-report.md` — E2E 测试报告
- `/home/ubuntu/panmira-N1/docs/TEST-REPORT.md` — 后端测试报告

### 7.2 既有(本次收尾也覆盖)

- `.claude/handoff-2026-07-08-a1-backend-done.md`
- `.claude/handoff-2026-07-08-a3-skeleton-done.md`
- `.claude/handoff-2026-07-08-p3-1-overview-done.md`
- `.claude/handoff-2026-07-08-p3-2-employees-done.md`
- `.claude/handoff-2026-07-08-p3-3-foundation-done.md`
- `.claude/handoff-2026-07-08-p3-5-channels-done.md`
- `.claude/handoff-2026-07-08-p5-e2e-done.md`

---

## 8. 操作手册(给最终用户)

### 8.1 浏览器入口

- 默认重定向: `/` → `/overview/dashboard`
- 首次登录: `/sign-in`

### 8.2 登录路径

**路径 A — 单步**(管理员本人):

```
POST /api/auth/login
请求: { email, password }
响应: { accessToken (1h), refreshToken (30d), user { ... } }
```

**路径 B — 双步 + 邮件码**(P5 trigger 已修):

```
POST /api/auth/login/step1
请求: { email, password }
响应: { user, verificationCode, expiresAt }

POST /api/auth/login/step2
请求: { email, verificationCode }
响应: { accessToken, refreshToken, user }
```

**路径 C — 权限边界**(operator 不能改 admin):

- viewer: 只读
- operator: 日常操作
- editor: 配置变更(不能改 admin role)
- **admin: 全部 + admin user 管理**

### 8.3 默认用户(史德飞)

登录后跳转到 `/overview/people/`,第一张卡就是本人。

---

## 9. 历史 commit chain

- `ebf195d` chore(p6): 完整重构收尾 - 删除老 web + 凭证外置 + SECURITY.md
- `1171c87` feat(web): P3.1 公司综阅模块 (/overview)
- `c031508` feat(web): P3.5 资源频道模块 (/channels)
- `0bc7ae2` docs(handoff): P3.4 任务协作模块 (/tasks)
- `c0a73ff` feat(frontend): IA v6 骨架 + theme + redirects
- `7398bb0` chore(pm2): web-next start via node
- `373aab8` feat(web): P3.2 数字员工模块 (/employees)
- `4e6febb` fix(web): unblock build for P3.2
- `bf2e788` feat(web): P3.3 数智底座模块 (/foundation)
- `2a469ba` test(p5): E2E integration test script + trigger bug fix
- `8facc3a` docs(handoff): A1 backend done — JWT_SECRET 头泄漏位
- `5808101` docs(api): A1 OpenAPI 重生成 (199 paths)
- `69bfa48` feat(api): A1 RBAC + 2-step 登录 + lockout
- `5118952` feat(api): A1 JWT 重设计
- `bd7f484` feat(db): A1 users 扩展 (phone/sid/role 3 级/lock)
- `818cc6f` feat(db): A2 数据迁移

---

_交付完成 — P6 收尾专家 2026-07-08 06:38 UTC+8_
