import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store';
import s from './RuntimeConsole.module.css';

interface Stats {
  activeSessions: number;
  totalToday: number;
  totalCostToday: number;
  byBot: Array<{ botName: string; count: number; totalCost: number; totalTokens: number }>;
}

interface Session {
  id: string;
  botName: string;
  sessionId: string | null;
  workingDirectory: string;
  model: string | null;
  engine: string | null;
  lastUsed: number;
  status: 'active' | 'idle' | 'archived';
  cumulativeTokens: number;
  cumulativeCostUsd: string;
  cumulativeDurationMs: number;
  interruptRequested: boolean;
}

async function fetchJSON(url: string, token: string | null): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(url, { headers });
  return res.ok ? res.json() : null;
}

function fmtAge(epochMs: number): string {
  const diff = Date.now() - epochMs;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return Math.floor(diff / 60_000) + 'm ago';
  if (diff < 86_400_000) return Math.floor(diff / 3_600_000) + 'h ago';
  return Math.floor(diff / 86_400_000) + 'd ago';
}

export function RuntimeConsole() {
  const { t } = useTranslation();
  const token = useStore((st) => st.token);
  const [stats, setStats] = useState<Stats | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeOnly, setActiveOnly] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [statsData, sessionsData] = await Promise.all([
      fetchJSON('/api/v2/admin/runtime/stats', token),
      fetchJSON('/api/v2/admin/runtime/sessions' + (activeOnly ? '?activeOnly=true' : ''), token),
    ]);
    if (statsData?.data) setStats(statsData.data);
    if (sessionsData?.data?.items) setSessions(sessionsData.data.items);
    setLoading(false);
  }, [token, activeOnly]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  async function handleInterrupt(id: string) {
    if (!confirm(t('runtime.interruptConfirm'))) return;
    await fetchJSON('/api/v2/admin/runtime/sessions/' + id + '/interrupt', token);
    await load();
  }

  if (loading && !stats) return <div className={s.loading}>{t('runtime.loading')}</div>;

  return (
    <div className={s.root}>
      <header className={s.header}>
        <h1 className={s.title}>{t('runtime.title')}</h1>
        <div className={s.controls}>
          <label className={s.checkboxLabel}>
            <input type='checkbox' checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} />
            {t('runtime.activeOnly')}
          </label>
          <button className={s.refreshBtn} onClick={load} disabled={loading}>{t('runtime.refresh')}</button>
        </div>
      </header>

      {stats && (
        <div className={s.statsGrid}>
          <div className={s.statCard}>
            <div className={s.statValue}>{stats.activeSessions}</div>
            <div className={s.statLabel}>{t('runtime.activeNow')}</div>
          </div>
          <div className={s.statCard}>
            <div className={s.statValue}>{stats.totalToday}</div>
            <div className={s.statLabel}>{t('runtime.totalToday')}</div>
          </div>
          <div className={s.statCard}>
            <div className={s.statValue}>{stats.totalCostToday.toFixed(2)}</div>
            <div className={s.statLabel}>{t('runtime.costToday')}</div>
          </div>
          <div className={s.statCard}>
            <div className={s.statValue}>{stats.byBot.length}</div>
            <div className={s.statLabel}>{t('runtime.botsActive')}</div>
          </div>
        </div>
      )}

      <table className={s.table} data-testid='runtime-sessions-table'>
        <thead>
          <tr>
            <th>{t('runtime.colStatus')}</th>
            <th>{t('runtime.colBot')}</th>
            <th>{t('runtime.colModel')}</th>
            <th>{t('runtime.colLastUsed')}</th>
            <th>{t('runtime.colCost')}</th>
            <th>{t('runtime.colActions')}</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((sess) => (
            <tr key={sess.id} data-testid={'runtime-row-' + sess.id}>
              <td>
                <span className={s['status_' + sess.status]}>{t('runtime.status_' + sess.status)}</span>
              </td>
              <td>
                <div className={s.botName}>{sess.botName}</div>
                <div className={s.workingDir} title={sess.workingDirectory}>{sess.workingDirectory || '—'}</div>
              </td>
              <td>{sess.model || '—'}</td>
              <td>{fmtAge(sess.lastUsed)}</td>
              <td>{Number(sess.cumulativeCostUsd).toFixed(4)}</td>
              <td>
                <button
                  className={s.interruptBtn}
                  onClick={() => handleInterrupt(sess.id)}
                  disabled={sess.status !== 'active'}
                  title={sess.status !== 'active' ? t('runtime.interruptOnlyActive') : ''}
                >
                  {t('runtime.interrupt')}
                </button>
              </td>
            </tr>
          ))}
          {sessions.length === 0 && (
            <tr><td colSpan={6} className={s.empty}>{t('runtime.empty')}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
