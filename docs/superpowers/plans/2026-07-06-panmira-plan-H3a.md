# Panmira Plan H3a · 模型池页(LLM + Embedding 列表 + 测试)

> **Goal:** 给 /app/models 加 spec § 14 描述的"模型池":LLM + Embedding 合并列表 + 新建 + 测试按钮 + 启用/禁用。

**Architecture:**
- 后端新增 `GET/POST /api/v2/admin/models` + `POST /api/v2/admin/models/:id/test` + `PATCH /api/v2/admin/models/:id`
- LLM 走 provider_configs,Embedding 走 embedding_providers,合并响应带 `type` 字段
- 前端 ModelsView 组件,挂在 /app/models 路由

**Tech Stack:**
- 后端:Node TS + Drizzle ORM + pg(沿用)
- 前端:React 19 + CSS Modules

## 全局约束

- 后端需 Bearer token + scope (model:read / model:admin)
- 不引入新依赖
- 复用现有 provider-routes.ts 的 test 逻辑(但走 v2 admin 路径)
- worktree: /home/ubuntu/panmira-H3a,branch: feat/plan-H3a-models-pool

---

## Task 1: 后端 models-pool API (H3a.1)

### Step 1: 写 models-pool-routes.ts

Create `src/api/routes/models-pool-routes.ts`:

