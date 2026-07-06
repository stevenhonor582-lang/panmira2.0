# Plan D MV cron + skill/channel + CSV · Handoff (2026-07-06)

## 当前任务
panmira 数智资源管理 SaaS · Plan D(MV 定时刷新 + skill/channel 接入 + CSV 导出)部署完成

## 已完成 (2026-07-06)

### 新服务 (1)
- `src/services/mv-refresh-cron.ts` (45 行)
  - `startMvRefreshCron(intervalMs?)` — 默认 5 分钟 (可配 `MV_REFRESH_MS` env)
  - 启动时立即 refresh 一次 (避免重启后空数据)
  - `setInterval` + `unref()` (不阻止进程退出)
  - `isRefreshing` flag 防止并发
  - 错误吞掉,仅 console.error

### 新端点 (2)
**Channel usage (`/api/v2/admin/channels`):**
- `POST /usage` (channel:admin|channel:write|webhook:write) — body: `{channelKey, count?}` → 写 recordChannelUsage

**Reports CSV export (`/api/v2/admin/reports/{dimension}/export`):**
- `GET ?from=&to=&groupBy=day|dimension_key&format=csv`
- 响应: `Content-Type: text/csv; charset=utf-8` + `Content-Disposition: attachment`
- 头行: `date,dimension,dimension_key,count` (day) 或 `dimension_key,dimension,count` (key)
- 走 MV, fallback 原表
- CSV escape (引号/逗号/换行)
- 限制 maxRows=10000 (防爆)

### 接入 (1)
- `skill-hub-routes.ts` install handler — `recordSkillUsage('default', skillName, 1)`
- 启动时 `startMvRefreshCron()` 注册 (在 src/index.ts 中)

### 路由顺序修复 (commit 4beb1f4e)
- B-3 reports block 必须放在 D export block 之后
- 否则 `/api/v2/admin/reports/{dim}/export` 会被 B-3 截胡 返 404

### 测试 (187 tests,全 pass)
- mv-refresh-cron: 6 tests
- channel-usage-routes: 4 tests
- reports-export-routes: 9 tests
- (含 A/B-1/B-2/B-3/C 既有 168 tests)

### 部署
- merge: `feat/plan-D-cron-skill-channel` → `fix/memory-system-2026-06-27`
- 修复 commit 4beb1f4e (路由顺序)
- `pnpm tsc` + `pm2 restart panmira`
- PID 34, online 250MB

## 实网验证 (2026-07-06 17:29)

```
1. POST /api/v2/admin/channels/usage {channelKey:feishu-bot-1, count:3}
   → 200 {success, data: {channelKey, recorded: 3}}
2. POST /api/v2/admin/maintenance/refresh-mv → 200 {refreshed, 6ms}
3. GET /api/v2/admin/reports/channel (走 MV)
   → 200 {rows: [{date: 2026-07-06, count: 3}]}
4. GET /api/v2/admin/reports/token/export?groupBy=day
   → 200 text/csv
   Body: "date,dimension,dimension_key,count\n2026-07-06,token,test-b2-client,22\n"
5. GET /api/v2/admin/reports/channel/export?groupBy=dimension_key
   → 200 text/csv
   Body: "dimension_key,dimension,count\nfeishu-bot-1,channel,3\n"
6. mv-refresh-cron 启动日志: "[mv-refresh-cron] started, interval=300000ms"
```

## 修复
1. **路由顺序 B-3 vs D-export** — B-3 reports block 在前,截胡了 /export 路径,返 404。修复: 把 D-export block 移到 B-3 之前 (更具体的路径优先)

## Adapt 决策
- skill install 默认用 `'default'` tenantId (无 ctx 上下文),生产环境需传入 user.tenantId
- channel 用 webhook 端点而非 IM handler 内嵌,避免侵入 feishu/telegram 代码
- MV cron 启动时立即刷一次 (避免重启后空数据)
- CSV 用 res.end 直接写,不流式 (10k 行以内够用)
- 路由顺序: 更具体的 (有 /export) 必须在更宽泛的 (前缀) 之前

## 待办 (后续 plan)

### Plan E 续 SaaS
- agent /run 真实 LLM 接入 (claude-agent-sdk)
- 大 KB 文档异步嵌入队列
- quota cron 调度 (虽然查询按 date 过滤不需 reset, 但 90 天清理可加)
- usage retention (90 天清理原表, MV 保留近期)
- 报表 dashboard UI (admin web)
- skill install 用 user.tenantId 替换 'default'
- channel IM handler 集成 webhook 调用 (feishu/telegram 入口)

### 跨 plan 增强
- MV 多视图 (per-dimension 物化视图)
- CSV 大表分页导出 (stream chunks)
- quota 邮件告警 (达 80% 通知)

## 关键文件路径

- Spec: `projects/panmira/specs/2026-07-06-resource-engine-design.md` §15
- 实施 plan: `docs/superpowers/plans/2026-07-06-panmira-plan-D.md`
- MV cron: `src/services/mv-refresh-cron.ts`
- Channel 端点: `src/api/routes/channel-usage-routes.ts`
- CSV 端点: `src/api/routes/reports-export-routes.ts`
- 测试: `src/services/__tests__/mv-refresh-cron.test.ts` + `src/api/routes/__tests__/channel-usage-routes.test.ts` + `reports-export-routes.test.ts`

## 实网入口

- `https://deepx.fun/api/v2/admin/channels/usage` (Bearer + channel:write, IM handler 调用)
- `https://deepx.fun/api/v2/admin/reports/{dim}/export?format=csv` (Bearer + reports:read)
- `https://deepx.fun/api/v2/admin/maintenance/refresh-mv` (Bearer + maintenance:admin, 可手 trigger)

## 风险与教训

1. **路由顺序敏感** — B-3 reports prefix 比 D-export /export 更宽, 必须先匹配更具体的 (含 /export 的)
2. **CSV 大小限制** — 10k 行 limit, 超大报表需 stream chunks 或分文件
3. **MV 实时性** — 5 分钟延迟, 关键场景需手 /refresh-mv
4. **tenant 上下文** — skill install 用 'default' 是 placeholder,生产需 user.tenantId
5. **cron unref** — 用 unref() 防止定时器阻止进程退出

## 上下文恢复指引
下次会话开头:
1. 读 `.claude/handoff-2026-07-06-panmira-plan-D.md` (本文件)
2. 读 B/C handoff 拿上下文
3. 读 `panmira-rebuild-state.md` + `panmira-deploy-workflow.md` memory
4. 看 git log: `fix/memory-system-2026-06-27` 累计 17 个 plan commits
5. 检查 pm2: `ssh mah` → `pm2 list` 看到 panmira online
6. 继续 plan E (LLM 接入 / 异步队列 / 报表 dashboard)

## 下一步选择
- [A] plan E: agent /run 真实 LLM 接入 (claude-agent-sdk)
- [B] plan F: 大 KB 文档异步嵌入队列
- [C] plan G: 报表 dashboard UI (admin web)
- [D] 别的
