# P5 Final Review · web-next 全部 5 模块

**审查范围**: `apps/web-next/app/(app)/{overview,employees,foundation,tasks,channels}/**`
**审查时间**: 2026-07-08
**审查基线**: commit `c031508` (P3.5)
**审查文件数**: 65 个 .ts/.tsx (10,230 行)
**全局规则**: no hardcoded secret / no console.log / func<50 / file<800 / no emoji / no #fff/#000

---

## Summary

✅ PASS 7 · ⚠ WARN 4 · 🚫 BLOCK 3

---

## 🚫 BLOCK (must fix)

### B1 · tasks/new 是占位,未集成 tldraw DAG 编辑器

**位置**: `apps/web-next/app/(app)/tasks/new/page.tsx:1-37`
**commit 误报**: P3.4 commit `0bc7ae2` 描述写 "tldraw DAG 编辑器",但实际只渲染了"占位"卡片

**证据**:

```tsx
// tasks/new/page.tsx
import { PagePlaceholder } from "@/components/layout/page-placeholder";

export default function Page() {
  return (
    <Card>
      <CardTitle>DAG 编辑器 · 占位</CardTitle>
      <CardDescription>
        tldraw 包已安装,后续任务接入。
      </CardDescription>
```

未出现 `<Tldraw />`、未做 dynamic import、未绑定 `/api/v2/admin/pipelines`。

**对比正确实现**: `tasks/[id]/page.tsx:45-53` 用 `next/dynamic({ ssr: false })` 引入。

**影响**:
- 场景 E 第 2 步 `/tasks/new/` 截图只能拍到占位卡片
- 用户无法新建 DAG 任务
- handoff commit 标题与实际交付不符

---

### B2 · employees/[id] server→client 边界错误:render-function prop

**位置**: `apps/web-next/app/(app)/employees/[id]/page.tsx:30-50` + `tab-tabs.tsx`

**server log**:

```
Error: Functions cannot be passed directly to Client Components
unless you explicitly expose it by marking it with "use server".
  {defaultValue: "basics", children: function children}
                                     ^^^^^^^^^^^^^^^^^
```

**根因**: `app/(app)/employees/[id]/page.tsx` 是 async server component,但 `<EmployeeTabs>` 是 client component。`page.tsx` 用 `{(active) => { switch(...) ... }}` 写法把函数当 children prop 传入 — Next.js 16 禁止 server→client 传递函数。

**截图证据**: `c-employees-detail.png` 显示 Next.js dev error overlay "This page couldn't load"。

**修复方向**:
- 方案 A: 把 [id]/page.tsx 改成 client component (`"use client"`)
- 方案 B: 把 tab 渲染逻辑移到 client `EmployeeTabs` 内部,通过 URL search params 决定显示哪个 tab

---

### B3 · employees/[id] agent-header 越界调用 client 函数 statusTone

**位置**: `apps/web-next/app/(app)/employees/[id]/_components/agent-header.tsx:17`

**server log**:

```
Error: Attempted to call statusTone() from the server but statusTone is on the client.
It's not possible to invoke a client function from the server,
it can only be rendered as a Component or passed to props of a Client Component.
  at m (app/(app)/employees/[id]/_components/agent-header.tsx:17:13)
```

**根因**: `statusTone` 从 `@/components/employees/_components/avatar-mark` 导入,而 avatar-mark 是 `"use client"` 文件;agent-header.tsx 自身没有 `"use client"`,却在 server render 期间调用 `statusTone(agent.status)`。

**截图证据**: 同 B2,`c-employees-detail.png` 显示错误覆盖层。

**修复**: 在 agent-header.tsx 顶部加 `"use client"`,或者把 statusTone 拆到普通 `.ts` 文件(不带"use client")。

---

## ⚠ WARN (should fix)

### W1 · Math.random 用于"模拟测试 / 延迟 / ID 预览"

**位置**:
- `employees/new/_components/step-7.tsx:42-43` — 测试通过率 85% 模拟
- `channels/llm/page.tsx:66` — 模型延迟模拟
- `channels/mcp/page.tsx:323`、`channels/routing/page.tsx:105`、`channels/oauth/page.tsx:69,110` — 临时 ID `m_xxxxx / r_xxxxx / cli_xxxxx / oc_xxxxx`
- `channels/oauth/page.tsx:63` — client_secret 字节"预览"

**说明**:
- step-7 / llm latency 都是 UI demo,不是真实测试
- OAuth secret byte preview 用 Math.random 在 demo 中形似 secret 容易误导

**建议**: step-7 / LLM latency 改 `(SIMULATED)` 标签;OAuth byte preview 改 `crypto.getRandomValues` + 注释说明后端实际用 `crypto.randomBytes(32)`。

### W2 · 7 个文件超 300 行,1 个接近 800