```typescript
import type * as http from 'node:http';
import { eq, sql } from 'drizzle-orm';
import { pool } from '../../db/index.js';
import { jsonResponse, parseJsonBody } from './helpers.js';
import { requireBearer, requireAnyScope } from '../oauth-middleware.js';

export async function handleModelsPoolRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  method: string,
  url: string,
): Promise<boolean> {
  const u = new URL(url, 'http://localhost');
  if (!u.pathname.startsWith('/api/v2/admin/models')) return false;

  const ctx = await requireBearer(req, res);
  if (!ctx) return true;

  // GET /api/v2/admin/models — 合并 LLM + Embedding 列表
  if (method === 'GET' && u.pathname === '/api/v2/admin/models') {
    if (!requireAnyScope(ctx, ['model:read', 'model:admin'])) {
      jsonResponse(res, 403, { error: 'insufficient_scope', required: 'model:read OR model:admin' });
      return true;
    }
    try {
      const llmRes = await pool.query(`
        SELECT id, name, type, base_url, model, is_default, created_at
        FROM provider_configs ORDER BY name
      `);
      const embRes = await pool.query(`
        SELECT id, name, base_url, model_name AS model, dimensions, status, created_at
        FROM embedding_providers ORDER BY name
      `);
      const models = [
        ...llmRes.rows.map((r: any) => ({
          id: r.id, type: 'llm', name: r.name, baseUrl: r.base_url, model: r.model,
          isDefault: r.is_default, status: 'active', createdAt: r.created_at,
        })),
        ...embRes.rows.map((r: any) => ({
          id: r.id, type: 'embedding', name: r.name, baseUrl: r.base_url, model: r.model,
          dimensions: r.dimensions, status: r.status || 'active', createdAt: r.created_at,
        })),
      ];
      jsonResponse(res, 200, { models });
      return true;
    } catch (err) {
      jsonResponse(res, 500, { error: 'internal_error', message: String(err) });
      return true;
    }
  }

  // POST /api/v2/admin/models — create LLM or Embedding provider
  if (method === 'POST' && u.pathname === '/api/v2/admin/models') {
    if (!requireAnyScope(ctx, ['model:admin'])) {
      jsonResponse(res, 403, { error: 'insufficient_scope', required: 'model:admin' });
      return true;
    }
    try {
      const body = await parseJsonBody(req);
      const type = (body.type || 'llm') as string;
      if (type === 'llm') {
        const result = await pool.query(
          `INSERT INTO provider_configs (name, type, base_url, api_key_encrypted, model, is_default)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, name, type, base_url, model, is_default`,
          [body.name, body.providerType || 'openai', body.baseUrl, body.apiKey || '', body.model || '', !!body.isDefault]
        );
        jsonResponse(res, 201, { model: result.rows[0] });
        return true;
      } else if (type === 'embedding') {
        const result = await pool.query(
          `INSERT INTO embedding_providers (name, base_url, api_key_encrypted, model_name, dimensions, status)
           VALUES ($1, $2, $3, $4, $5, 'active') RETURNING id, name, base_url, model_name, dimensions, status`,
          [body.name, body.baseUrl, body.apiKey || '', body.model || '', Number(body.dimensions) || 1024]
        );
        jsonResponse(res, 201, { model: result.rows[0] });
        return true;
      } else {
        jsonResponse(res, 400, { error: 'invalid_type', message: `type must be llm or embedding` });
        return true;
      }
    } catch (err) {
      jsonResponse(res, 500, { error: 'internal_error', message: String(err) });
      return true;
    }
  }

  // POST /api/v2/admin/models/:id/test — 测试 provider
  if (method === 'POST' && u.pathname.match(/^\/api\/v2\/admin\/models\/[^/]+\/test$/)) {
    if (!requireAnyScope(ctx, ['model:test', 'model:read', 'model:admin'])) {
      jsonResponse(res, 403, { error: 'insufficient_scope', required: 'model:test OR model:read OR model:admin' });
      return true;
    }
    const id = u.pathname.split('/')[5];
    try {
      // LLM 测试:尝试调用 /models 端点
      const r = await pool.query(`SELECT base_url, api_key_encrypted, model FROM provider_configs WHERE id = $1`, [id]);
      if (r.rows.length === 0) {
        jsonResponse(res, 404, { error: 'not_found' });
        return true;
      }
      const row = r.rows[0];
      const start = Date.now();
      try {
        const resp = await fetch(`${row.base_url}/models`, {
          headers: row.api_key_encrypted ? { Authorization: `Bearer ${row.api_key_encrypted}` } : {},
          signal: AbortSignal.timeout(5000),
        });
        const latencyMs = Date.now() - start;
        jsonResponse(res, 200, {
          ok: resp.ok,
          status: resp.status,
          latencyMs,
          message: resp.ok ? '连通' : `HTTP ${resp.status}`,
        });
      } catch (fetchErr) {
        jsonResponse(res, 200, { ok: false, error: String(fetchErr), latencyMs: Date.now() - start });
      }
      return true;
    } catch (err) {
      jsonResponse(res, 500, { error: 'internal_error', message: String(err) });
      return true;
    }
  }

  // PATCH /api/v2/admin/models/:id — 启用/禁用(只支持 embedding providers,LLM 没 status 字段)
  if (method === 'PATCH' && u.pathname.match(/^\/api\/v2\/admin\/models\/[^/]+$/)) {
    if (!requireAnyScope(ctx, ['model:admin'])) {
      jsonResponse(res, 403, { error: 'insufficient_scope', required: 'model:admin' });
      return true;
    }
    const id = u.pathname.split('/')[5];
    try {
      const body = await parseJsonBody(req);
      const status = (body.status || 'active') as string;
      // 尝试 embedding_providers
      const result = await pool.query(
        `UPDATE embedding_providers SET status = $1 WHERE id = $2 RETURNING id, status`,
        [status, id]
      );
      if (result.rows.length === 0) {
        jsonResponse(res, 404, { error: 'not_found', message: 'provider not found or does not support status toggle' });
        return true;
      }
      jsonResponse(res, 200, { updated: result.rows[0] });
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

### Step 2: 注册路由

Modify `src/api/http-server.ts`:
- 在 `import { handleDashboardRoutes }` 附近加 `import { handleModelsPoolRoutes } from './routes/models-pool-routes.js';`
- 在 `if (await handleDashboardRoutes(...))` 之后加 `if (await handleModelsPoolRoutes(...))`

### Step 3: tsc 检查

```bash
cd /home/ubuntu/panmira-H3a && rm -f dist/api/routes/models-pool-routes.js* && ./node_modules/.bin/tsc 2>&1 | grep models-pool | head -5 || echo "no errors"
```
Expected: 无新错误

### Step 4: Commit

```bash
git add src/api/routes/models-pool-routes.ts src/api/http-server.ts
git commit -m "feat(plan-H3a.1): models-pool API (LLM + Embedding 合并 list/create/test/toggle)"
```

---

## Task 2: 前端 ModelsView (H3a.2)

### Step 1: 写测试

Create `web/src/components/__tests__/ModelsView.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ModelsView } from '../ModelsView';

