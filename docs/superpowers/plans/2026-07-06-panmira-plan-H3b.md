# Panmira Plan H3b · 数智底座页(KB 列表 + 检索测试)

> **Goal:** 给 /app/knowledge 加 spec § 14 描述的"数智底座":KB 列表 + 文档列表 + 上传 + 检索测试。

**Architecture:**
- **后端已实装**(Plan B-2 完成),前端只用现有 API
- 前端 KnowledgeView 组件:KB 列表 + 文档详情 + 上传按钮 + 检索测试框
- 复用 KB CRUD:`GET /api/v2/admin/knowledge-bases`、`POST .../documents/upload`、`GET .../search`

**Tech Stack:**
- 前端:React 19 + CSS Modules

## 全局约束

- worktree: /home/ubuntu/panmira-H3b,branch: feat/plan-H3b-knowledge
- 不改后端代码
- 复用 Plan B-2 端点

---

## Task 1: 前端 KnowledgeView (H3b.1)

### Step 1: 写测试

Create `web/src/components/__tests__/KnowledgeView.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { KnowledgeView } from '../KnowledgeView';

vi.mock('../../store', () => ({
  useStore: (selector: any) => selector({ token: 'test-token' }),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

const mockKBs = {
  data: [{
    id: 'kb-1', name: 'E2E Test KB', type: 'product', visibility: 'team',
    indexStatus: 'ready', documentCount: 2, chunkCount: 2,
  }],
};
const mockDocs = {
  documents: [
    { id: 'd1', title: 'doc1.txt', kbId: 'kb-1', status: 'ready', chunkCount: 1 },
  ],
};

global.fetch = vi.fn((url: string) => {
  if (url.includes('/knowledge-bases/') && url.endsWith('/documents')) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve(mockDocs) } as Response);
  }
  if (url.includes('/knowledge-bases')) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve(mockKBs) } as Response);
  }
  if (url.includes('/search')) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ chunks: [{ content: 'chunk1', score: 0.9 }] }) } as Response);
  }
  return Promise.resolve({ ok: false, json: () => Promise.resolve({}) } as Response);
}) as any;

describe('KnowledgeView', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders KB list', async () => {
    render(<MemoryRouter><KnowledgeView /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('E2E Test KB')).toBeInTheDocument();
    });
  });

  it('has upload button', async () => {
    render(<MemoryRouter><KnowledgeView /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText(/knowledge\.upload/)).toBeInTheDocument();
    });
  });

  it('has search input', async () => {
    render(<MemoryRouter><KnowledgeView /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/knowledge\.searchPlaceholder/)).toBeInTheDocument();
    });
  });
});
```

### Step 2: 实现 KnowledgeView

Create `web/src/components/KnowledgeView.tsx`:

```typescript
import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store';
import s from './KnowledgeView.module.css';

interface KB {
  id: string;
  name: string;
  type: string;
  visibility: string;
  indexStatus: string;
  documentCount: number;
  chunkCount: number;
}

interface Document {
  id: string;
  title: string;
  kbId: string;
  status: string;
  chunkCount: number;
}

interface SearchResult {
  chunks: Array<{ content: string; score: number; documentId?: string }>;
}

async function fetchJSON(url: string, token: string | null, opts: any = {}): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function KnowledgeView() {
  const { t } = useTranslation();
  const token = useStore((st) => st.token);
  const [kbs, setKbs] = useState<KB[]>([]);
  const [selectedKbId, setSelectedKbId] = useState<string | null>(null);
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult | null>(null);
  const [searching, setSearching] = useState(false);

  const loadKBs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const d = await fetchJSON('/api/v2/admin/knowledge-bases', token);
      setKbs(d.data || []);
      if (!selectedKbId && d.data?.length > 0) setSelectedKbId(d.data[0].id);
    } catch {
      setError(t('knowledge.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [token, t, selectedKbId]);

  const loadDocs = useCallback(async (kbId: string) => {
    try {
      const d = await fetchJSON(`/api/v2/admin/knowledge-bases/${kbId}/documents`, token);
      setDocs(d.documents || d.data || []);
    } catch {
      setDocs([]);
    }
  }, [token]);

  useEffect(() => { loadKBs(); }, [loadKBs]);
  useEffect(() => { if (selectedKbId) loadDocs(selectedKbId); }, [selectedKbId, loadDocs]);

  async function handleSearch() {
    if (!query.trim() || !selectedKbId) return;
    setSearching(true);
    try {
      const result = await fetchJSON(`/api/v2/admin/knowledge-bases/${selectedKbId}/search`, token);
      setSearchResults(result);
    } catch (err) {
      alert(`${t('knowledge.searchFailed')}: ${err}`);
    } finally {
      setSearching(false);
    }
  }

  async function handleUpload() {
    const title = prompt(t('knowledge.uploadPrompt'));
    if (!title || !selectedKbId) return;
    const content = prompt(t('knowledge.uploadContentPrompt'));
    if (!content) return;
    try {
      await fetchJSON(`/api/v2/admin/knowledge-bases/${selectedKbId}/documents/upload`, token, {
        method: 'POST',
        body: JSON.stringify({ title, content }),
      });
      await loadDocs(selectedKbId);
      await loadKBs();
      alert(t('knowledge.uploadOk'));
    } catch (err) {
      alert(`${t('knowledge.uploadFailed')}: ${err}`);
    }
  }

  if (loading) return <div className={s.loading}>{t('knowledge.loading')}</div>;
  if (error) return <div className={s.error}>{error}</div>;

  return (
    <div className={s.root}>
      <header className={s.header}>
        <h1 className={s.title}>{t('knowledge.title')}</h1>
        <button className={s.uploadBtn} onClick={handleUpload} disabled={!selectedKbId}>
          + {t('knowledge.upload')}
        </button>
      </header>

      <div className={s.layout}>
        <aside className={s.kbList}>
          <div className={s.kbListTitle}>{t('knowledge.knowledgeBases')}</div>
          {kbs.map((kb) => (
            <button
              key={kb.id}
              data-testid={`kb-${kb.id}`}
              className={selectedKbId === kb.id ? `${s.kbItem} ${s.kbItemActive}` : s.kbItem}
              onClick={() => setSelectedKbId(kb.id)}
            >
              <div className={s.kbName}>{kb.name}</div>
              <div className={s.kbMeta}>
                {kb.type} · {kb.documentCount} {t('knowledge.docs')} · {kb.indexStatus}
              </div>
            </button>
          ))}
        </aside>

        <main className={s.detail}>
          {selectedKbId ? (
            <>
              <section className={s.section}>
                <h2 className={s.sectionTitle}>{t('knowledge.documents')}</h2>
                <table className={s.table}>
                  <thead>
                    <tr>
                      <th>{t('knowledge.colTitle')}</th>
                      <th>{t('knowledge.colStatus')}</th>
                      <th>{t('knowledge.colChunks')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {docs.map((d) => (
                      <tr key={d.id}>
                        <td>{d.title}</td>
                        <td><span className={s.statusBadge}>{d.status}</span></td>
                        <td>{d.chunkCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              <section className={s.section}>
                <h2 className={s.sectionTitle}>{t('knowledge.search')}</h2>
                <div className={s.searchRow}>
                  <input
                    className={s.searchInput}
                    placeholder={t('knowledge.searchPlaceholder')}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  />
                  <button className={s.searchBtn} onClick={handleSearch} disabled={searching || !query.trim()}>
                    {searching ? '...' : t('knowledge.searchBtn')}
                  </button>
                </div>
                {searchResults && (
                  <div className={s.results}>
                    <div className={s.resultsMeta}>{searchResults.chunks.length} {t('knowledge.results')}</div>
                    {searchResults.chunks.map((chunk, i) => (
                      <div key={i} className={s.result}>
                        <div className={s.resultScore}>score: {chunk.score?.toFixed(3) || 'N/A'}</div>
                        <div className={s.resultContent}>{chunk.content}</div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          ) : (
            <div className={s.empty}>{t('knowledge.empty')}</div>
          )}
        </main>
      </div>
    </div>
  );
}
```

### Step 3: CSS

Create `web/src/components/KnowledgeView.module.css`:

```css
.root { padding: 1rem 0; }
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}
.title { font-size: 1.4rem; font-weight: 700; margin: 0; }
.uploadBtn {
  padding: 0.5rem 1rem;
  background: rgba(99, 102, 241, 0.15);
  border: 1px solid rgba(99, 102, 241, 0.4);
  border-radius: 6px;
  color: #818cf8;
  cursor: pointer;
  font-size: 0.9rem;
}
.uploadBtn:hover:not(:disabled) { background: rgba(99, 102, 241, 0.25); }
.uploadBtn:disabled { opacity: 0.5; cursor: not-allowed; }

.layout {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 1.5rem;
}
.kbList {
  background: var(--bg-elevated, #0c0c11);
  border: 1px solid var(--border, rgba(255, 255, 255, 0.06));
  border-radius: 12px;
  padding: 0.75rem;
  max-height: 70vh;
  overflow-y: auto;
}
.kbListTitle {
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-tertiary, #888);
  padding: 0.25rem 0.5rem 0.5rem;
}
.kbItem {
  display: block;
  width: 100%;
  text-align: left;
  padding: 0.625rem 0.75rem;
  margin-bottom: 0.25rem;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  color: var(--text-secondary, #aaa);
  cursor: pointer;
}
.kbItem:hover { background: var(--bg-hover, rgba(255, 255, 255, 0.04)); }
.kbItemActive {
  background: rgba(99, 102, 241, 0.15);
  border-color: rgba(99, 102, 241, 0.3);
  color: var(--text-primary, #f0f0f2);
}
.kbName { font-size: 0.9rem; font-weight: 500; margin-bottom: 0.25rem; }
.kbMeta { font-size: 0.75rem; color: var(--text-tertiary, #888); }

.detail {
  background: var(--bg-elevated, #0c0c11);
  border: 1px solid var(--border, rgba(255, 255, 255, 0.06));
  border-radius: 12px;
  padding: 1.5rem;
  min-height: 60vh;
}
.section { margin-bottom: 2rem; }
.section:last-child { margin-bottom: 0; }
.sectionTitle {
  font-size: 1.05rem;
  font-weight: 600;
  margin: 0 0 1rem 0;
  color: var(--text-primary, #f0f0f2);
}

.table {
  width: 100%;
  border-collapse: collapse;
  background: var(--bg-base, #050508);
  border: 1px solid var(--border, rgba(255, 255, 255, 0.04));
  border-radius: 8px;
  overflow: hidden;
}
.table th, .table td {
  padding: 0.625rem 0.875rem;
  text-align: left;
  border-bottom: 1px solid var(--border, rgba(255, 255, 255, 0.04));
  font-size: 0.85rem;
}
.table th {
  background: rgba(255, 255, 255, 0.02);
  font-weight: 600;
  color: var(--text-tertiary, #888);
  font-size: 0.75rem;
  text-transform: uppercase;
}
.statusBadge {
  display: inline-block;
  padding: 0.125rem 0.5rem;
  background: rgba(34, 197, 94, 0.15);
  color: #4ade80;
  border-radius: 3px;
  font-size: 0.75rem;
}

.searchRow { display: flex; gap: 0.5rem; margin-bottom: 1rem; }
.searchInput {
  flex: 1;
  padding: 0.5rem 0.875rem;
  background: var(--bg-base, #050508);
  border: 1px solid var(--border, rgba(255, 255, 255, 0.08));
  border-radius: 6px;
  color: var(--text-primary, #f0f0f2);
  font-size: 0.9rem;
  outline: none;
}
.searchInput:focus { border-color: rgba(99, 102, 241, 0.5); }
.searchBtn {
  padding: 0.5rem 1rem;
  background: rgba(99, 102, 241, 0.15);
  border: 1px solid rgba(99, 102, 241, 0.4);
  border-radius: 6px;
  color: #818cf8;
  cursor: pointer;
}
.searchBtn:hover:not(:disabled) { background: rgba(99, 102, 241, 0.25); }
.searchBtn:disabled { opacity: 0.5; cursor: not-allowed; }

.results { display: flex; flex-direction: column; gap: 0.5rem; }
.resultsMeta {
  font-size: 0.78rem;
  color: var(--text-tertiary, #888);
  margin-bottom: 0.25rem;
}
.result {
  padding: 0.75rem;
  background: var(--bg-base, #050508);
  border: 1px solid var(--border, rgba(255, 255, 255, 0.06));
  border-radius: 6px;
}
.resultScore {
  font-size: 0.7rem;
  color: #818cf8;
  margin-bottom: 0.375rem;
  font-family: ui-monospace, monospace;
}
.resultContent {
  font-size: 0.85rem;
  color: var(--text-primary, #f0f0f2);
  line-height: 1.5;
  white-space: pre-wrap;
}

.loading, .error, .empty {
  padding: 3rem;
  text-align: center;
  color: var(--text-tertiary, #888);
}
.error { color: #f87171; }

@media (max-width: 768px) {
  .layout { grid-template-columns: 1fr; }
}
```

