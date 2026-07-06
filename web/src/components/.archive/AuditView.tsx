import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store';
import s from './ReportsView.module.css';

async function fetchJSON(url: string, token: string | null): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { headers });
  if (!res.ok) return null;
  return res.json();
}

export function AuditView() {
  const { t } = useTranslation();
  const token = useStore((st) => st.token);
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    fetchJSON('/api/v2/admin/audit?limit=50', token).then((d) => setLogs(d.logs || [])).catch(() => setLogs([]));
  }, [token]);

  return (
    <div className={s.root}>
      <h1 className={s.title}>{t('audit.title')}</h1>
      <p style={{color:'var(--text-tertiary, #888)'}}>{logs.length} {t('audit.entries')}</p>
      <table className={s.table}>
        <thead>
          <tr><th>{t('audit.colTime')}</th><th>{t('audit.colActor')}</th><th>{t('audit.colAction')}</th><th>{t('audit.colTarget')}</th></tr>
        </thead>
        <tbody>
          {logs.map((l: any, i: number) => (
            <tr key={i}>
              <td>{l.created_at ? new Date(l.created_at).toLocaleString() : '—'}</td>
              <td className={s.mono}>{l.actor_id || l.user_id || '—'}</td>
              <td>{l.action || l.event_type || '—'}</td>
              <td className={s.mono}>{l.target_type ? `${l.target_type}:${l.target_id || ''}` : '—'}</td>
            </tr>
          ))}
          {logs.length === 0 && <tr><td colSpan={4} className={s.empty}>{t('audit.empty')}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
