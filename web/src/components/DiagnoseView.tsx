import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store';
import s from './StatusView.module.css';

async function fetchJSON(url: string, token: string | null): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function DiagnoseView() {
  const { t } = useTranslation();
  const token = useStore((st) => st.token);
  const [taskId, setTaskId] = useState('');
  const [result, setResult] = useState<any>(null);
  const [searching, setSearching] = useState(false);

  async function search() {
    if (!taskId.trim()) return;
    setSearching(true);
    try {
      const r = await fetchJSON(`/api/v2/admin/diagnose/${encodeURIComponent(taskId)}`, token);
      setResult(r);
    } catch (err) { setResult({ error: String(err) }); } finally { setSearching(false); }
  }

  return (
    <div className={s.root}>
      <h1 className={s.title}>{t('diagnose.title')}</h1>
      <div className={s.searchRow}>
        <input
          className={s.searchInput}
          placeholder={t('diagnose.taskIdPlaceholder')}
          value={taskId}
          onChange={(e) => setTaskId(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search()}
        />
        <button className={s.searchBtn} onClick={search} disabled={searching || !taskId.trim()}>
          {searching ? '...' : t('diagnose.search')}
        </button>
      </div>
      {result && (
        <div>
          <div className={s.healthBar} data-level={result.found > 0 ? 'ok' : 'warn'}>
            {t('diagnose.found')}: {result.found} ({t('diagnose.session')}: {result.session ? 1 : 0}, {t('diagnose.events')}: {result.events?.length || 0})
          </div>
          {result.session && (
            <pre className={s.code}>{JSON.stringify(result.session, null, 2)}</pre>
          )}
          {result.events && result.events.length > 0 && (
            <pre className={s.code}>{JSON.stringify(result.events.slice(0, 10), null, 2)}</pre>
          )}
        </div>
      )}
    </div>
  );
}
