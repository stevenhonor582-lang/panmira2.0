# R43 People Card 真修复 - 2026-07-10

## 用户反馈 (3 个真问题 + 1 隐藏)

1. 星标 ⭐ 还在 steven 卡头上 — admin@panmira.com 没拿到
2. 4 列布局不统一 — admin 卡只看到 2 列(0+✓, 0+本周 token)
3. steven 卡缺 "标记停用/标记离职" — 操作按钮只有 3 个
4. (隐藏) 数字员工 tab "复制为模板" 功能消失 — R42-FRONTEND 误删

## 根因分析

| 问题 | 根因 |
|------|------|
| 星标错位 | 后端 sanitizeUser 不返回 isSystem → 前端 fallback LEGACY_SYSADMIN_EMAIL = "20218181@qq.com" (碰巧 steven 邮箱) |
| 4 列不齐 | agentCount ?? "—" loading 时显示 —,其他 3 列显示 0 → 视觉少一列 |
| steven 缺按钮 | canSetStatus = ... && !isSysAdmin, isSysAdmin fallback 误判 steven 为系统管理员 → 按钮被禁 |
| 复制为模板 | R42-FRONTEND 误判 "后端无端点" 直接删,实际有 POST /api/v2/admin/agent-templates |

## 已修复

### 后端 (已在 c0e1aea WIP 提交里)
- src/api/routes/auth-routes.ts: sanitizeUser 加 isSystem: user.isSystem
- src/db/user-store.ts: User interface + mapRow 加 is_system 映射
- dist/api/routes/auth-routes.js + dist/db/user-store.js 同步 patch

### 前端 (本次 commit dc40d67)
- apps/web-next/lib/auth.ts: AuthUser 加 isSystem?: boolean
- apps/web-next/app/(app)/overview/_components/person-card.tsx:
  - 新增 dataBarLoading 派生: stats === null || agentCount === null
  - 4 列统一: loading 时都显示 "—" (灰),加载完才显示实际值
  - steven 缺按钮: isSystem 真值生效后自动启用
- apps/web-next/app/(app)/overview/people/[id]/_components/person-tabs.tsx:
  - 恢复 "复制为模板" DropdownMenuItem
  - handleCopyAsTemplate: 拉 GET /api/v2/employees/:id → POST /api/v2/admin/agent-templates 投 snapshot
  - acting 状态从 boolean 改 string | null
  - useToast 引入,加 lucide Copy icon

## Rebuild + Reload

```bash
cd /home/ubuntu/panmira-N1/apps/web-next
rm -rf .next
npm run build  # BUILD_ID: ilXTA3yZLnl0DK9xUTBwbFri (16:24)
pm2 reload web-next  # pid 410094 online
pm2 reload panmira   # pid 410120 online
```

## 后端 API 验证

- admin@panmira.com → isSystem=true ✓
- 20218181@qq.com (steven) → isSystem=false ✓
- /api/auth/me, /api/auth/users 都带 isSystem ✓

## E2E 验证

- r17-2 · 01 卡片可点 + 无三点菜单 → PASS
- r17-2 · 02 点击卡片进入详情 → PASS
- r17-2 · 03 → FAIL (pre-existing, 找 aria-label="编辑基础信息" 不存在,与本次无关)

## 状态

- HEAD: dc40d67
- 改动: 3 files / +88 / -19
- 风险: 低 (前端纯展示逻辑 + 1 个端点对接,后端只多返 1 个字段)

## 已知遗留

- 用户当前登录 session 还在用旧 localStorage (无 isSystem),刷新或重登录才拿到 isSystem
- dist/ 是 gitignored,下次 npm run build 才会重编译 src 改动
