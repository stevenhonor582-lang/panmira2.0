# 会话交接 - 2026-07-08 R14-F 系统日志重构

## 当前任务
把 `/overview/logs` 从"看不懂的 bot 日志"重构成"人类可读 + AI 分析 + 发现问题"。

## 已完成 ✅

### 后端 (commit f151bb5)

**新增文件 `src/api/routes/log-analysis.ts`** (515 行)
- LEVEL_LABEL / SOURCE_LABEL / ACTION_LABEL 中文映射
- ERROR_PATTERNS 错误模式表(从 7827 条历史数据归纳 10 种,含 SDK stream failed / 529 过载 / Claude process exit / Task stopped 等)
- `humanizeActivityEvent()` — activity_events 行 → HumanizedLog
- `humanizeAuditLog()` — audit_logs 行 → HumanizedLog
- `analyzeLogs()` 规则引擎聚合(无 LLM 调用,零成本零延迟)
  - bySource: 来源 × 级别热力图
  - topIssues: 错误模式 Top N
  - trend: 按天错误/警告趋势
  - affectedEntities: 受影响实体(按 bot 聚合,支持 bot_id 缺失 fallback 到 bot:<name>)
  - actions: 建议行动(带跳转 link,根据 entityId 形式选 `/employees/<id>` 或 `/employees?name=`)
  - summary: 自然语言总结

**改造 `src/api/routes/r9-mock-endpoints-routes.ts`**
- `fetchHumanizedLogs()` 数据访问层:activity_events 主数据源 + audit_logs 辅助
- `adminLogs()` 重写:人类可读字段(title/description/levelLabel/sourceLabel/actionLabel/impact)
- `adminLogsAnalyze()` 新增:调 `analyzeLogs()` 返回 LogAnalysis
- 路由 dispatch:`/api/v2/admin/logs/analyze` 子路径(必须 startsWith 在 `/logs` 之前匹配,避免 query 干扰)
- 过滤:level/source/q/hours/limit
- 修复 timestamp bigint 字符串解析(`toMs()` 兼容 number/bigint/数字字符串/ISO)

### 前端 (commit f151bb5 + e8e0a6c)

**`apps/web-next/app/(app)/overview/logs/page.tsx`** (493 行)
- 主页面:state + ListSection + FilterField + LogCard + DetailDrawer + Section/Field
- 4 大区域:
  1. AI 日志分析(顶部,gradient 头部 + 4 stat tiles + 高频问题 chips + 建议行动)
  2. 7 天错误趋势(recharts LineChart,errors/warns 双线)
  3. 问题热力图(来源 × 级别,错误单元格深红背景)
  4. 日志列表(level tabs + 来源/时间过滤 + 搜索 + 卡片式)

**`apps/web-next/app/(app)/overview/logs/_panels.tsx`** (558 行,新建)
- 共享 types + helpers (HumanizedLog / LogAnalysis / levelTone / impactTone)
- 共享 UI 原语: PanelShell / SkeletonRows / EmptyHint
- Header / AIAnalysisPanel / StatTile / ActionRow
- TrendCard / HeatmapCard / SourceIcon

**详情抽屉**:基本信息 / 人类可读描述 / 修复建议 / 关联实体 / 原始数据(5 Section,可滚)

## 验证 🔒

### 后端 curl 验证(admin 史德飞)

```bash
curl -s -H "authorization: Bearer $ADMIN" "http://localhost:9100/api/v2/admin/logs/analyze?hours=168"
```

返回:
```json
{
  "summary": "最近 168h 共 523 条日志 · 其中 8 个错误、1 个警告 · 错误主要集中在【数字员工】(8 次) · 高频问题【SDK 流中断】(7 次) · 受影响最大的是【得一】(7 次)。",
  "totals": {"errors": 8, "warns": 1, "info": 514, "all": 523},
  "topIssues": [
    {"pattern": "SDK 流中断", "count": 7, "severity": "high"},
    {"pattern": "上游服务错误 (500)", "count": 1, "severity": "high"}
  ],
  "affectedEntities": [
    {"type": "agent", "name": "得一", "issues": 7, "lastIssue": "得一 · SDK 流中断"},
    {"type": "agent", "name": "玄鉴", "issues": 1, "lastIssue": "玄鉴 · 上游服务错误 (500)"}
  ],
  "actions": [
    {"priority": "high", "action": "检查 得一 的最近失败 (7 次,最近 得一 · SDK 流中断)", "link": "/employees?name=%E5%BE%97%E4%B8%80"},
    {"priority": "high", "action": "检查 Claude Code native binary 路径与进程生命周期", "link": "/employees"},
    {"priority": "high", "action": "上游模型服务器内部错误,需联系供应商或重试", "link": "/overview/diagnosis"}
  ],
  "trend": [
    {"day": "2026-07-01", "errors": 0, "total": 39},
    {"day": "2026-07-02", "errors": 1, "total": 179},
    {"day": "2026-07-05", "errors": 7, "total": 122},  ← 用户说的"最近失调" 7/5 爆发
    ...
  ]
}
```

