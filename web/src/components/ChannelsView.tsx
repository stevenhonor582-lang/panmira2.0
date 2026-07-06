import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store';
import s from './ChannelsView.module.css';

interface Channel { id: string; groupId: string; pattern: string | null; targetBots: string[]; priority: number; enabled: boolean; }

async function fetchJSON(url: string, token: string | null, opts: any = {}): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function ChannelsView() {
  const { t } = useTranslation();
  const token = useStore((st) => st.token);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetchJSON('/api/v2/admin/channels', token);
      setChannels(d.channels || []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function handleNew() {
    const groupId = prompt(t('channels.newGroupIdPrompt'));
    if (!groupId) return;
    try {
      await fetchJSON('/api/v2/admin/channels', token, {
        method: 'POST',
        body: JSON.stringify({ groupId, targetBots: ['default'], priority: 50 }),
      });
      await load();
    } catch (err) { alert(`Failed: ${err}`); }
  }

  async function handleDelete(id: string) {
    if (!confirm(t('channels.deleteConfirm'))) return;
    try {
      await fetchJSON(`/api/v2/admin/channels/${id}`, token, { method: 'DELETE' });
      await load();
    } catch (err) { alert(`Failed: ${err}`); }
  }

  if (loading) return <div className={s.loading}>{t('channels.loading')}</div>;

  return (
    <div className={s.root}>
      <header className={s.header}>
        <h1 className={s.title}>{t('channels.title')}</h1>
        <button className={s.newBtn} onClick={handleNew}>+ {t('channels.newChannel')}</button>
      </header>
      {channels.length === 0 ? (
        <div className={s.empty}>{t('channels.empty')}</div>
      ) : (
        <table className={s.table}>
          <thead>
            <tr><th>{t('channels.colGroupId')}</th><th>{t('channels.colPattern')}</th><th>{t('channels.colBots')}</th><th>{t('channels.colPriority')}</th><th>{t('channels.colStatus')}</th><th></th></tr>
          </thead>
          <tbody>
            {channels.map((c) => (
              <tr key={c.id}>
                <td className={s.mono}>{c.groupId}</td>
                <td>{c.pattern || '—'}</td>
                <td>{(c.targetBots || []).join(', ')}</td>
                <td>{c.priority}</td>
                <td><span className={c.enabled ? s.active : s.disabled}>{c.enabled ? t('channels.active') : t('channels.disabled')}</span></td>
                <td><button className={s.delBtn} onClick={() => handleDelete(c.id)}>{t('channels.delete')}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