vi.mock('../../store', () => ({
  useStore: (selector: any) => selector({ token: 'test-token' }),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

const mockModels = {
  models: [
    { id: '1', type: 'llm', name: 'GLM', baseUrl: 'https://x', model: 'glm-4', isDefault: true, status: 'active' },
    { id: '2', type: 'embedding', name: 'BGE', baseUrl: 'https://y', model: 'bge-m3', dimensions: 1024, status: 'active' },
  ],
};

global.fetch = vi.fn((url: string) => {
  if (url.endsWith('/api/v2/admin/models') && !url.includes('/test')) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve(mockModels) } as Response);
  }
  return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, latencyMs: 42 }) } as Response);
}) as any;

describe('ModelsView', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders list of LLM and Embedding models', async () => {
    render(<MemoryRouter><ModelsView /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('GLM')).toBeInTheDocument();
      expect(screen.getByText('BGE')).toBeInTheDocument();
    });
  });

  it('has new model button', async () => {
    render(<MemoryRouter><ModelsView /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('models.newModel')).toBeInTheDocument();
    });
  });

  it('has test button for each model', async () => {
    render(<MemoryRouter><ModelsView /></ModelsView></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getAllByText('models.test').length).toBeGreaterThan(0);
    });
  });
});
```

### Step 2: 实现 ModelsView

Create `web/src/components/ModelsView.tsx`:

```typescript
import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store';
import s from './ModelsView.module.css';

interface Model {
  id: string;
  type: 'llm' | 'embedding';
  name: string;
  baseUrl: string;
  model: string;
  isDefault?: boolean;
  dimensions?: number;
  status: string;
}

