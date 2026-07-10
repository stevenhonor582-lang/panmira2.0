# R16-4 数智底座交互优化 - DONE

## 目标
修三栏滚动联动 + 抽取页溢出 + 改名 + 全中文。

## 已做(3 commits 全部 merge 到 main)

### 1. `9bcaa4b` fix(web): memory 三栏独立滚动(各自 overflow,不联动)
**问题**:`/foundation/memory/{l1,l2,l3}` 三栏(tree|list|detail)同滚,中间长内容把左右顶上去。
**根因**:layout 中间 `<section>` 用 `overflow-y-auto`(允许整栏滚),且高度链 100vh-3rem 在某些情况下不严格收敛 → `<main>` 整体滚 → 三栏联动。
**修法**:
- `memory/layout.tsx`:外层 + grid + 中间 section 全部 `overflow-hidden`(只允许内部栏滚)
- `l1/l2 page.tsx`:内层 2-col grid 加 `overflow-hidden`,`ScrollArea` → 原生 `div.overflow-y-auto.min-h-0`(更可预测)
- `l3 page.tsx`:单栏 ScrollArea → 原生 `div.overflow-y-auto.min-h-0`
- 移除 l1/l2/l3 不再使用的 ScrollArea import

### 2. `b1ce4e6` fix(web): extraction 视图溢出修(recharts ResponsiveContainer + 全中文)
**问题**:`/foundation/extraction` 视图乱 + 超出边界。
**根因**:30 天柱状图用手写 SVG + viewBox + 100% height 的脆弱实现,容器无 `min-w-0`,KPI 用固定 `grid-cols-6`。
**修法**:
- 30 天柱状图 → recharts `ResponsiveContainer + BarChart` 堆叠(L1/L2/L3 各一 Bar)
- 容器全加 `min-w-0`(防 flex/grid 子项溢出)
- 外层 wrapper `overflow-hidden`,header `flex-wrap`(防按钮过多横向溢出)
- KPI `grid-cols-6` → `grid-cols-2 md:grid-cols-3 lg:grid-cols-6`
- Worker 卡 / KPI 卡 / 事件行全 `flex-wrap + min-w-0`
- 全中文:工作进程/运行中/已暂停/记忆总量/每日新增/近期记忆事件/加载中/无主题/无内容/重要度/撤销/近 24 时/近 7 天/合计

### 3. `567890a` feat(web): sidebar 数智底座 → 记忆沉淀 + L1/L2/L3 标签优化 + 全中文
**sidebar.tsx**:
- 模块名 `数智底座` → `记忆沉淀`(用户原话:"左侧统一叫记忆沉淀")
- `L1 记忆` → `短期记忆 · L1`
- `L2 记忆` → `长期记忆 · L2`
- `L3 记忆` → `永久记忆 · L3`
- 其他模块(知识库/抽取/反馈)不变

**memory/layout.tsx**:
- 面包屑 `数智底座` → `记忆沉淀`,页头 `记忆层级` → `记忆沉淀`
- LAYERS 标题:`L1 短期记忆` → `短期记忆 · L1`(同理 L2/L3)
- 容量:`rolling window` → `24h 滚动窗口`,`tenant scoped` → `租户范围`,`immutable` → `不可变`
- 左侧 `layers` → `层级`,中保留,右 `contract` → `规约`
- 流转图:`auto/manual/never` → `自动/人工/永不`
- 监控:`promote L1→L2` → `L1→L2 提升`

**memory/{l1,l2,l3}/page.tsx**:
- `fmtRel`: `m/h/d ago` → `分钟/小时/天 前`
- 搜索 placeholder、空状态、loading 文案全中文
- `imp` → `重要度`,`hits` → `命中`,`(no subject)` → `(无主题)`,`(empty)` → `(无内容)`,`(untitled)` → `(无主题)`
- dl 标签全中文:memory id→记忆 ID,layer→层级,type→类型,polarity→极性,hit count→命中次数,bot id→归属 Bot,tenant→租户,created→创建,updated→更新,id→ID,bot→归属 Bot,importance→重要度
- `tags`/`meta`/`memory meta` → `标签`/`元信息`/`记忆元信息`
- L2 action:`promote to L3` → `提升至 L3`,`discard` → `丢弃`
- L2 删除重复的"新增"按钮(原有 bug)
- L3 `negate` → `撤销`,`iron laws` → `条铁律`
- 空状态补充运营意义(L2:须经多次出现或显式提升;L3:不可违反核心原则)
- 来源 badge:`task` → `任务`(原"租户"语义不准确)
- 保留:L1/L2/L3 字母缩写(技术 ID,运营已熟悉)

