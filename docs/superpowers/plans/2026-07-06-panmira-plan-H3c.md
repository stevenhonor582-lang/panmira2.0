# Panmira Plan H3c · Agent 列表页

> **Goal:** 给 /app/agents 加 spec § 14 描述的"Agent 列表":列表 + 新建 + 详情 + 删除。

**Architecture:**
- 后端新增 `GET/POST/DELETE /api/v2/admin/agents` + `GET/PATCH /api/v2/admin/agents/:id`
- 前端 AgentsView(列表 + 新建按钮 + 详情 modal)
- 复用 agents 表(已有 7 条数据)

**Tech Stack:** 前端 React 19 + 后端 Node TS + Drizzle ORM

## 全局约束
- 后端需 Bearer + scope (agent:read / agent:admin)
- worktree: /home/ubuntu/panmira-H3c,branch: feat/plan-H3c-agents

---

## Task 1: 后端 agents CRUD API (H3c.1)

Create `src/api/routes/agents-crud-routes.ts`:

```typescript
import type * as http from 'node:http';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { agents } from '../../db/schema.js';
import { jsonResponse, parseJsonBody } from './helpers.js';
import { requireBearer, requireAnyScope } from '../oauth-middleware.js';

export async function handleAgentsCrudRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  method: string,
  url: string,
): Promise<boolean> {
  const u = new URL(url, 'http://localhost');
  if (!u.pathname.startsWith('/api/v2/admin/agents')) return false;

  const ctx = await requireBearer(req, res);
  if (!ctx) return true;

  // GET /api/v2/admin/agents — list
  if (method === 'GET' && u.pathname === '/api/v2/admin/agents') {
    if (!requireAnyScope(ctx, ['agent:read', 'agent:admin'])) {
      jsonResponse(res, 403, { error: 'insufficient_scope', required: 'agent:read OR agent:admin' });
      return true;
    }
    try {
      const rows = await db.select().from(agents)
        .where(eq(agents.tenantId, ctx.tenantId || '00000000-0000-0000-0000-000000000000'))
        .orderBy(desc(agents.createdAt));
      jsonResponse(res, 200, { agents: rows });
      return true;
    } catch (err) {
      jsonResponse(res, 500, { error: 'internal_error', message: String(err) });
      return true;
    }
  }

  // POST /api/v2/admin/agents — create
  if (method === 'POST' && u.pathname === '/api/v2/admin/agents') {
    if (!requireAnyScope(ctx, ['agent:admin'])) {
      jsonResponse(res, 403, { error: 'insufficient_scope', required: 'agent:admin' });
      return true;
    }
    try {
      const body = await parseJsonBody(req);
      const result = await db.insert(agents).values({
        tenantId: ctx.tenantId || '00000000-0000-0000-0000-000000000000',
        name: body.name,
        description: body.description || null,
        systemPrompt: body.systemPrompt || '',
        roleTemplate: body.roleTemplate || 'general',
        capabilities: body.capabilities || [],
        tools: body.tools || [],
        isActive: true,
      }).returning();
      jsonResponse(res, 201, { agent: result[0] });
      return true;
    } catch (err) {
      jsonResponse(res, 500, { error: 'internal_error', message: String(err) });
      return true;
    }
  }

  // GET /api/v2/admin/agents/:id — detail
  const detailMatch = u.pathname.match(/^\/api\/v2\/admin\/agents\/([^/]+)$/);
  if (method === 'GET' && detailMatch) {
    if (!requireAnyScope(ctx, ['agent:read', 'agent:admin'])) {
      jsonResponse(res, 403, { error: 'insufficient_scope', required: 'agent:read OR agent:admin' });
      return true;
    }
    const id = detailMatch[1];
    try {
      const [row] = await db.select().from(agents).where(eq(agents.id, id)).limit(1);
      if (!row) { jsonResponse(res, 404, { error: 'not_found' }); return true; }
      jsonResponse(res, 200, { agent: row });
      return true;
    } catch (err) {
      jsonResponse(res, 500, { error: 'internal_error', message: String(err) });
      return true;
    }
  }

  // PATCH /api/v2/admin/agents/:id — update
  if (method === 'PATCH' && detailMatch) {
    if (!requireAnyScope(ctx, ['agent:admin'])) {
      jsonResponse(res, 403, { error: 'insufficient_scope', required: 'agent:admin' });
      return true;
    }
    const id = detailMatch[1];
    try {
      const body = await parseJsonBody(req);
      const updates: any = {};
      if (body.name !== undefined) updates.name = body.name;
      if (body.description !== undefined) updates.description = body.description;
      if (body.systemPrompt !== undefined) updates.systemPrompt = body.systemPrompt;
      if (body.isActive !== undefined) updates.isActive = !!body.isActive;
      updates.updatedAt = new Date();
      const [row] = await db.update(agents).set(updates).where(eq(agents.id, id)).returning();
      if (!row) { jsonResponse(res, 404, { error: 'not_found' }); return true; }
      jsonResponse(res, 200, { agent: row });
      return true;
    } catch (err) {
      jsonResponse(res, 500, { error: 'internal_error', message: String(err) });
      return true;
    }
  }

  // DELETE /api/v2/admin/agents/:id
  if (method === 'DELETE' && detailMatch) {
    if (!requireAnyScope(ctx, ['agent:admin'])) {
      jsonResponse(res, 403, { error: 'insufficient_scope', required: 'agent:admin' });
      return true;
    }
    const id = detailMatch[1];
    try {
      await db.delete(agents).where(eq(agents.id, id));
      jsonResponse(res, 200, { deleted: id });
      return true;
    } catch (err) {
      jsonResponse(res, 500, { error: 'internal_error', message: String(err) });
      return true;
    }
  }

  jsonResponse(res, 404, { error: 'not_found' });
  return true;
}
```