async function fetchJSON(url: string, token: string | null): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function ModelsView() {
  const { t } = useTranslation();
  const token = useStore((st) => st.token);
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadModels = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const d = await fetchJSON('/api/v2/admin/models', token);
      setModels(d.models || []);
    } catch {
      setError(t('models.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [token, t]);

  useEffect(() => { loadModels(); }, [loadModels]);

  async function handleTest(id: string) {
    try {
      const result = await fetchJSON(`/api/v2/admin/models/${id}/test`, token);
      alert(result.ok ? `${t('models.testOk')} (${result.latencyMs}ms)` : `${t('models.testFailed')}: ${result.error || result.status}`);
    } catch (err) {
      alert(`${t('models.testFailed')}: ${err}`);
    }
  }

  async function handleToggle(id: string, currentStatus: string) {
    const newStatus = currentStatus === 'active' ? 'disabled' : 'active';
    try {
      await fetchJSON(`/api/v2/admin/models/${id}`, token);
      // PATCH not implemented for GET helper — use direct fetch
      await fetch(`/api/v2/admin/models/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ status: newStatus }),
      });
      await loadModels();
    } catch (err) {
      alert(`${t('models.toggleFailed')}: ${err}`);
    }
  }

  if (loading) return <div className={s.loading}>{t('models.loading')}</div>;
  if (error) return <div className={s.error}>{error}</div>;

  return (
    <div className={s.root}>
      <header className={s.header}>
        <h1 className={s.title}>{t('models.title')}</h1>
        <button className={s.newBtn} onClick={() => alert(t('models.newModelHint'))}>
          + {t('models.newModel')}
        </button>
      </header>

      <table className={s.table}>
        <thead>
          <tr>
            <th>{t('models.colName')}</th>
            <th>{t('models.colType')}</th>
            <th>{t('models.colModel')}</th>
            <th>{t('models.colStatus')}</th>
            <th>{t('models.colActions')}</th>
          </tr>
        </thead>
        <tbody>
          {models.map((m) => (
            <tr key={m.id}>
              <td>
                {m.name}
                {m.isDefault && <span className={s.badge}>{t('models.default')}</span>}
              </td>
              <td>{m.type === 'llm' ? t('models.typeLlm') : t('models.typeEmbedding')}</td>
              <td className={s.mono}>{m.model}</td>
              <td>
                <span className={m.status === 'active' ? s.statusActive : s.statusInactive}>
                  {m.status === 'active' ? t('models.active') : t('models.disabled')}
                </span>
              </td>
              <td>
                <button className={s.btn} onClick={() => handleTest(m.id)}>
                  {t('models.test')}
                </button>
                <button className={s.btn} onClick={() => handleToggle(m.id, m.status)}>
                  {m.status === 'active' ? t('models.disable') : t('models.enable')}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

### Step 3: CSS

Create `web/src/components/ModelsView.module.css`:

```css
.root { padding: 1rem 0; }
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}
.title { font-size: 1.4rem; font-weight: 700; margin: 0; }
.newBtn {
  padding: 0.5rem 1rem;
  background: rgba(99, 102, 241, 0.15);
  border: 1px solid rgba(99, 102, 241, 0.4);
  border-radius: 6px;
  color: #818cf8;
  cursor: pointer;
  font-size: 0.9rem;
}
.newBtn:hover { background: rgba(99, 102, 241, 0.25); }

.table {
  width: 100%;
  border-collapse: collapse;
  background: var(--bg-elevated, #0c0c11);
  border: 1px solid var(--border, rgba(255, 255, 255, 0.06));
  border-radius: 12px;
  overflow: hidden;
}
.table th, .table td {
  padding: 0.75rem 1rem;
  text-align: left;
  border-bottom: 1px solid var(--border, rgba(255, 255, 255, 0.04));
  font-size: 0.875rem;
}
.table th {
  background: rgba(255, 255, 255, 0.02);
  font-weight: 600;
  color: var(--text-tertiary, #888);
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.mono { font-family: ui-monospace, monospace; font-size: 0.8rem; color: var(--text-secondary, #aaa); }
.badge {
  display: inline-block;
  margin-left: 0.5rem;
  padding: 0.125rem 0.5rem;
  background: rgba(99, 102, 241, 0.2);
  color: #a5b4fc;
  border-radius: 3px;
  font-size: 0.7rem;
}
.statusActive {
  display: inline-block;
  padding: 0.125rem 0.5rem;
  background: rgba(34, 197, 94, 0.15);
  color: #4ade80;
  border-radius: 3px;
  font-size: 0.75rem;
}
.statusInactive {
  display: inline-block;
  padding: 0.125rem 0.5rem;
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
  border-radius: 3px;
  font-size: 0.75rem;
}
.btn {
  margin-right: 0.375rem;
  padding: 0.25rem 0.625rem;
  background: var(--bg-input, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--border, rgba(255, 255, 255, 0.08));
  border-radius: 4px;
  color: var(--text-secondary, #aaa);
  cursor: pointer;
  font-size: 0.8rem;
}
.btn:hover { background: var(--bg-hover, rgba(255, 255, 255, 0.08)); }
.loading, .error {
  padding: 2rem;
  text-align: center;
  color: var(--text-tertiary, #888);
}
.error { color: #f87171; }
```

### Step 4: 挂载路由

Modify `web/src/App.tsx`:
- 在 `const DashboardView = lazy(...)` 后面加 `const ModelsView = lazy(...)`:
```typescript
const ModelsView = lazy(() => import('./components/ModelsView').then(m => ({ default: m.ModelsView })));
```
- 改路由 `/app/models` 当前 placeholder 为真实组件:
```tsx
<Route path="/app/models" element={<AdminLayout><ModelsView /></AdminLayout>} />
```

### Step 5: i18n

Modify `web/src/i18n/locales/zh.json`,在顶层加 models 块:
```json
{
  "models": {
    "title": "模型池",
    "newModel": "新建 Provider",
    "newModelHint": "新建 Provider UI 在 Plan H3b 实装",
    "colName": "名称",
    "colType": "类型",
    "colModel": "模型",
    "colStatus": "状态",
    "colActions": "操作",
    "typeLlm": "LLM",
    "typeEmbedding": "Embedding",
    "default": "默认",
    "active": "启用",
    "disabled": "禁用",
    "enable": "启用",
    "disable": "禁用",
    "test": "测试",
    "testOk": "连通",
    "testFailed": "失败",
    "toggleFailed": "切换失败",
    "loadFailed": "加载失败",
    "loading": "加载中..."
  }
}
```

Modify `web/src/i18n/locales/en.json`: 同步加(略)

### Step 6: 跑测试 + build

```bash
cd web && npm test 2>&1 | tail -15
./node_modules/.bin/vite build 2>&1 | tail -5
```
Expected: 17 tests PASS (15 H1+H2 + 2 ModelsView)

### Step 7: Commit

```bash
cd /home/ubuntu/panmira-H3a
git add web/src/components/ModelsView.tsx web/src/components/ModelsView.module.css web/src/components/__tests__/ModelsView.test.tsx web/src/App.tsx web/src/i18n/locales/zh.json web/src/i18n/locales/en.json
git commit -m "feat(plan-H3a.2): ModelsView 组件 (LLM + Embedding 合并列表 + 测试按钮)"
```

---

## Task 3: 部署 + 验证 + handoff (H3a.3)

### Step 1: 后端 build + 前端 build

```bash
cd /home/ubuntu/panmira-H3a
rm -f dist/api/routes/models-pool-routes.js*
./node_modules/.bin/tsc 2>&1 | grep models-pool | head -5 || echo "✓"
cd web && ./node_modules/.bin/vite build 2>&1 | tail -3
node /home/ubuntu/panmira-H3a/scripts/copy-web-staging.mjs 2>&1 | tail -3
```

### Step 2: Merge

```bash
cd /home/ubuntu/panmira
git checkout fix/memory-system-2026-06-27
git merge --no-ff feat/plan-H3a-models-pool -m "merge: plan-H3a 模型池页"
```

### Step 3: pm2 reload

```bash
pm2 reload panmira 2>&1 | tail -3
sleep 3 && pm2 status panmira | grep panmira
```

### Step 4: e2e 验证

```bash
TOKEN=$(curl -sS -m 5 -X POST https://deepx.fun/oauth/token -H 'Content-Type: application/json' -d '{"grant_type":"client_credentials","client_id":"h2-dashboard-test","client_secret":"test-secret-h2-dashboard","scope":"reports:read"}' | python3 -c "import json,sys;print(json.load(sys.stdin)['access_token'])")
# 给该 client 加 model:read scope(revoke + recreate with more scopes)
# 或者建一个新 client:
HASH=$(echo -n 'test-secret-h3a' | sha256sum | awk '{print $1}')
PGPASSWORD=ubuntu psql -h localhost -U ubuntu -d metabot -c "DELETE FROM oauth_clients WHERE client_id='h3a-models-test'; INSERT INTO oauth_clients (client_id, name, type, client_secret_hash, scopes, status) VALUES ('h3a-models-test', 'H3a Test', 'service', '$HASH', '[\"model:read\",\"model:admin\",\"model:test\"]'::jsonb, 'active');"
TOKEN=$(curl -sS -m 5 -X POST https://deepx.fun/oauth/token -H 'Content-Type: application/json' -d '{"grant_type":"client_credentials","client_id":"h3a-models-test","client_secret":"test-secret-h3a","scope":"model:read"}' | python3 -c "import json,sys;print(json.load(sys.stdin)['access_token'])")
curl -sS -m 5 -H "Authorization: Bearer $TOKEN" https://deepx.fun/api/v2/admin/models | python3 -m json.tool | head -30
```

### Step 5: 写 handoff

Create `.claude/handoff-2026-07-06-panmira-plan-H3a.md`(结构同 H1/H2)

### Step 6: Commit handoff

```bash
cd /home/ubuntu/panmira
git add .claude/handoff-2026-07-06-panmira-plan-H3a.md
git commit -m "docs(handoff): plan-H3a 模型池页 部署完成"
```

---

## 验收
- [ ] 17 tests pass
- [ ] vite build 成功
- [ ] GET /api/v2/admin/models 返回合并 LLM + Embedding 列表
- [ ] /web/app/models 渲染 ModelsView
- [ ] 测试按钮可用