### Step 4: 挂路由

Modify `web/src/App.tsx`:
- 加 lazy import: `const KnowledgeView = lazy(() => import('./components/KnowledgeView').then(m => ({ default: m.KnowledgeView })));`
- 改路由: `<Route path="/app/knowledge" element={<AdminLayout><KnowledgeView /></AdminLayout>} />`

### Step 5: i18n

zh.json 加:
```json
{
  "knowledge": {
    "title": "数智底座",
    "upload": "上传文档",
    "uploadPrompt": "文档标题?",
    "uploadContentPrompt": "文档内容(纯文本)?",
    "uploadOk": "上传成功",
    "uploadFailed": "上传失败",
    "knowledgeBases": "知识库",
    "documents": "文档列表",
    "docs": "文档",
    "colTitle": "标题",
    "colStatus": "状态",
    "colChunks": "Chunks",
    "search": "检索测试",
    "searchBtn": "搜索",
    "searchPlaceholder": "输入查询...",
    "searchFailed": "搜索失败",
    "results": "条结果",
    "empty": "请选择左侧知识库",
    "loadFailed": "加载失败",
    "loading": "加载中..."
  }
}
```
en.json 同步加(略)

### Step 6: 测试 + build

```bash
cd web && npm test 2>&1 | tail -15
./node_modules/.bin/vite build 2>&1 | tail -3
```
Expected: 21 tests PASS (18 + 3 KnowledgeView)

### Step 7: Commit

```bash
cd /home/ubuntu/panmira-H3b
git add web/src/components/KnowledgeView.tsx web/src/components/KnowledgeView.module.css web/src/components/__tests__/KnowledgeView.test.tsx web/src/App.tsx web/src/i18n/locales/zh.json web/src/i18n/locales/en.json
git commit -m "feat(plan-H3b.1): KnowledgeView (KB 列表 + 文档 + 上传 + 检索)"
```

---

## Task 2: 部署 + 验证 + handoff (H3b.2)

### Step 1: Build + merge

```bash
cd web && ./node_modules/.bin/vite build
node /home/ubuntu/panmira-H3b/scripts/copy-web-staging.mjs
cd /home/ubuntu/panmira
git checkout fix/memory-system-2026-06-27
git merge --no-ff feat/plan-H3b-knowledge -m "merge: plan-H3b 数智底座页"
```

### Step 2: pm2 reload + e2e

```bash
pm2 reload panmira
# 建 test client with knowledge:read
HASH=$(echo -n 'test-secret-h3b' | sha256sum | awk '{print $1}')
PGPASSWORD=ubuntu psql -h localhost -U ubuntu -d metabot -c "INSERT INTO oauth_clients (client_id, name, type, client_secret_hash, scopes, status) VALUES ('h3b-kb-test', 'H3b Test', 'service', '$HASH', '[\"knowledge:read\",\"knowledge:admin\",\"knowledge:write\"]'::jsonb, 'active') ON CONFLICT (client_id) DO UPDATE SET client_secret_hash = EXCLUDED.client_secret_hash;"
TOKEN=$(curl -sS -m 5 -X POST https://deepx.fun/oauth/token -H 'Content-Type: application/json' -d '{"grant_type":"client_credentials","client_id":"h3b-kb-test","client_secret":"test-secret-h3b","scope":"knowledge:read"}' | python3 -c "import json,sys;print(json.load(sys.stdin)['access_token'])")
curl -sS -m 5 -H "Authorization: Bearer $TOKEN" https://deepx.fun/api/v2/admin/knowledge-bases | python3 -m json.tool | head -20
curl -sS -m 5 -o /dev/null -w '/web/app/knowledge: HTTP %{http_code}\n' https://deepx.fun/web/app/knowledge
```

### Step 3: handoff + commit

```bash
cat > .claude/handoff-2026-07-06-panmira-plan-H3b.md << EOF
(同 H3a 风格)
EOF
git add .claude/handoff-2026-07-06-panmira-plan-H3b.md
git commit -m "docs(handoff): plan-H3b 数智底座页 部署完成"
```

---

## 验收
- [ ] 21 tests pass
- [ ] vite build 成功
- [ ] /api/v2/admin/knowledge-bases 返回 1 个 KB (E2E Test KB)
- [ ] /web/app/knowledge HTTP 200

## 下一步(Plan H3c 候选)
- H3c Agent 列表(列表 + 详情)
- 修后端 baseline TS 错误
