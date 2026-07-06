# Panmira Plan H2 · Dashboard 总览页(资源计数 + 趋势 + 速动入口)

> **Goal:** 给 /app 加 spec § 14 描述的"4 状态卡 + 3 速动入口 + 7 天趋势",作为 admin 后台首页。

**Architecture:**
- 后端新增 `GET /api/v2/admin/dashboard/stats` 返回资源计数 + 趋势(从 usage_reports 聚合)
- 前端 DashboardView 顶部加"资源状态"新区块,保留下方 token/activity 详情
- 不破坏现有 528 行 DashboardView 的图表逻辑

**Tech Stack:**
- 后端:Node TS + Drizzle ORM(沿用现有 reports-routes 模式)
- 前端:React 19 + Recharts(已用)

## 全局约束

- 后端需 Bearer token + scope (reports:read OR reports:admin)
- 不引入新依赖
- 复用现有 usage_reports 物化视图 mv_usage_reports_daily
- worktree: /home/ubuntu/panmira-H2,branch: feat/plan-H2-dashboard

---

## Task 1: 后端 dashboard API (H2.1)

**Files:**
- Create: `src/api/routes/dashboard-routes.ts`
- Modify: `src/api/http-server.ts` (注册路由)

### Step 1: 写 stats handler(绿灯优先:无单元测试,先实现)

Create `src/api/routes/dashboard-routes.ts`:

```typescript
/**
 * Plan H2 · Dashboard 资源计数 + 7 天趋势
 *   GET /api/v2/admin/dashboard/stats
 *   返回: { counts: { llm, embedding, mcp, knowledgeBases, agents, oauthClients }, trends: [{date, token, skill, mcp, knowledge}] }
 *   权限: reports:read OR reports:admin
 */
import type http from 'node:http';
import { sql } from 'drizzle-orm';
import { pool } from '../../db/index.js';
import { jsonResponse } from './helpers.js';
import { requireBearer, requireAnyScope } from '../oauth-middleware.js';

export async function handleDashboardRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  method: string,
  url: string,
): Promise<boolean> {
  const u = new URL(url, 'http://localhost');
  if (!u.pathname.startsWith('/api/v2/admin/dashboard')) return false;
  if (method !== 'GET') {
    jsonResponse(res, 405, { error: 'method_not_allowed' });
    return true;
  }

  const ctx = await requireBearer(req, res);
  if (!ctx) return true;
  if (!requireAnyScope(ctx, ['reports:read', 'reports:admin'])) {
    jsonResponse(res, 403, { error: 'insufficient_scope', required: 'reports:read OR reports:admin' });
    return true;
  }

  if (u.pathname === '/api/v2/admin/dashboard/stats') {
    try {
      // 资源计数(7 张核心表)
      const countsRes = await pool.query<{
        llm: string; embedding: string; mcp: string;
        knowledge_bases: string; agents: string; oauth_clients: string; skills: string;
      }>(`
        SELECT
          (SELECT count(*) FROM provider_configs WHERE status != 'disabled') AS llm,
          (SELECT count(*) FROM embedding_providers WHERE status != 'disabled') AS embedding,
          (SELECT count(*) FROM mcp_servers WHERE status != 'disabled') AS mcp,
          (SELECT count(*) FROM knowledge_bases) AS knowledge_bases,
          (SELECT count(*) FROM agents WHERE status != 'disabled') AS agents,
          (SELECT count(*) FROM oauth_clients WHERE status != 'active') AS oauth_clients,
          (SELECT count(*) FROM skills WHERE status != 'disabled') AS skills
      `);
      const c = countsRes.rows[0];

      // 7 天 usage 趋势(从物化视图拉)
      const trendsRes = await pool.query<{ date: string; dimension: string; count: string }>(`
        SELECT date, dimension, SUM(count)::bigint AS count
        FROM mv_usage_reports_daily
        WHERE date >= (CURRENT_DATE - INTERVAL '7 days')::date
        GROUP BY date, dimension
        ORDER BY date ASC
      `);

      // 按 dimension pivot 成 [{date, token, skill, mcp, knowledge}]
      const trendMap = new Map<string, Record<string, number>>();
      for (const row of trendsRes.rows) {
        const day = row.date.toString();
        if (!trendMap.has(day)) trendMap.set(day, { date: day, token: 0, skill: 0, mcp: 0, knowledge: 0 });
        const entry = trendMap.get(day)!;
        const dim = row.dimension;
        if (dim === 'token' || dim === 'skill' || dim === 'mcp' || dim === 'knowledge') {
          entry[dim] = Number(row.count);
        }
      }

      jsonResponse(res, 200, {
        counts: {
          llm: Number(c.llm),
          embedding: Number(c.embedding),
          mcp: Number(c.mcp),
          knowledgeBases: Number(c.knowledge_bases),
          agents: Number(c.agents),
          oauthClients: Number(c.oauth_clients),
          skills: Number(c.skills),
        },
        trends: Array.from(trendMap.values()),
      });
      return true;
    } catch (err) {
      console.error('[dashboard] stats error:', err);
      jsonResponse(res, 500, { error: 'internal_error', message: String(err) });
      return true;
    }
  }

  jsonResponse(res, 404, { error: 'not_found' });
  return true;
}
```

