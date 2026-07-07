# SECURITY · 凭证管理与敏感信息保护

> **生效日期**: 2026-07-08
> **适用范围**: Panmira IA v6 全栈(后端 / web-next / DB / 第三方)

---

## 1. 历史事件

### 1.1 JWT_SECRET 泄漏(P0,2026-07-08)

**位置**: commit `8facc3a` 之前的 `ecosystem.config.cjs` 包含真实凭证。

本节仅说明事件性质,不重复粘贴泄漏值。如需取证请直接查 git 历史:

```bash
git show 8facc3a^:ecosystem.config.cjs
```

涉及敏感键(具体值见 git 历史,本文档不复述以避免二次泄漏):

- `JWT_SECRET`
- `API_SECRET`
- `ENCRYPTION_KEY`
- `ANTHROPIC_AUTH_TOKEN`
- `OPENAI_API_KEY`
- `NEXTCRM_SYNC_TOKEN`

### 1.2 处理动作(本 P6 收尾完成)

| # | 动作 | 状态 |
|---|------|------|
| 1 | **ROTATE** —— 改用新 `JWT_SECRET`(起头) | 已做 |
| 2 | **ROTATE** —— 改用新 `ENCRYPTION_KEY` | 待办(见 §4) |
| 3 | **ROTATE** —— `ANTHROPIC_AUTH_TOKEN` | 待办(见 §4) |
| 4 | **ROTATE** —— `OPENAI_API_KEY` | 待办(见 §4) |
| 5 | **ROTATE** —— `NEXTCRM_SYNC_TOKEN` | 待办(见 §4) |
| 6 | **ROUTE** —— 全部真实值只放 `.env`(gitignored) | 已做 |
| 7 | **ROUTE** —— backend 启动时由 `dotenv/config` 加载 `.env` | 已做(本 P6 commit) |
| 8 | **DOC** —— 本 `.claude/SECURITY.md` 警告 | 已做 |
| 9 | **DOC** —— `.env.example` 仅占位 | 已存在 |
| 10 | **NOT DO** —— **不**重写 git history | 主动决策 |

> 决策理由:不重写历史 = 团队 hash chain 不断 = git blame / log / 工具链安全。重写历史需要 force-push,会导致所有本地 checkout 不同步。生产上 **ROTATE** 是更彻底的止血,git history 只是信息泄露痕迹。

### 1.3 未来凭证泄漏应急

```bash
# Step 1: 立刻 rotate
NEW=$(openssl rand -hex 32)
# 替换 .env 中的 JWT_SECRET=<NEW>

# Step 2: pm2 重启
pm2 restart panmira

# Step 3: 验证
curl -X POST http://localhost:9100/api/auth/login -d '{...}'

# Step 4: 通知用户旧凭证失效,可能需要全员重新登录
```

---

## 2. 凭证分类与存放

### 2.1 真实凭证(必须放 `.env`,gitignore 严禁)

| Key | 用途 | 长度要求 | 旋转频率 |
|-----|------|---------|---------|
| `JWT_SECRET` | 签发登录 JWT | 32 字节 hex | 90 天 |
| `API_SECRET` | 内部 API 共享密钥 | 32 字节+ | 90 天 |
| `ENCRYPTION_KEY` | 数据库字段加密 | 64 位 hex | 不定期 |
| `ANTHROPIC_AUTH_TOKEN` | 智谱 / Anthropic API | sk- 前缀 | 90 天 |
| `OPENAI_API_KEY` | SiliconFlow | sk- 前缀 | 90 天 |
| `NEXTCRM_SYNC_TOKEN` | NextCRM 同步 | hex | 90 天 |

### 2.2 配置型(可留 ecosystem.config.cjs 或 .env)

```cjs
DATABASE_URL   // postgresql://...
API_PORT       // 9100
NODE_ENV       // production
LOG_LEVEL      // info
```

### 2.3 公网可见配置(NEXT_PUBLIC_*)

```cjs
NEXT_PUBLIC_API_BASE  // 公开,仅域名/端口
```

---

## 3. 开发者守则(强制)

### 3.1 绝不允许

- ❌ 直接 `git add .env`
- ❌ 在 commit message / PR description / issue 里贴真实值
- ❌ 在 PR review / Slack / 公开 channel 转贴 `cat .env` 输出
- ❌ 用同一份凭证跨 dev / staging / prod

### 3.2 必须做到

- ✅ 新增凭证先加到 `.env.example`(占位),运维手动注入真实值到 `.env`
- ✅ 提交前 `git status --short` 检查,看到 `.env` 必须停下
- ✅ `.env.example` 提交,真实 `.env` 永不入库
- ✅ 团队 onboarding 时由运维当面 / 加密 channel 传送 `.env`

### 3.3 pre-commit 检查清单

```bash
git status --short                   # 应看不到 .env
git grep "JWT_SECRET=" \             # 应只在 .env.example 看到占位
  ':!.env' ':!.env.bak.*' \
  ':!.claude/SECURITY.md'
```

---

## 4. 待办(Owner: 运维 / 创始人)

| # | 凭证 | 动作 | 预计完成 | 阻塞 |
|---|------|------|---------|------|
| 1 | ENCRYPTION_KEY | rotate 新值并保留旧解密回退 | 2026-07-15 | 数据迁移兼容性 |
| 2 | ANTHROPIC_AUTH_TOKEN | 智谱后台撤销并签发新 | 2026-07-09 | API 调用中断 |
| 3 | OPENAI_API_KEY | SiliconFlow 控制台 rotate | 2026-07-09 | embedding 中断 |
| 4 | NEXTCRM_SYNC_TOKEN | NextCRM 重新签发 | 2026-07-15 | CRM 同步中断 |

> **注**:`ANTHROPIC_*` / `OPENAI_*` 是第三方平台,rotate 必须先在第三方后台操作,再更新 `.env`。

---

## 5. 审计与监控

### 5.1 历史泄漏面扫描(只查阅,不输出真实值)

```bash
git log --all -p -S 'JWT_SECRET='
git log --all -p -S 'ANTHROPIC_AUTH_TOKEN='
git log --all -p -S 'sk-'
```

### 5.2 监控项

- [ ] CI 增加 `git diff` 阶段拒收含 `sk-` 或 `JWT_SECRET=` 的 PR
- [ ] GitHub 启用 secret scanning + push protection
- [ ] 定期 rotate(每 90 天提醒)
- [ ] 异常登录 alert(后台 access log)

---

## 6. 引用

- OWASP 凭证管理: https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html
- 项目根 `.gitignore` 已 block `.env` / `.env.*`(除 `.env.example`)
- 本文件配套 `.env.example`

---

_本文档由 P6 收尾专家于 2026-07-08 起草,作为完整重构交付物的一部分。_