### 前端验证
- `npx next build` ✓
- 截屏:`.claude/r14f-logs-top.png` / `r14f-logs-drawer.png` / `r14f-logs-full.png`
- Playwright `q3-33pages.spec.ts` **34/34 通过**(含 `/overview/logs/`)
- 抽屉 4 Section DOM 验证:基本信息/修复建议/关联实体/原始数据 全部存在

## 关键决策 / 约束

1. **AI 分析用规则引擎,不调真 LLM** — 避免成本 + 延迟。ERROR_PATTERNS 表归纳了 10 种已知模式(SDK stream failed / 529 过载 / Claude process exit / Task stopped / API Error 400/500 等)。
2. **数据源优先级** — activity_events(7827 条) 是主数据源,audit_logs(3 条) 是辅助。两者合并 humanize 后统一展示。
3. **entityId 兜底** — 70% 的 task_failed 事件没有 bot_id(只有 bot_name),用 `bot:<name>` slug 作 entityId,让受影响实体能聚合。
4. **路由 dispatch** — `/api/v2/admin/logs/analyze` 必须在 `/logs` 之前匹配(因为 startsWith),且用 `url.startsWith` 而非 `parsed.pathname ===` 避开 query string 干扰。
5. **timestamp 兼容** — `toMs()` 函数兼容 number / bigint / 数字字符串 / ISO 字符串(activity_events.timestamp 是 bigint,drizzle 返回字符串)。
6. **文件大小拆分** — 单文件 1017 行 > 800 max,拆为 page(493 行) + _panels(558 行)。
7. **修复 build cache** — pm2 跑的是 `dist/index.js`,每次改 ts 必须先 `npx tsc -p tsconfig.build.json` 才能 restart。
8. **logs 目录被 .gitignore** — `.gitignore` 第 5 行有 `logs/`,必须用 `git add -f` 强制添加。
9. **不动文件** — dashboard/people/billing/diagnosis/optimization 全部未动。

## 用户偏好 / 风格
- 用户原话"不要问。直接干。报告:✅ 已做 / 🔒 验证 / ⚠️ 遗留 / 📁 文档"
- 矛盾论实践:抓主要矛盾(用户看不懂 raw) → 派生人类可读字段;次要矛盾(发现规律) → AI 规则引擎聚合。

## 重要文件 / 路径

- 后端新文件:`/home/ubuntu/panmira-N1/src/api/routes/log-analysis.ts`
- 后端改造:`/home/ubuntu/panmira-N1/src/api/routes/r9-mock-endpoints-routes.ts`(adminLogs + adminLogsAnalyze + dispatch)
- 前端主页面:`/home/ubuntu/panmira-N1/apps/web-next/app/(app)/overview/logs/page.tsx`
- 前端 panels:`/home/ubuntu/panmira-N1/apps/web-next/app/(app)/overview/logs/_panels.tsx`
- 端点:`/api/v2/admin/logs` + `/api/v2/admin/logs/analyze`(localhost:9100)
- 截屏:`/home/ubuntu/panmira-N1/.claude/r14f-logs-{top,drawer,full}.png`

## 待办 / 遗留 ⚠️

无 critical 遗留。可选优化:

1. **R14-G 真实 LLM 分析**(未来):当前是规则引擎,准确但缺深度。未来可接 LLM 对 topIssues 给更具体的修复建议(目前 fixHint 是模板化)。
2. **错误模式学习**(未来):ERROR_PATTERNS 是手工归纳,未来可以从历史数据自动聚类发现新模式。
3. **WebSocket 实时推送**(未来):当前是手动刷新,未来可考虑 SSE/WS 推送新 error 到面板。
4. **更多数据源**(未来):目前从 activity_events + audit_logs,未来可以接入 pipeline_runs 错误、scheduled_jobs 失败、circuit-breaker 状态等。

## Git commits

```
e8e0a6c refactor(web): logs 拆分 page / _panels(单文件 → 双文件 <800 行)
f151bb5 feat(api): /api/v2/admin/logs 人类可读 + /analyze AI 分析端点
```

下个 session 继续点:从 HEAD `e8e0a6c` 开始,任务可继续 R14-G(真实 LLM 分析)或其他 R14 后续。

## 远端状态
- HEAD: `e8e0a6c` (main 分支,本地 commit,未 push)
- panmira pm2 进程: online (重启后 5 分钟内)
- web-next pm2 进程: online
- 后端编译: 已编译到 dist/
- 前端 build: 已构建到 .next/
- 数据库: 7827 activity_events / 3 audit_logs(未改 schema)