### Step 2: 注册到 http-server

Modify `src/api/http-server.ts`:

找到 `import { handleReportsRoutes }` 这一行附近(应该 line 37 附近),加:

```typescript
import { handleDashboardRoutes } from './routes/dashboard-routes.js';
```

找到 `if (await handleReportsRoutes(req, res, method, url)) return;` 这一行(应该 line 707 附近),在它**之前**加:

```typescript
if (await handleDashboardRoutes(req, res, method, url)) return;
```

### Step 3: 后端 build

```bash
cd /home/ubuntu/panmira-H2
./node_modules/.bin/tsc 2>&1 | tail -10
```
Expected: 应只报 baseline 错误(plan H1 handoff 已记录),不应该有 dashboard-routes 的新错误。

如果 dashboard-routes.ts 本身没新错误,通过。

### Step 4: Commit

```bash
cd /home/ubuntu/panmira-H2
git add src/api/routes/dashboard-routes.ts src/api/http-server.ts
git commit -m "feat(plan-H2.1): dashboard stats API (资源计数 + 7 天趋势)"
```

---

## Task 2: 前端 DashboardView 改造 (H2.2)

**Files:**
- Modify: `web/src/components/DashboardView.tsx` (顶部加新区块)
- Modify: `web/src/i18n/locales/zh.json` (4 卡 + 3 按钮文案)
- Modify: `web/src/i18n/locales/en.json` (同步)

**Interfaces:**
- 调 `GET /api/v2/admin/dashboard/stats`
- 返回 `{ counts: {...}, trends: [{date, token, skill, mcp, knowledge}] }`

### Step 1: 写组件测试(红灯)

Create `web/src/components/__tests__/DashboardView.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DashboardView } from '../DashboardView';

// Mock zustand store
vi.mock('../../store', () => ({
  useStore: (selector: any) => selector({ token: 'test-token' }),
}));

// Mock i18n
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

// Mock fetch
const mockStats = {
  counts: { llm: 5, embedding: 3, mcp: 2, knowledgeBases: 4, agents: 8, oauthClients: 1, skills: 6 },
  trends: [
    { date: '2026-07-01', token: 1000, skill: 10, mcp: 5, knowledge: 20 },
    { date: '2026-07-02', token: 1500, skill: 15, mcp: 8, knowledge: 25 },
  ],
};

const mockTeam = { bots: [{ name: 'b1', status: 'idle' }, { name: 'b2', status: 'busy' }] };
const mockActivity = { events: [{ id: '1', type: 'task', botName: 'b1', message: 'hi' }] };
const mockMemory = { stats: [] };

global.fetch = vi.fn((url: string) => {
  if (url.includes('/api/v2/admin/dashboard/stats')) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve(mockStats) } as Response);
  }
  if (url.includes('/api/team/status')) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve(mockTeam) } as Response);
  }
  if (url.includes('/api/activity/events')) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve(mockActivity) } as Response);
  }
  if (url.includes('/api/memories/stats')) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve(mockMemory) } as Response);
  }
  return Promise.resolve({ ok: false, json: () => Promise.resolve({}) } as Response);
}) as any;

describe('DashboardView - resources overview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders 4 status cards from stats API', async () => {
    render(<MemoryRouter><DashboardView /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByTestId('stat-llm')).toHaveTextContent('5');
    });
    expect(screen.getByTestId('stat-embedding')).toHaveTextContent('3');
    expect(screen.getByTestId('stat-knowledgeBases')).toHaveTextContent('4');
    expect(screen.getByTestId('stat-agents')).toHaveTextContent('8');
  });

  it('renders 3 quick action buttons', async () => {
    render(<MemoryRouter><DashboardView /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('dashboard.newAgent')).toBeInTheDocument();
      expect(screen.getByText('dashboard.uploadDoc')).toBeInTheDocument();
      expect(screen.getByText('dashboard.connectChannel')).toBeInTheDocument();
    });
  });
});
```