## 验证

### ✅ Build
`npx next build` 三次(commit 各 1 次)全绿,无 error/warning(除原有 workspace root 提示)。

### ✅ 部署
`pm2 reload web-next` 成功,PID 3872209。

### ✅ 6 页 HTTP 200
```
/foundation/memory/l1/    200
/foundation/memory/l2/    200
/foundation/memory/l3/    200
/foundation/extraction/   200
/foundation/knowledge/    200
/foundation/feedback/     200
```

### ✅ SSR 中文文案进入 bundle
`grep` `.next/server/chunks/ssr/*.js` 验证 `短期记忆 · L1 / 长期记忆 · L2 / 永久记忆 · L3 / 记忆沉淀 / 层级 / 流转 / 规约` 全部命中。

### ✅ E2E 全过
`npx playwright test e2e/specs/q3-33pages.spec.ts --reporter=line` → **34 passed (1.1m)**

## 文件改动(共 7 个)
- `apps/web-next/components/layout/sidebar.tsx`(改名)
- `apps/web-next/app/(app)/foundation/memory/layout.tsx`(滚动 + i18n)
- `apps/web-next/app/(app)/foundation/memory/l1/page.tsx`(滚动 + i18n)
- `apps/web-next/app/(app)/foundation/memory/l2/page.tsx`(滚动 + i18n + 去重)
- `apps/web-next/app/(app)/foundation/memory/l3/page.tsx`(滚动 + i18n)
- `apps/web-next/app/(app)/foundation/extraction/page.tsx`(recharts + min-w-0 + i18n)

## ⚠️ 遗留 / 注意

1. **其他 agent 的 WIP 未被我提交**:working tree 当前还有 `channels/{endpoints,oauth,routing,feedback}` / `overview/{diagnosis,logs}` / `foundation/feedback` 等 modified,不属于 R16-4 边界,我没动。
2. **stash@{0} = `r16-4-baseline-other-wip`** 保留,内含 `channels/{llm,mcp,skills}` + `src/api/routes/{provider-routes,r9-mock-endpoints-routes}` + `src/db/provider-config-store.ts` 的旧 WIP 状态。`channels/mcp` 当时是 broken(语法错误),已从 stash 部分应用期间丢弃,放回 HEAD。**不要直接 pop** — `src/api/routes/provider-routes.ts` 与并行 agent 改动冲突已 `--ours` 解决。如需还原旧 WIP,先 `git stash show -p stash@{0}` 检查再决定。
3. **后续 R16-5 可做**(不在本任务范围):
   - L2/L3 detail 抽屉同步本次 i18n(目前 MemoryDetailSheet/MemoryAddDialog 用英文,在 `lib/foundation/*`,不在 R16-4 文件边界)
   - 三栏适配小屏(<768px)可加 `lg:` 断点折叠左/右 aside
   - 抽取页可加日趋势 tab 切换(7/30/90 天)
4. **未改后端**:本次纯前端,API(`foundation/*`)不变。

## 重要文件 / 路径

- sidebar:`apps/web-next/components/layout/sidebar.tsx`(L86-103 foundation 模块定义)
- memory layout:`apps/web-next/app/(app)/foundation/memory/layout.tsx`
- memory 三页:`apps/web-next/app/(app)/foundation/memory/{l1,l2,l3}/page.tsx`
- extraction:`apps/web-next/app/(app)/foundation/extraction/page.tsx`
- recharts 模式参考:`app/(app)/overview/_components/trend-chart.tsx`

## 远端
- https://deepx.fun/foundation/memory/l1 (200)
- https://deepx.fun/foundation/extraction (200)
- 后端 9100 / 前端 3200(pm2: web-next id=54)
- DB:`postgresql://ubuntu:ubuntu@localhost:5432/metabot`
- 登录:史德飞 `20218181@qq.com` / `shidefei@2026`(admin)

## HEAD
`5dd58bd` (feat(web): Skills 清单表 + 新增流程) — R16-4 已包含在历史中,位于 `567890a`/`b1ce4e6`/`9bcaa4b` 三个 commit。
