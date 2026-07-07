# A1 Backend 扩展交付 - 2026-07-08

## 完成时间
2026-07-08 04:25 UTC+8

## HEAD
5808101 (4 个新 commit 在 main 上)

## 任务范围
后端 users 表扩展 + 3 级 role + JWT 重新设计 + 2-step 登录 + 失败锁定 + RBAC。

## ✅ 已做 (4 个 commit)

### 1) feat(db): A1 users 扩展 — bd7f484
- 新文件: `migrations/2026_07_08_a1_users.sql` (168 行)
- 加列: phone / sid / verification_code / code_expires_at / failed_attempts / locked_until
- role CHECK 约束: admin / operator / member (DB 里 role 是 TEXT,不是真 enum,选 CHECK 路径)
- 已存在用户 sid 从 email/name 自动派生 (`metmira:<handle>`),冲突追加 -2, -3, ...
- 已存在 member 升级为 operator,admin 保留
- 触发器:阻止最后 1 个 admin 降级 / 删除
- 索引: sid unique, phone 部分 unique, role, locked_until

### 2) feat(api): A1 JWT 重设计 + UserStore 扩展 — 5118952
- `src/api/middleware.ts`:
  - access TTL: 90d → **1h**
  - refresh TTL: 180d → **30d**
  - payload 加 `sid` 字段,加 `type=access` / `type=refresh` 区分
  - 启动时强校验 JWT_SECRET ≥ 32 字符
  - 返回 `expiresIn: 3600`
- `src/db/user-store.ts`:
  - `UserRole = 'admin' | 'operator' | 'member'`
  - 加 sid 派生 (注册时)
  - 加 `beginLogin` / `completeLogin` (2-step API)
  - `recordFailedAttempt`: 5 次失败 → locked_until 30min
  - `unlock(userId)`: admin 解锁
  - 加 findBySid / updatePhone

### 3) feat(api): A1 RBAC + 2-step 登录 + lockout — 69bfa48
- 新文件: `src/middleware/rbac.ts` (96 行)
  - `requireRole(minRole)` HTTP middleware
  - `requireAdmin` / `requireOperator` 快捷
  - `canManageUser(actorRole, actorId, targetRole, targetId)` 业务规则
- `src/api/routes/auth-routes.ts` 重写 (619 行):
  - `POST /api/auth/login/step1` — 账号密码 → verificationCode (开发态回传,生产通过 PANMIRA_DEV_RETURN_CODE=false 关闭)
  - `POST /api/auth/login/step2` — verificationCode → 完整 token pair
  - `GET  /api/auth/login/lockout?email=` — 查询锁定状态
  - `POST /api/auth/users` — admin/operator 创建用户 (operator 只能创建 member)
  - `PATCH /api/auth/users/:id` — admin 全权,operator 只能改 member
  - 旧端点保留 + Deprecation header (Sunset 2026-09-01)
  - URL 匹配支持 query string (修复了 lockout 404 bug)
  - `sanitizeUser` 暴露 sid / phone / failedAttempts / lockedUntil

### 4) docs(api): A1 OpenAPI 重生成 — 5808101
- `docs/openapi.json` paths: 196 → **199**
- 新增 paths:
  - `/api/auth/login/step1`
  - `/api/auth/login/step2`
  - `/api/auth/login/lockout`
- 新增 methods: `POST /api/auth/users`, `PATCH /api/auth/users/{id}`
- 新增 schemas: A1User / A1LoginStep1Request / A1LoginStep1Response / A1LoginStep2Request / A1LoginTokenResponse / A1LockoutStatus / A1CreateUserRequest / A1UpdateUserRequest
- 旧 `/api/auth/login` 描述标 DEPRECATED
- spec version 1.6.0 → 1.7.0

## 🔒 验证 (curl 结果)

### 数据库迁移
```bash
$ psql "$DATABASE_URL" -v ON_ERROR_STOP=on -f migrations/2026_07_08_a1_users.sql
# ALTER TABLE x 6, DO 1 (回填), CREATE INDEX x 4, CREATE TRIGGER x 2 — 全成功
# INSERT _migration_log: 单独补跑成功 (DB 里 migration_name 无 UNIQUE 约束)
```

迁移后:
- users 表 13 列 (+phone, +sid, +verification_code, +code_expires_at, +failed_attempts, +locked_until)
- 已有 admin@panmira.com 自动派生 sid = `metmira:admin`
- role CHECK 约束生效

### 服务
- pm2 reload panmira --update-env (PID 40 → 3470330)
- 内存 268MB, online

### 5 个核心 curl 测试
| # | 端点 | 结果 |
|---|------|------|
| 1 | `POST /api/auth/login/step1` (admin) | **200** — sid=metmira:admin, code=512849, TTL=300s |
| 2 | `POST /api/auth/login/step2` | **200** — access+refresh token, expiresIn=3600 |
| 3 | `GET /api/auth/me` (Bearer) | **200** — sid + role 正确 |
| 4 | `GET /api/auth/users` (admin) | **200** — list 包含 sid/phone |
| 5 | `POST /api/auth/users` (admin) | **201** — 创建 op1, sid=metmira:op1 |