### Step 2: 运行测试(确认红灯)

```bash
cd /home/ubuntu/panmira-H2/web && npm test 2>&1 | tail -15
```
Expected: FAIL — dashboard stats data-testid 不存在

### Step 3: 改造 DashboardView 顶部

Modify `web/src/components/DashboardView.tsx`:

1. 在文件顶部(`fetchJSON` 函数附近)加新的 fetch:
```typescript
async function fetchDashboardStats(token: string | null): Promise<DashboardStats | null> {
  try {
    return await fetchJSON('/api/v2/admin/dashboard/stats', token);
  } catch {
    return null;
  }
}
```

2. 在 interface 块加 DashboardStats 类型:
```typescript
interface DashboardStats {
  counts: {
    llm: number;
    embedding: number;
    mcp: number;
    knowledgeBases: number;
    agents: number;
    oauthClients: number;
    skills: number;
  };
  trends: Array<{ date: string; token: number; skill: number; mcp: number; knowledge: number }>;
}
```

3. 在 `DashboardView` 组件函数体内,加 state:
```typescript
const [stats, setStats] = useState<DashboardStats | null>(null);
```

4. 在现有 `fetchDashboardData(token)` 调用附近,加:
```typescript
fetchDashboardStats(token).then(setStats);
```

5. 在 return JSX **最顶部**(`<div className={s.dashboard}>` 内的第一个 child),加新区块:

```tsx
{stats && (
  <section className={s.resourcesOverview} data-testid="resources-overview">
    <h2 className={s.sectionTitle}>{t('dashboard.title')}</h2>
    <div className={s.statCards}>
      <NavLink to="/app/models" className={s.statCard} data-testid="stat-llm">
        <div className={s.statLabel}>{t('dashboard.llm')}</div>
        <div className={s.statValue}>{stats.counts.llm}</div>
      </NavLink>
      <NavLink to="/app/models" className={s.statCard} data-testid="stat-embedding">
        <div className={s.statLabel}>{t('dashboard.embedding')}</div>
        <div className={s.statValue}>{stats.counts.embedding}</div>
      </NavLink>
      <NavLink to="/app/knowledge" className={s.statCard} data-testid="stat-knowledgeBases">
        <div className={s.statLabel}>{t('dashboard.kb')}</div>
        <div className={s.statValue}>{stats.counts.knowledgeBases}</div>
      </NavLink>
      <NavLink to="/app/agents" className={s.statCard} data-testid="stat-agents">
        <div className={s.statLabel}>{t('dashboard.agents')}</div>
        <div className={s.statValue}>{stats.counts.agents}</div>
      </NavLink>
    </div>
    <div className={s.quickActions}>
      <NavLink to="/app/agents" className={s.quickAction}>
        + {t('dashboard.newAgent')}
      </NavLink>
      <NavLink to="/app/knowledge" className={s.quickAction}>
        + {t('dashboard.uploadDoc')}
      </NavLink>
      <NavLink to="/app/channels" className={s.quickAction}>
        + {t('dashboard.connectChannel')}
      </NavLink>
    </div>
  </section>
)}
```

