# P8 安全清理 · 凭证完全外置

**HEAD**: `167c42108e714745fcce966538e0b870034fac8a`
**基线**: `bbb329d` (P7 完成)
**日期**: 2026-07-08

---

## ✅ 已做

### 1. ecosystem.config.cjs 重写
- 移除硬编码: `JWT_SECRET` / `API_SECRET` / `ENCRYPTION_KEY` / `ANTHROPIC_AUTH_TOKEN` / `OPENAI_API_KEY` / `NEXTCRM_SYNC_TOKEN`
- 真凭证从 `/home/ubuntu/panmira-N1/.env` 加载 (gitignored)
- 仅保留非敏感 env: `NODE_ENV` / `API_PORT` / `LOG_LEVEL` / `MEMORY_ENABLED` / `PANMIRA_SOURCE_NAME` 等

### 2. handoff 文件 sed 清理
- `.claude/handoff-2026-07-08-a1-backend-done.md`: JWT_SECRET 真实值 → `<JWT_SECRET_ROTATED>`
- `.claude/handoff-2026-07-08-p7-fixed.md`: 同步 sed (untracked,仍清理)

### 3. pre-commit hook
- `.githooks/pre-commit`: 用 `git show :file` 检查 staged 内容 (不含删除行,避免误判清理 commit)
- 跳过 `.githooks/*` 自身 (包含 patterns by design)
- `git config core.hooksPath .githooks`

### 4. 验证 0 泄漏
```
ecosystem.config.cjs: ✓ CLEAN
.claude/: ✓ CLEAN (0 files)
```

### 5. 服务健康
- backend `/api/auth/me` → 401 (未授权,正常)
- frontend `/overview/dashboard/` `/employees/` `/tasks/new/` → 200 (HIT cache)
- 登录 `20218181@qq.com` → JWT 348 字符, `/me` 返回史德飞/admin/metmira:shidefei
- 5 view 数据全活: people=5 / digital_employees=8 / model_pool=5 / endpoints=5 / agents-active=7 / users=5 / pipelines=13 / documents=2526
- pm2: panmira + web-next 双 online,无 FATAL 重启

---

## ⚠️ 遗留 — 5 个凭证必须手动 rotate

git history 中的痕迹是"信息泄露痕迹",rotate 后**不再可登录**。请按以下顺序到对应平台重置:

| # | 凭证 | 平台 | 步骤 |
|---|------|------|------|
| 1 | `JWT_SECRET` | 自管(智谱) | `openssl rand -hex 32` → 写 `.env` → `pm2 reload panmira` |
| 2 | `ENCRYPTION_KEY` | 自管 | 需**旧值**解密回退(已轮换前的 .env.bak.a1-20260708-041518 备份);否则旧加密数据无法解密 |
| 3 | `ANTHROPIC_AUTH_TOKEN` | 智谱 (open.bigmodel.cn) | 撤销 `sk-<redacted>` → 申请新 key → 更新 `.env` |
| 4 | `OPENAI_API_KEY` | OpenAI/SiliconFlow | 撤销 `sk-<redacted>` → 申请新 key → 更新 `.env` |
| 5 | `NEXTCRM_SYNC_TOKEN` | NextCRM provider (crm.sites.panmira.cn) | 联系上游 rotate |

> **ROTATE 完成后**请把 .env.bak.a1-20260708-041518 从服务器删除(避免二次泄漏)。

---

## 📁 关键文件
- `/home/ubuntu/panmira-N1/ecosystem.config.cjs` — **不含** 任何真实凭证
- `/home/ubuntu/panmira-N1/.env` — gitignored,真凭证唯一来源
- `/home/ubuntu/panmira-N1/.githooks/pre-commit` — staged-content 防泄漏
- `/home/ubuntu/panmira-N1/.claude/SECURITY.md` — 已 P6 整理(P6 漏 ecosystem.config.cjs 已 P8 修)

## 下一步
- **用户**: 5 个凭证 rotate
- **P9 候选**: 监控 NextCRM 同步失败(`.claude/handoff-...p8` 显示 1 个 cron job pipeline 失败);数据目录清理;按需追加 SECURITY.md §1.4 承认 P6 遗漏。