| 文件 | 行数 | 评级 |
|------|------|------|
| foundation/knowledge/page.tsx | 640 | INFO (3-pane KB,可拆 Tree/List/Preview) |
| employees/_lib/data.ts | 467 | INFO (data table,合理) |
| overview/people/[id]/page.tsx | 455 | INFO |
| foundation/feedback/page.tsx | 431 | INFO |
| channels/oauth/page.tsx | 413 | INFO |
| channels/routing/page.tsx | 375 | INFO |
| channels/llm/page.tsx | 351 | INFO |

均 < 800 行硬性限制;knowledge page 640 行建议拆 Tree/List/Preview 三组件。

### W3 · tasks/[id] 的 tldraw canvas 未渲染

**证据**: `e-tasks-detail.png` 仅 64KB,body 显示 "TEST-L12-1783434045251待执行" 但 `canvas` 计数 0。

**可能原因**: `dynamic({ ssr: false })` 加载 tldraw 超时 / 错误,或 `TaskDagEditor` 内部 fetch 失败。

**截图**: 保留了 metadata + 70/30 split layout,但右侧 DAG 区空白。

**建议**: 启动 dev 工具查 `TaskDagEditor` 实际加载状态 + 是否因 API 401 失败。

### W4 · employees/_lib/data.ts 注释命中 grep 模式

`data.ts` 中存在一行文案 `"生产不留 console.log"`,形式上被 `grep "console.log"` 命中。注释内容而非实际调用,建议改文案为 "Production code 不留 console.log"。

---

## INFO

- ✅ **无硬编码密钥** — `grep -rE "JWT_SECRET|API_KEY|password.*=.*['\"]|secret.*=.*['\"]"` 在 app/ 下零命中
- ✅ **无 console.log / debugger / 实际 TODO** — 唯一命中是 data.ts 的注释文案
- ✅ **sidebar 无 emoji** — `components/layout/sidebar.tsx` 全部使用 lucide-react icons (35+ 项),已修复之前 WARN W2
- ✅ **tldraw 集成正确 (在 [id]/page.tsx)** — 用 `next/dynamic` + `ssr: false` + loading 占位符 (但运行时 canvas 未显示,见 W3)
- ✅ **史德飞 bot 关联正确显示** — `overview/people/page.tsx:19` 定义 `FOUNDER_EMAIL = "20218181@qq.com"`,在卡片 + 详情页都加 `FOUNDER · 唯一 admin` badge
- ✅ **OAuth client_secret 明文处理正确** — 仅在创建/Rotate 时一次性显示,关闭后只显示 `***`,后端不再持有明文 (page.tsx:47,157,340 注释)
- ✅ **无 #fff / #000 硬背景** — 唯一命中 `bg-black/40` (modal 遮罩,合法)
- ✅ **无 emoji** — Python regex `[\U0001F300-\U0001F9FF]` 在 65 个文件中零命中
- ✅ **input 校验存在** — 必填项用 `trim().length` 检查
- ✅ **Sidebar 35+ 导航项**,全部用 Lucide 图标

---

## 详细指标

| 指标 | 期望 | 实际 | 结论 |
|------|------|------|------|
| 硬编码密钥 | 0 | 0 | ✅ |
| console.log | 0 | 0 (注释 1) | ✅ |
| 文件 > 800 行 | 0 | 0 | ✅ |
| emoji | 0 | 0 | ✅ |
| #fff/#000 背景 | 0 | 0 (bg-black/40 合法) | ✅ |
| sidebar emoji | 0 | 0 | ✅ |
| tldraw client 集成 ([id]) | 是 | 是 (但 canvas 未渲染) | ⚠ |
| tldraw new 集成 | 是 | **否 (占位)** | 🚫 |
| employees/[id] 渲染 | 是 | **否 (server/client 边界错)** | 🚫 |
| Math.random for crypto | 否 | 否 (UI demo only) | ✅ |
| OAuth secret 明文泄漏 | 否 | 否 | ✅ |
| 史德飞 FOUNDER 显示 | 是 | 是 | ✅ |

---

## 结论

**生产可用性**: 3 / 5 模块完整渲染 (overview / foundation / channels)。
- employees/[id] 详情页: B2 + B3 server/client 边界错误
- tasks/[id] 详情页: tldraw canvas 未渲染 (W3)
- tasks/new: 占位卡片 (B1)

**建议下一步**:
1. 修 B2 + B3 — 把 employees/[id]/page.tsx 改为 client component,或在 agent-header.tsx 顶部加 `"use client"`
2. 修 W3 — 调查 TaskDagEditor 为什么没渲染
3. 修 B1 — 复用 tasks/[id] 的 dynamic import 模式,加上 save/load handler
4. 重跑 P5-Final,关闭 3 BLOCK + 1 WARN