Modify `src/api/http-server.ts`:import + 注册路由(在 models-pool 之后)。

`tsc` 检查无错 → commit H3c.1。

---

## Task 2: 前端 AgentsView (H3c.2)

### Step 1: 写测试

Create `web/src/components/__tests__/AgentsView.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AgentsView } from '../AgentsView';

vi.mock('../../store', () => ({
  useStore: (selector: any) => selector({ token: 'test-token' }),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

const mockAgents = {
  agents: [
    { id: 'a1', name: 'Sales Agent', description: '...', isActive: true, roleTemplate: 'sales' },
    { id: 'a2', name: 'Support Agent', description: '...', isActive: true, roleTemplate: 'support' },
  ],
};

global.fetch = vi.fn((url: string) => {
  if (url.endsWith('/api/v2/admin/agents')) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve(mockAgents) } as Response);
  }
  return Promise.resolve({ ok: false, json: () => Promise.resolve({}) } as Response);
}) as any;

describe('AgentsView', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders agent list', async () => {
    render(<MemoryRouter><AgentsView /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('Sales Agent')).toBeInTheDocument();
      expect(screen.getByText('Support Agent')).toBeInTheDocument();
    });
  });

  it('has new agent button', async () => {
    render(<MemoryRouter><AgentsView /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText(/agents\.newAgent/)).toBeInTheDocument();
    });
  });
});
```

### Step 2: 实现 AgentsView

Create `web/src/components/AgentsView.tsx`:

