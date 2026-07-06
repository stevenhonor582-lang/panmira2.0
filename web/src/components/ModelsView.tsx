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
  if (!res.ok) return null;
  return res.json();
}

export function ModelsView() {
  const { t } = useTranslation();
  const token = useStore((st) => st.token);
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [testingId, setTestingId] = useState<string | null>(null);

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
    setTestingId(id);
    try {
      const result = await fetchJSON(`/api/v2/admin/models/${id}/test`, token);
      const msg = result.ok
        ? `${t('models.testOk')} (${result.latencyMs}ms)`
        : `${t('models.testFailed')}: ${result.error || result.message || `HTTP ${result.status}`}`;
      alert(msg);
    } catch (err) {
      alert(`${t('models.testFailed')}: ${err}`);
    } finally {
      setTestingId(null);
    }
  }

  async function handleToggle(id: string, currentStatus: string) {
    const newStatus = currentStatus === 'active' ? 'disabled' : 'active';
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const resp = await fetch(`/api/v2/admin/models/${id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status: newStatus }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
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
        <button
          className={s.newBtn}
          data-testid="new-model-btn"
          onClick={() => alert(t('models.newModelHint'))}
        >
          + {t('models.newModel')}
        </button>
      </header>

      <table className={s.table} data-testid="models-table">
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
            <tr key={m.id} data-testid={`model-row-${m.id}`}>
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
                <button
                  className={s.btn}
                  data-testid={`test-${m.id}`}
                  onClick={() => handleTest(m.id)}
                  disabled={testingId === m.id}
                >
                  {testingId === m.id ? '...' : t('models.test')}
                </button>
                <button
                  className={s.btn}
                  onClick={() => handleToggle(m.id, m.status)}
                  disabled={m.type === 'llm'}
                  title={m.type === 'llm' ? 'LLM 不支持 toggle' : ''}
                >
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