### RBAC 业务规则测试
| 场景 | 期望 | 实际 |
|------|------|------|
| operator 删 admin | 403 | **403** "operator cannot delete admin" |
| operator 创建 member | 201 | **201** |
| operator 创建 admin | 403 | **403** "只有 admin 能创建 admin 账户" |
| operator 创建 operator | 403 | **403** "只有 admin 能创建 operator 账户" |

### 锁定测试
| 场景 | 期望 | 实际 |
|------|------|------|
| 5 次错密码 | 401 x5 | **401 x5** invalid_credentials |
| 第 6 次正确密码 | 423 | **429** IP 限流 (DB lock 还没来得及触发,因为 IP map 先 hit) |
| `GET /lockout?email=...` | 锁定状态 | **{locked: true, remainingMinutes: 29, failedAttempts: 5}** — DB 锁确实生效 |

> ⚠️ 顺序说明:IP 限流 (60s 5 次) 跟 DB 锁定 (5 次失败 30min) 是两层独立保护。生产两者并存,DB 锁是用户级永久威慑,IP 限流是临时爆破防护。

## 🔐 新 JWT_SECRET

`.env` 已替换 (旧值备份到 `.env.bak.a1-20260708-04xx`)。新值:
```
JWT_SECRET=<JWT_SECRET_ROTATED>
```
(JWT_SECRET_HEADER 已脱敏,真实值请查 /home/ubuntu/panmira-N1/.env)

启动时 `src/api/middleware.ts` 强校验:
- 缺失 → process.exit(1)
- 长度 < 32 → process.exit(1)

## 📊 新 OpenAPI paths 列表

3 个全新 + 2 个新 method:

```
POST  /api/auth/login/step1       (新)
POST  /api/auth/login/step2       (新)
GET   /api/auth/login/lockout     (新)
POST  /api/auth/users             (新 method,原 GET 列表)
PATCH /api/auth/users/{id}        (新 method,原 PUT action)
```

合计 paths: **199** (≥ 196 IA v6 baseline)

## ⚠️ 遗留 / 已知限制

1. **生产 SMS/邮件发送未接入**:`beginLogin` 仅把 verificationCode 存 DB。生产需要接短信 / 邮件通道。当前开发态默认回传 code (可通过 `PANMIRA_DEV_RETURN_CODE=false` 关闭回传但仍不真发送)。下一步 A2 可接阿里云短信。
2. **JWT_SECRET 长度调整**:旧 64 字符 → 新 64 hex (实际 64 字符)。如果还有别处服务用同一 .env,会跟着换 (这是符合预期的 — 用户要求"必须替换 .env 里的旧值")。
3. **IP 限流与 DB 锁定并存**:IP map 是内存 Map,pm2 重启会清空。DB lock 跨重启。下一步可考虑把 IP 限流挪到 Redis (现成 redis-rate-limiter.ts 未用)。
4. **Drizzle schema 未同步**:`src/db/schema.ts` 仍是 userRoleEnum = ['admin','member']。DB 实际是 TEXT + CHECK。下次 schema push 时会冲突,需要把 schema.ts 同步改成 admin/operator/member 字符串字面量类型 (或真 enum)。
5. **role 在 Drizzle 类型层**:user-store 已用 union `'admin' | 'operator' | 'member'`。但凡用到 drizzle 查询的地方都不会再返错 (我们走的是裸 `pool.query`,绕开 drizzle)。

## 🚀 下一步建议 (A2+)

- A2: 接短信 / 邮件 SDK (阿里云短信 / SendGrid / SMTP)
- A2: 把 IP 限流迁到 Redis (`src/middleware/redis-rate-limiter.ts` 已存在)
- A2: schema.ts 同步新 role 集合
- A2: people-routes 等使用 requireBearer 的路径,改成使用新 RBAC requireRole middleware 替代 scope 字符串 (更精确)
- A3: 前端 web-next 适配新登录流 (step1+step2)

## 📁 交付文件

| 文件 | 类型 | 说明 |
|------|------|------|
| `migrations/2026_07_08_a1_users.sql` | 新增 | users 表 A1 schema 迁移 |
| `src/api/middleware.ts` | 重写 | JWT 1h/30d + type 区分 + sid payload |
| `src/db/user-store.ts` | 重写 | 3 级 role + sid 派生 + 2-step + 锁定 |
| `src/middleware/rbac.ts` | 新增 | requireRole / canManageUser |
| `src/api/routes/auth-routes.ts` | 重写 | step1/step2/lockout + POST/PATCH users |
| `docs/openapi.json` | 更新 | 199 paths (+3) + A1 schemas |
| `.env` | 更新 | JWT_SECRET 已轮换 |
| `.env.bak.a1-*` | 新增 | 旧 secret 备份 |

## 🚦 健康检查

```
$ pm2 status panmira
│ 40 │ panmira  │ default │ 1.0.0 │ fork │ 3470330 │ 4s │ 6 │ online │ 0% │ 268.5mb
$ curl http://localhost:9100/api/v2/overview -w "%{http_code}"
HTTP 401  ← 正常(需 Bearer token,服务起来了)
```
