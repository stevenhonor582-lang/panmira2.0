import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store';
import s from './ResourcesView.module.css';

interface McpServer { id: string; name: string; url: string; transport: string; status: string; healthStatus: string; }
interface Plugin { id: string; name: string; version: string; skillCount: number; enabled: boolean; }

async function fetchJSON(url: string, token: string | null): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function ResourcesView() {
  const { t } = useTranslation();
  const token = useStore((st) => st.token);
  const [mcps, setMcps] = useState<McpServer[]>([]);
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [mcpRes, pluginRes] = await Promise.all([
        fetchJSON('/api/v2/admin/mcp-servers', token),
        fetchJSON('/api/skills/plugins', token),
      ]);
      setMcps(mcpRes.servers || []);
      setPlugins(Array.isArray(pluginRes) ? pluginRes : (pluginRes.plugins || []));
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className={s.loading}>{t('resources.loading')}</div>;

  return (
    <div className={s.root}>
      <header className={s.header}>
        <h1 className={s.title}>{t('resources.title')}</h1>
      </header>

      <section className={s.section}>
        <h2 className={s.sectionTitle}>{t('resources.mcpServers')} ({mcps.length})</h2>
        {mcps.length === 0 ? <div className={s.empty}>{t('resources.emptyMcp')}</div> : (
          <table className={s.table}>
            <thead>
              <tr><th>{t('resources.colName')}</th><th>{t('resources.colUrl')}</th><th>{t('resources.colHealth')}</th></tr>
            </thead>
            <tbody>
              {mcps.map((m) => (
                <tr key={m.id}>
                  <td>{m.name}</td>
                  <td className={s.mono}>{m.url}</td>
                  <td><span className={m.healthStatus === 'healthy' ? s.healthy : s.degraded}>{m.healthStatus || 'unknown'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className={s.section}>
        <h2 className={s.sectionTitle}>{t('resources.skillPlugins')} ({plugins.length})</h2>
        {plugins.length === 0 ? <div className={s.empty}>{t('resources.emptySkills')}</div> : (
          <table className={s.table}>
            <thead>
              <tr><th>{t('resources.colName')}</th><th>{t('resources.colVersion')}</th><th>{t('resources.colSkills')}</th><th>{t('resources.colStatus')}</th></tr>
            </thead>
            <tbody>
              {plugins.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td className={s.mono}>{p.version}</td>
                  <td>{p.skillCount}</td>
                  <td><span className={p.enabled ? s.healthy : s.degraded}>{p.enabled ? t('resources.active') : t('resources.disabled')}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
