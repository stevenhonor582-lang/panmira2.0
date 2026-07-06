import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store';
import s from './ReportsView.module.css';

interface Client { id: string; client_id: string; name: string; type: string; scopes: string[]; status: string; created_at: string; }

async function fetchJSON(url: string, token: string | null, opts: any = {}): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
  if (!res.ok) return null;
  return res.json();
}

export function OAuthClientsView() {
  const { t } = useTranslation();
  const token = useStore((st) => st.token);
  const [clients, setClients] = useState<Client[]>([]);
  const [newSecret, setNewSecret] = useState<string | null>(null);

  const load = () => fetchJSON('/api/v2/admin/oauth-clients', token).then((d) => setClients(d.clients || d.data || [])).catch(() => setClients([]));
  useEffect(() => { load(); }, [token]);

  async function handleNew() {
    const name = prompt(t('oauth.newNamePrompt'));
    if (!name) return;
    try {
      const result = await fetchJSON('/api/v2/admin/oauth-clients', token, {
        method: 'POST',
        body: JSON.stringify({ name, type: 'service', scopes: ['reports:read'] }),
      });
      setNewSecret(result.clientSecret || result.client?.clientSecret || '(secret not returned)');
      await load();
    } catch (err) { alert(`Failed: ${err}`); }
  }

  async function handleRevoke(id: string) {
    if (!confirm(t('oauth.revokeConfirm'))) return;
    try {
      await fetchJSON(`/api/v2/admin/oauth-clients/${id}`, token, { method: 'DELETE' });
      await load();
    } catch (err) { alert(`Failed: ${err}`); }
  }

  return (
    <div className={s.root}>
      <header style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
        <h1 className={s.title}>{t('oauth.title')}</h1>
        <button onClick={handleNew} style={{padding:'0.5rem 1rem',background:'rgba(99,102,241,0.15)',border:'1px solid rgba(99,102,241,0.4)',borderRadius:6,color:'#818cf8',cursor:'pointer'}}>+ {t('oauth.newClient')}</button>
      </header>
      {newSecret && (
        <div style={{padding:'0.75rem',background:'rgba(245,158,11,0.1)',border:'1px solid rgba(245,158,11,0.3)',borderRadius:6,marginBottom:'1rem',color:'#fbbf24',fontFamily:'ui-monospace,monospace'}}>
          {t('oauth.secretWarning')}: <strong>{newSecret}</strong>
        </div>
      )}
      <table className={s.table}>
        <thead>
          <tr><th>{t('oauth.colName')}</th><th>{t('oauth.colClientId')}</th><th>{t('oauth.colScopes')}</th><th>{t('oauth.colStatus')}</th><th>{t('oauth.colCreated')}</th><th></th></tr>
        </thead>
        <tbody>
          {clients.map((c) => (
            <tr key={c.id}>
              <td>{c.name}</td>
              <td className={s.mono}>{c.client_id}</td>
              <td style={{fontSize:'0.75rem',color:'var(--text-tertiary)'}}>{(c.scopes || []).slice(0, 3).join(', ')}{(c.scores?.length || c.scopes?.length) > 3 ? '...' : ''}</td>
              <td>
                <span style={{padding:'0.125rem 0.5rem',background:c.status==='active'?'rgba(34,197,94,0.15)':'rgba(239,68,68,0.15)',color:c.status==='active'?'#4ade80':'#f87171',borderRadius:3,fontSize:'0.75rem'}}>{c.status}</span>
              </td>
              <td>{c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}</td>
              <td>
                <button onClick={() => handleRevoke(c.id)} style={{padding:'0.25rem 0.625rem',background:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.3)',borderRadius:4,color:'#f87171',cursor:'pointer'}}>{t('oauth.revoke')}</button>
              </td>
            </tr>
          ))}
          {clients.length === 0 && <tr><td colSpan={6} style={{padding:'2rem',textAlign:'center',color:'var(--text-tertiary)'}}>{t('oauth.empty')}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