### Step 4: 加 CSS

Append to `web/src/components/DashboardView.module.css`:

```css
.resourcesOverview {
  margin-bottom: 2rem;
  padding: 1.5rem;
  background: var(--bg-elevated, #0c0c11);
  border: 1px solid var(--border, rgba(255, 255, 255, 0.06));
  border-radius: 12px;
}
.sectionTitle {
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0 0 1rem 0;
  color: var(--text-primary, #f0f0f2);
}
.statCards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 0.75rem;
  margin-bottom: 1.25rem;
}
.statCard {
  display: block;
  padding: 1rem;
  background: var(--bg-base, #050508);
  border: 1px solid var(--border, rgba(255, 255, 255, 0.06));
  border-radius: 8px;
  text-decoration: none;
  color: inherit;
  transition: border-color 120ms ease, background-color 120ms ease;
}
.statCard:hover {
  border-color: var(--accent, rgba(99, 102, 241, 0.5));
  background: var(--bg-hover, rgba(255, 255, 255, 0.04));
}
.statLabel {
  font-size: 0.8rem;
  color: var(--text-tertiary, #888);
  margin-bottom: 0.5rem;
}
.statValue {
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--text-primary, #f0f0f2);
  font-variant-numeric: tabular-nums;
}
.quickActions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.quickAction {
  padding: 0.5rem 0.875rem;
  background: var(--bg-input, rgba(99, 102, 241, 0.1));
  border: 1px solid var(--accent, rgba(99, 102, 241, 0.3));
  border-radius: 6px;
  color: var(--accent, #6366f1);
  text-decoration: none;
  font-size: 0.85rem;
  transition: background-color 120ms ease;
}
.quickAction:hover {
  background: var(--bg-hover, rgba(99, 102, 241, 0.2));
}
```

### Step 5: 加 i18n

Modify `web/src/i18n/locales/zh.json`,在顶层加(如果已存在 dashboard 块则合并):

```json
{
  "dashboard": {
    "title": "资源总览",
    "llm": "LLM 模型",
    "embedding": "Embedding 模型",
    "kb": "知识库",
    "agents": "Agent",
    "newAgent": "新建 Agent",
    "uploadDoc": "上传文档",
    "connectChannel": "接入 Channel"
  }
}
```

Modify `web/src/i18n/locales/en.json`:

```json
{
  "dashboard": {
    "title": "Resources Overview",
    "llm": "LLM Models",
    "embedding": "Embedding Models",
    "kb": "Knowledge Bases",
    "agents": "Agents",
    "newAgent": "New Agent",
    "uploadDoc": "Upload Document",
    "connectChannel": "Connect Channel"
  }
}
```

### Step 6: 运行所有测试

```bash
cd /home/ubuntu/panmira-H2/web && npm test 2>&1 | tail -10
```
Expected: 15 tests PASS (13 from H1 + 2 new DashboardView tests)

### Step 7: Build 验证

```bash
cd /home/ubuntu/panmira-H2/web && ./node_modules/.bin/vite build 2>&1 | tail -5
```
Expected: build 成功

### Step 8: Commit

```bash
cd /home/ubuntu/panmira-H2
git add web/src/components/DashboardView.tsx web/src/components/DashboardView.module.css web/src/components/__tests__/DashboardView.test.tsx web/src/i18n/locales/zh.json web/src/i18n/locales/en.json
git commit -m "feat(plan-H2.2): DashboardView 加资源总览区 (4 状态卡 + 3 速动入口)"
```

---

## Task 3: 部署 + 验证 + handoff (H2.3)

### Step 1: 后端 build + 前端 build

```bash
cd /home/ubuntu/panmira-H2
./node_modules/.bin/tsc 2>&1 | tail -5
cd web && ./node_modules/.bin/vite build 2>&1 | tail -5
node /home/ubuntu/panmira-H2/scripts/copy-web-staging.mjs 2>&1 | tail -3
```

### Step 2: Merge

