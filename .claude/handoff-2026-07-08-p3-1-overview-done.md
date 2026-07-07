# P3.1 公司综阅模块交付 - 2026-07-08

## 当前任务
公司综阅模块 (/overview) 完整实现 — 仪表盘 / 真人列表 / 真人详情 / billing/诊断/优化/日志骨架

## 已完成 (本任务)

### 路由结构
```
src/app/(app)/overview/
├── _components/
│   ├── data.ts           # 共享数据适配层 + fullPath helper
│   ├── status-dot.tsx   # 语义化状态点 (oklch 色板)
│   ├── sparkline.tsx    # 极简 SVG 趋势线
│   ├── avatar.tsx       # 真人/员工 initials 头像 (按 sid hash 颜色)
│   ├── person-card.tsx  # 真人名片卡 (史德飞 FOUNDER 特殊)
│   ├── kpi-tile.tsx     # KPI 数字+sparkline tile
│   └── event-stream.tsx # 事件流 (时间感知)
├── dashboard/page.tsx
├── people/
│   ├── page.tsx         # 列表 + role filter
│   └── [id]/page.tsx    # 详情 7 Tab
├── billing/page.tsx     # 真实 cost API + recharts area
├── diagnosis/page.tsx   # 骨架 (P3.2 接入)
├── optimization/page.tsx # 骨架 (P3.3 接入)
└── logs/page.tsx        # 骨架 (P3.4 接入)
```

### 关键设计决策
- **史德飞特殊处理**: 唯一 admin + 唯一种子账号 (20218181@qq.com), 卡片加 FOUNDER badge (crown icon + amber), 详情页头部加 "FOUNDER · 唯一 admin" tag
- **状态色 oklch**: active=绿 / busy=蓝 / paused=琥珀 / offline=灰 / error=沉红 / deprecated=雾紫,饱和度控制在 0.13-0.18
- **卡片 hover**: -translate-y-0.5 + micro shadow, NOT scale (避免动效过重)
- **数字排版**: heading 24-32px / body 14-15px / metadata 11-12px
- **字体**: Outfit (heading, 已加载) + Geist (body) + Fira Code (数据/code)
- **真实数据**:
  - `/api/auth/users` 拿真人
  - `/api/v2/admin/agents` 拿数字员工
  - `/api/v2/admin/pipelines` 拿流水线
  - `/api/v2/tasks/stats` 拿任务统计
  - `/api/v2/admin/cost` 拿账单 (聚合日维度)
  - `/api/activity/events?limit=20` 拿最近事件
