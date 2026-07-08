# Q1 接真数据 transition plan

> 时间: 2026-07-08
> 配套: `.claude/q1-data-report.md` (巡检报告)
> 目标: 把前端所有 mock 数据替换成真实 API 调用,生产级可信

---

## A. 接真数据 3 个原则

### 1. 永远不显示硬编码 mock
- 任何 `_lib/data.ts` 的 fallback 都必须真实 (从 DB 读)
- 找不到数据时显示 **空状态**,**绝不**显示 stub 数组
- `localStorage` 只放 UI 偏好 (theme / filter),不放业务数据

### 2. fallback 模式 (缺数据不崩)
- `fetchXxx()` 返回 `null` 而非 throw → 让页面用骨架屏
- 组件层:
  ```tsx
  const { data, loading, error } = useFetch(fetchAgents);
  if (loading) return <Skeleton />;
  if (error || !data) return <EmptyState reason="agents-not-loaded" />;
  if (data.length === 0) return <EmptyState reason="no-agents" />;
  return <Gallery agents={data} />;
  ```
- **不允许 `data?.length ?? <fallback_placeholder>`** 这种 fallback

### 3. zod schema 校验
- 每个 API 响应 zod-parse,失败则记 telemetry + 显示 degraded 状态
- 用 `z.NEVER` 兜底, 触发 `console.error` + sentry
- service worker 层 + 组件层双校验

---

## B. 接真数据 checklist (按文件)

### 严重 (P0 — 必须修才能上线)

| # | 文件 | 现在 | 应该 | 改动大小 |
|---|------|------|------|---------|
| 1 | `apps/web-next/app/(app)/employees/_lib/data.ts` | **硬编码 AGENTS (8)+ PERSONALITY_PRESETS (5) + TEMPLATE_PRESETS (5) + KB_FOLDERS (5) + logSeries() 函数** | AGENTS → `fetchAgents()` API;PRESETS → DB + hardcoded fallback 是设计层,可保留;KB_FOLDERS → DB;logSeries → API | **L (大)** |

### 中等 (P1 — 影响体验)

| # | 文件 | 现在 | 应该 | 改动大小 |
|---|------|------|------|---------|
| 2 | `apps/web-next/app/(app)/channels/skills/page.tsx` | `import { MOCK_SKILLS } from "@/lib/channels/mock"` | `api<Skill[]>('/api/v2/channels/skills')` | **M (中)** |
| 3 | `apps/web-next/app/(app)/channels/mcp/page.tsx` | `import { MOCK_MCP } from "@/lib/channels/mock"` | `api<MCPServer[]>('/api/v2/channels/mcp')` | **M** |
| 4 | `apps/web-next/app/(app)/channels/llm/page.tsx` | `import { MOCK_LLM } from "@/lib/channels/mock"` | `api<LLMProvider[]>('/api/v2/channels/llm')` → 已有 `/api/v2/channels/llm` 端点 (provider_configs) | **M** |
| 5 | `apps/web-next/app/(app)/channels/endpoints/page.tsx` | `import {MOCK_*_from_*/channels/mock}` | `api<...>('/api/v2/channels/endpoints/inbound')` | **M** |
| 6 | `apps/web-next/app/(app)/channels/routing/page.tsx` | `import { MOCK_ROUTING }` | `api<RoutingRule[]>('/api/v2/channels/routing')` | **M** |
| 7 | `apps/web-next/app/(app)/channels/oauth/page.tsx` | `import { MOCK_OAUTH_AUTHORIZED, MOCK_OAUTH_CLIENTS }` | `api<...>('/api/v2/channels/oauth/...')` | **M** |
| 8 | `apps/web-next/app/(app)/employees/templates/_components/templates-board.tsx` | `import { TEMPLATE_PRESETS, AGENTS }` | 用 fetchers (templates 不进 DB,保留 PRESETS 但加 evidence "5 built-in presets + DB 模板") | **S (小)** |

### 次要 (P2 — 不影响生产)

| # | 文件 | 现在 | 应该 | 改动大小 |
|---|------|------|------|---------|
| 9 | `apps/web-next/lib/channels/mock.ts` | 完整 mock 308 行 | 留作 develop 模式下 seed (avoid import 在生产 tree-shaking) | **S** |
| 10 | `apps/web-next/app/(app)/employees/_components/agent-card.tsx` | `role: "test-bot"` 字面量 | 移除字面量,用 enum/types 集中管理 | **S** |
| 11 | `apps/web-next/app/(app)/employees/_components/gallery-board.tsx` | ROLE_LABEL 字面量映射 | 移到 `lib/roles.ts` 集中管理 | **S** |

