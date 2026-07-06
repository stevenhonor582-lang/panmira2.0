import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store';
import s from './StatusView.module.css';

interface Status {
  counts: Record<string, number>;
  usageToday: Record<string, number>;
  errorsLast24h: number;
  timestamp: string;
}

async function fetchJSON(url: string, token: string | null): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { headers });
  if (!res.ok) return null;
  return res.json();
}

export function StatusView() {
  const { t } = useTranslation();
  const token = useStore((st) => st.token);
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    fetchJSON('/api/v2/admin/status', token).then(setStatus).catch(() => setStatus(null));
    const i = setInterval(() => {
      fetchJSON('/api/v2/admin/status', token).then(setStatus).catch(() => {});
    }, 30000);
    return () => clearInterval(i);
  }, [token]);

  if (!status) return <div className={s.loading}>{t('status.loading')}</div>;

  const cells = [
    { key: 'llm', label: t('status.llm'), count: status.counts.llm },
    { key: 'embedding', label: t('status.embedding'), count: status.counts.embedding },
    { key: 'mcp', label: t('status.mcp'), count: status.counts.mcp },
    { key: 'kb', label: t('status.kb'), count: status.counts.kb },
    { key: 'agent', label: t('status.agent'), count: status.counts.agent },
    { key: 'oauth', label: t('status.oauth'), count: status.counts.oauth },
  ];

  const errorLevel = status.errorsLast24h > 50 ? 'critical' : status.errorsLast24h > 10 ? 'warn' : 'ok';

  return (
    <div className={s.root}>
      <header className={s.header}>
        <h1 className={s.title}>{t('status.title')}</h1>
        <div className={s.timestamp}>{new Date(status.timestamp).toLocaleString()}</div>
      </header>
      <div className={s.healthBar} data-level={errorLevel}>
        {t('status.errors24h')}: <strong>{status.errorsLast24h}</strong>
      </div>
      <div className={s.grid}>
        {cells.map((c) => (
          <div key={c.key} className={s.cell} data-testid={`status-${c.key}`}>
            <div className={s.cellLabel}>{c.label}</div>
            <div className={s.cellValue}>{c.count}</div>
          </div>
        ))}
      </div>
      <section className={s.section}>
        <h2 className={s.sectionTitle}>{t('status.usageToday')}</h2>
        <div className={s.usageGrid}>
          {Object.entries(status.usageToday).map(([k, v]) => (
            <div key={k} className={s.usageCell}>
              <div className={s.usageLabel}>{k}</div>
              <div className={s.usageValue}>{v}</div>
            </div>
          ))}
          {Object.keys(status.usageToday).length === 0 && <div className={s.empty}>{t('status.noUsageToday')}</div>}
        </div>
      </section>
    </div>
  );
}