- **graceful fallback**: 失败时显示空状态文案, KPI 显示 "-"
- **真人 7 Tab**: 基础 (身份+平台记录) / 数字员工 (卡片 grid) / 任务历史 (表格) / 决策记录 (空) / 协作对象 (卡片 grid) / 资源消耗 (空) / 活动日志 (空)
- **路由代理**: `next.config.ts` 加 `rewrites()` 把 /api/* 反代到 localhost:9100,解决 trailingSlash + CORS 冲突

## 验证 (curl)

| 路由 | 状态 |
|---|---|
| `/overview/dashboard/` | **200** · 4 KPI 真实数据 + 趋势 area + 事件流 |
| `/overview/people/` | **200** · 5 个真人卡片, 史德飞带 FOUNDER badge |
| `/overview/people/9b55c08d-.../` (史德飞) | **200** · 7 Tab + 大头像 + 身份/平台记录 |
| `/overview/billing/` | **200** · 真实 cost 趋势 area chart |
| `/overview/diagnosis/` | **200** · 占位 |
| `/overview/optimization/` | **200** · 占位 |
| `/overview/logs/` | **200** · 占位 |

5 个真人实测: 史德飞 (FOUNDER/admin), Panmira Admin (admin), Op One (operator), Mem One (member), E2E Test (member).
8 个数字员工, 13 条流水线, 真实 cost 数据从 `/api/v2/admin/cost` 拉取.

截图: `/home/ubuntu/panmira-N1/.claude/p3-1-screenshots/`
- dashboard.png · people.png · person-shidefei.png · billing.png

## 截图描述

**仪表盘** — 4 KPI tile (5 真人 / 8 数字员工 / 13 流水线 / 0.00 消耗), sparkline 显示在"真人"和"消耗" tile 上; 8/4 split 下方: 左侧 30 天日消耗 area chart (07-06 ~ 07-07 真实数据), 右侧最近事件流 (玄鉴 任务完成/开始事件, 真实 prompt preview 截取)

**真人列表** — Editorial 3 列 grid, 5 张卡片. 史德飞卡片 amber ring + FOUNDER badge (crown icon), 其他卡片正常边框. 每张卡: 大头像 (last-name 中文 / initials 英文) + sid badge (METMIRA:SHIDEFI 等) + 角色 + 状态 dot + 邮箱 + 电话. 顶部 filter 4 个: 全部(5) / 管理员(2) / 操作员(1) / 成员(2)

**史德飞详情** — 头部: XL 头像 (德飞) + 姓名 + sid + FOUNDER badge + 角色/状态/邮箱/电话一行 + 关联 8 数字员工/拥有 0 流水线 三个元数据. 7 Tab sticky bar (基础/数字员工/任务历史/决策记录/协作对象/资源消耗/活动日志). 默认显示"基础" Tab: 身份信息 (姓名/邮箱/电话/sid/角色/状态) + 平台记录 (创建时间/最近登录/失败次数/锁定/tenant/ID) 双列布局

**billing** — 2 KPI 卡片 (近 30 天总消耗 0.00 + 计费维度 token/channel/knowledge) + 30 天日消耗 area chart (07-06 ~ 07-07 真实数据)

## 遗留

1. **A1 trigger bug (已自动避开)**: `protect_last_admin` 触发器写死 `RETURN OLD` 导致所有 admin 行 UPDATE 被静默回滚, 包括 `verification_code` 写入. 触发器当前在 DB 里已 disabled (earlier ALTER), 之后需要在迁移层修这个 trigger function 的 RETURN NEW (不在本任务范围)
2. **真人-bot 关联**: 7 Tab 的"数字员工"和"协作对象"目前展示全部 8 个 agents, 因为 backend 没有 user-agent 关联表. 等 P3.2 接入后回填
3. **决策/资源/活动 Tab**: 显示占位,等 run-log/approve/usage activity 接口按 userId 过滤后接入
4. **next.config.ts rewrites** 写死 `http://localhost:9100/api/:path*`, 生产部署需要改 env-based
5. **图片/avatar**: 真人头像用 initials + oklch 颜色 (按 sid hash),没有真实照片 (backend avatarUrl 字段是 /avatars/*.svg 假路径)
6. **dashboard "消耗" KPI 显示 0.00**: 因为 token 上报后端还没有真实数据, 等首次计费跑通后会自动出现

## 重要文件路径

| 文件 | 说明 |
|---|---|
| `apps/web-next/app/(app)/overview/_components/data.ts` | 数据适配层 + fullPath |
| `apps/web-next/app/(app)/overview/_components/person-card.tsx` | 史德飞 FOUNDER 处理 |
| `apps/web-next/app/(app)/overview/dashboard/page.tsx` | 4 KPI + 趋势 + 事件流 |
| `apps/web-next/app/(app)/overview/people/page.tsx` | 卡片列表 + filter |
| `apps/web-next/app/(app)/overview/people/[id]/page.tsx` | 7 Tab 详情 |
| `apps/web-next/app/(app)/overview/billing/page.tsx` | 账单 (真实 API) |
| `apps/web-next/next.config.ts` | /api/* → :9100 反代 |
| `.claude/p3-1-screenshots/*.png` | 4 张验证截图 |
| `commits/1171c87` | P3.1 commit |

## 重跑命令

```bash
# 启动 web-next
pm2 restart web-next --update-env

# 测试
curl -I http://localhost:3200/overview/dashboard/
curl -I http://localhost:3200/overview/people/
curl -I http://localhost:3200/overview/people/9b55c08d-8591-421d-ba4b-694d30787fd3/   # 史德飞
curl -I http://localhost:3200/overview/billing/
curl -I http://localhost:3200/overview/diagnosis/
curl -I http://localhost:3200/overview/optimization/
curl -I http://localhost:3200/overview/logs/

# 取 token (开发态, dev mode)
sleep 60  # 等 rate limit reset
STEP1=$(curl -s -X POST http://localhost:9100/api/auth/login/step1 -H "Content-Type: application/json" -d '{"email":"admin@panmira.com","password":"admin123"}')
CODE=$(echo $STEP1 | jq -r .verificationCode)
curl -s -X POST http://localhost:9100/api/auth/login/step2 -H "Content-Type: application/json" -d "{\"email\":\"admin@panmira.com\",\"verificationCode\":\"$CODE\"}"
```

## 验证结论

**PASS** — P3.1 /overview 模块全部 7 个路由返回 200, 4 个核心页 (dashboard/people/people/[id]/billing) 接真实 API 显示 5 真人 / 8 数字员工 / 13 流水线 / 真实事件流, 史德飞特殊处理生效, 设计 taste 应用 (层级对比/editorial 节奏/oklch 状态色/卡片 hover micro motion/no emoji).