```typescript
import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store';
import s from './AgentsView.module.css';

interface Agent {
  id: string;
  name: string;
  description?: string;
  systemPrompt?: string;
  isActive?: boolean;
  roleTemplate?: string;
}

async function fetchJSON(url: string, token: string | null, opts: any = {}): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function AgentsView() {
  const { t } = useTranslation();
  const token = useStore((st) => st.token);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Agent | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const d = await fetchJSON('/api/v2/admin/agents', token);
      setAgents(d.agents || []);
    } catch {
      setError(t('agents.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [token, t]);

  useEffect(() => { load(); }, [load]);

  async function handleNew() {
    const name = prompt(t('agents.newNamePrompt'));
    if (!name) return;
    try {
      const result = await fetchJSON('/api/v2/admin/agents', token, {
        method: 'POST',
        body: JSON.stringify({ name, systemPrompt: 'You are a helpful assistant.', roleTemplate: 'general' }),
      });
      await load();
      setSelected(result.agent);
    } catch (err) {
      alert(`${t('agents.createFailed')}: ${err}`);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t('agents.deleteConfirm'))) return;
    try {
      await fetchJSON(`/api/v2/admin/agents/${id}`, token, { method: 'DELETE' });
      setSelected(null);
      await load();
    } catch (err) {
      alert(`${t('agents.deleteFailed')}: ${err}`);
    }
  }

  if (loading) return <div className={s.loading}>{t('agents.loading')}</div>;
  if (error) return <div className={s.error}>{error}</div>;

  return (
    <div className={s.root}>
      <header className={s.header}>
        <h1 className={s.title}>{t('agents.title')}</h1>
        <button className={s.newBtn} data-testid="new-agent-btn" onClick={handleNew}>
          + {t('agents.newAgent')}
        </button>
      </header>

      <table className={s.table} data-testid="agents-table">
        <thead>
          <tr>
            <th>{t('agents.colName')}</th>
            <th>{t('agents.colRole')}</th>
            <th>{t('agents.colStatus')}</th>
            <th>{t('agents.colActions')}</th>
          </tr>
        </thead>
        <tbody>
          {agents.map((a) => (
            <tr key={a.id} data-testid={`agent-row-${a.id}`}>
              <td>
                <button className={s.linkBtn} onClick={() => setSelected(a)}>{a.name}</button>
                {a.description && <div className={s.desc}>{a.description}</div>}
              </td>
              <td>{a.roleTemplate || '—'}</td>
              <td>
                <span className={a.isActive ? s.statusActive : s.statusInactive}>
                  {a.isActive ? t('agents.active') : t('agents.disabled')}
                </span>
              </td>
              <td>
                <button className={s.btn} onClick={() => setSelected(a)}>{t('agents.detail')}</button>
                <button className={s.btnDanger} onClick={() => handleDelete(a.id)}>
                  {t('agents.delete')}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {selected && (
        <div className={s.modal} onClick={() => setSelected(null)}>
          <div className={s.modalContent} onClick={(e) => e.stopPropagation()}>
            <button className={s.modalClose} onClick={() => setSelected(null)}>×</button>
            <h2 className={s.modalTitle}>{selected.name}</h2>
            <dl className={s.detailList}>
              <dt>{t('agents.colRole')}</dt><dd>{selected.roleTemplate || '—'}</dd>
              <dt>{t('agents.colStatus')}</dt>
              <dd>{selected.isActive ? t('agents.active') : t('agents.disabled')}</dd>
              <dt>{t('agents.id')}</dt><dd className={s.mono}>{selected.id}</dd>
              <dt>{t('agents.systemPrompt')}</dt>
              <dd className={s.prompt}>{selected.systemPrompt || '—'}</dd>
              <dt>{t('agents.description')}</dt><dd>{selected.description || '—'}</dd>
            </dl>
            <div className={s.modalActions}>
              <button className={s.btnDanger} onClick={() => handleDelete(selected.id)}>
                {t('agents.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

### Step 3: CSS

Create `web/src/components/AgentsView.module.css`(类似 ModelsView,加 modal)。

### Step 4: 挂路由 + i18n

App.tsx 加 `const AgentsView = lazy(...)`,改路由 `/app/agents` 元素用 AgentsView。zh.json + en.json 加 agents 块。

### Step 5: 测试 + build + commit

```bash
cd web && npm test  # 23 tests
./node_modules/.bin/vite build
git add ... && git commit -m "feat(plan-H3c.2): AgentsView (列表 + 详情 modal + 新建/删除)"
```

---

## Task 3: 部署 + 验证 + handoff (H3c.3)

按 H3a/H3b 模板:merge → reload → e2e → handoff → commit。
