import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store';
import s from './AgentsView.module.css';

interface Agent {
  id: string;
  name: string;
  description?: string | null;
  systemPrompt?: string | null;
  isActive?: boolean;
  roleTemplate?: string | null;
}

async function fetchJSON(url: string, token: string | null, opts: any = {}): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
  if (!res.ok) return null;
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
                <button className={s.btn} onClick={() => setSelected(a)} data-testid={`detail-${a.id}`}>
                  {t('agents.detail')}
                </button>
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
          <div className={s.modalContent} onClick={(e) => e.stopPropagation()} data-testid="agent-modal">
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
