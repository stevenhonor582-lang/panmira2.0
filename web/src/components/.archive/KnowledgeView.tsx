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
  if (!res.ok) return null;
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