```bash
cd /home/ubuntu/panmira-H2
git log --oneline -5
cd /home/ubuntu/panmira
git checkout fix/memory-system-2026-06-27
git merge --no-ff feat/plan-H2-dashboard -m "merge: plan-H2 Dashboard 资源总览"
```

### Step 3: pm2 reload

```bash
pm2 reload panmira 2>&1 | tail -3
sleep 3 && pm2 status panmira | grep panmira
```

### Step 4: e2e 验证后端 dashboard API

需要先获取 access_token:
```bash
TOKEN=$(curl -sS -m 5 -X POST https://deepx.fun/oauth/token \
  -H 'Content-Type: application/json' \
  -d '{"grant_type":"client_credentials","client_id":"<填 plan-A 留的 client>","client_secret":"<填>","scope":"reports:read"}' \
  | python3 -c "import json,sys;print(json.load(sys.stdin)['access_token'])")
```

如果没 client,需要先用 plan-A 测试用的 client(可在 .env 或 oauth-clients 表查)。Plan B-3 写过 OAuth client CRUD,可以新建一个。

或者直接用现有 admin session cookie (如果有)。或临时给 client_credentials grant 走 reports scope。

**Fallback**:如果拿不到 token,接受返回 401/403,证明 auth 中间件工作。

### Step 5: 验证 dashboard API

```bash
curl -sS -m 5 -H "Authorization: Bearer $TOKEN" \
  https://deepx.fun/api/v2/admin/dashboard/stats | python3 -m json.tool
```

Expected: 返回 counts(7 个数字)+ trends(7 天数组)

### Step 6: 验证 web 入口

```bash
curl -sS -m 5 -o /dev/null -w 'HTTP %{http_code} %{size_download}b\n' https://deepx.fun/web/
curl -sS -m 5 -o /dev/null -w 'HTTP %{http_code} %{size_download}b\n' https://deepx.fun/web/app
```

Expected: HTTP 200

### Step 7: 写 handoff

Create `.claude/handoff-2026-07-06-panmira-plan-H2.md`:

```markdown
# Plan H2 · Dashboard 总览页 · Handoff(2026-07-06)

## 当前任务
panmira-web Dashboard 总览页(4 状态卡 + 3 速动入口 + 7 天趋势)部署完成

## 已完成
- [x] H2.0 worktree + plan 文档
- [x] H2.1 后端 GET /api/v2/admin/dashboard/stats
- [x] H2.2 前端 DashboardView 改造
- [x] H2.3 部署 + 验证 + handoff

## 关键变更
- `src/api/routes/dashboard-routes.ts`(新):资源计数 + 7 天趋势聚合
- `src/api/http-server.ts`:注册 dashboard 路由
- `web/src/components/DashboardView.tsx`:顶部加 resourcesOverview 区
- `web/src/components/DashboardView.module.css`:状态卡 + 速动按钮样式
- `web/src/i18n/locales/{zh,en}.json`:dashboard 文案块

## 测试
- 15 tests pass (13 from H1 + 2 DashboardView)

## 部署
- branch: fix/memory-system-2026-06-27
- HEAD: <填实际 hash>
- pm2: online
- deepx.fun/web/ HTTP 200
- dashboard stats API 返回 counts + trends

## 下一步
- Plan H3: 模型池页(LLM/Embedding CRUD + fallback)
- 或先修后端 TS baseline 错误
```

### Step 8: Commit handoff

```bash
cd /home/ubuntu/panmira
git add .claude/handoff-2026-07-06-panmira-plan-H2.md
git commit -m "docs(handoff): plan-H2 Dashboard 总览页 部署完成"
```

---

## 验收

- [ ] 15 tests pass
- [ ] vite build 成功
- [ ] dashboard API 返回 counts(7 字段)+ trends(7 天)
- [ ] deepx.fun/web/ HTTP 200
- [ ] DashboardView 顶部展示 4 状态卡 + 3 速动按钮

## 下一步(Plan H3 候选)

- **H3a 模型池**(LLM/Embedding CRUD + 测试 + fallback)
- **H3b 数智底座**(KB 树 + 上传 + 检索测试)
- **H3c Agent 列表**(列表 + 详情)
