import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store';
import s from './StatusView.module.css';

interface Alert { id: string; type: string; bot_name: string; message: string; created_at: string; }

async function fetchJSON(url: string, token: string | null): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { headers });
  if (!res.ok) return null;
  return res.json();
}

export function AlertsView() {
  const { t } = useTranslation();
  const token = useStore((st) => st.token);
  const [alerts, setAlerts] = useState<Alert[]>([]);

  useEffect(() => {
    fetchJSON('/api/v2/admin/alerts', token)
      .then((d) => setAlerts(d.alerts || []))
      .catch(() => setAlerts([]));
  }, [token]);

  return (
    <div className={s.root}>
      <h1 className={s.title}>{t('alerts.title')}</h1>
      <p className={s.timestamp}>{alerts.length} {t('alerts.total')}</p>
      {alerts.length === 0 ? (
        <div className={s.empty}>{t('alerts.empty')}</div>
      ) : (
        <table className={s.table}>
          <thead>
            <tr><th>{t('alerts.colType')}</th><th>{t('alerts.colBot')}</th><th>{t('alerts.colMessage')}</th><th>{t('alerts.colTime')}</th></tr>
          </thead>
          <tbody>
            {alerts.map((a) => (
              <tr key={a.id}>
                <td><span className={s.healthBar} data-level="critical" style={{padding:'0.125rem 0.5rem',fontSize:'0.75rem'}}>{a.type}</span></td>
                <td>{a.bot_name || '—'}</td>
                <td>{a.message || '—'}</td>
                <td>{a.created_at ? new Date(a.created_at).toLocaleString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