### 已接真数据 (无需修改)

| 文件 | 状态 |
|------|------|
| `apps/web-next/app/(app)/overview/_components/data.ts` | ✅ 已经是 fetcher 模式 (`fetchPeople / fetchAgents / fetchPipelines / fetchTasksStats / fetchRunLogStats / fetchCost / fetchActivityEvents`) |

---

## C. 优先级分级

### P0 — 必须 (阻塞生产)
1. **`employees/_lib/data.ts` 改成 fetcher**
   - 拆分 `AGENTS` → `EMPLOYEE_PRESETS`(5 保留设计层) + `fetchAgents()`(从 DB)
   - `KB_FOLDERS` → `fetchKBFolders()`
   - `PERSONALITY_PRESETS` 保留(设计层,不入 DB)
   - `TEMPLATE_PRESETS` 保留(同)
   - `logSeries()` → 改成 `fetchLogSeries(agentId)`
   - 影响: `/employees` `/employees/[id]` `/employees/new` `/employees/templates` 4 个路由

### P1 — 应该 (影响完整度)
2. **channels/* 7 个页面** — 改用真 API,删 mock.ts 引用
3. **fetch wrapper** — 加 zod schema + error boundary
4. **空状态 UI** — 创建 `<EmptyState reason="..." />` 组件

### P2 — 可选 (产品打磨)
5. **mock.ts 转 dev seed** — `if (process.env.NODE_ENV === 'development')` 才暴露
6. **ROLE_LABEL 抽离到 lib** — refactor
7. **AGENTS.length > 7** 测试 (deprecated 不显示)

---

## D. 改造样板 (P0 第一步)

### Before
```ts
// employees/_lib/data.ts
export const AGENTS: Agent[] = [ {... 8 个字面量 ...} ];

export function findAgent(id: string) { return AGENTS.find(a => a.id === id); }

// gallery-board.tsx
import { AGENTS, sortByOwnerFirst, facets } from "../_lib/data";
const all = React.useMemo(() => sortByOwnerFirst(AGENTS), []);
```

### After
```ts
// employees/_lib/data.ts
import { api } from "@/lib/api";
export async function fetchAgents(): Promise<Agent[]> { /* ...zod 校验... */ }

// 5 个 PRESETS 保留为设计层常量 (不是数据)
export const PERSONALITY_PRESETS = [ /* 5 条 */ ] as const;
export const TEMPLATE_PRESETS = [ /* 5 条 */ ] as const;

// gallery-board.tsx
const [agents, setAgents] = useState<Agent[]>([]);
const [loading, setLoading] = useState(true);
useEffect(() => {
  fetchAgents().then(setAgents).finally(() => setLoading(false));
}, []);
const list = useMemo(() => filterAgents(agents, filter), [agents, filter]);
```

---

## E. 验收标准 (Definition of Done)

每个 mock 文件替换完成时,**全部满足**:

- [ ] `grep -rn "MOCK_" apps/web-next/app/\(app\)/` 输出 0 行
- [ ] `grep -rn "^export const.*=.*\\[" apps/web-next/app/\(app\)/_lib/` 只剩 PRESETS(设计层)
- [ ] 浏览器 DevTools → Network → 关闭 mock 后看到 `/api/v2/...` 请求
- [ ] 数据库 `SELECT count(*) FROM agents WHERE is_active=true` 与页面渲染的卡片数完全一致
- [ ] 离线状态(后端 down)页面显示空状态 + 重试按钮,而非 crash
- [ ] 删了数据库里某个 bot 后页面立即消失 (有正常 remove 行为)

---

## F. 顺序与工作量估算

| Phase | 工作 | 估计 |
|-------|------|------|
| Phase 1 (D1) | **P0-1:** employees/_lib/data.ts 改 fetcher | 0.5 d |
| Phase 2 (D2) | P1-2~7: channels 7 个页面 | 1 d |
| Phase 3 (D3) | P1-3: zod schema + 错误边界 | 0.5 d |
| Phase 4 (D4) | P1-4: EmptyState 组件 | 0.25 d |
| Phase 5 (D5) | P2-5: mock.ts dev seed 化 | 0.25 d |
| Phase 6 (D6) | P2-6~7: refactor | 0.5 d |

**总计 ~ 3 实际工作日**
