import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store';
import s from './AgentTemplateEditor.module.css';

interface Agent {
  id: string; name: string; description?: string | null;
  systemPrompt?: string | null; isActive?: boolean;
  orchestration?: any; tools?: any; boundary?: any; ironLaws?: any;
}

async function fetchJSON(url: string, token: string | null, opts: any = {}): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(url, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
  return res.ok ? res.json() : null;
}

export function AgentTemplateEditor() {
  const { t } = useTranslation();
  const token = useStore((st) => st.token);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selected, setSelected] = useState<Agent | null>(null);
  const [tab, setTab] = useState<'identity' | 'orchestration' | 'tools' | 'guardrails'>('identity');
  const [jsonDraft, setJsonDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    const data = await fetchJSON('/api/v2/admin/agents', token);
    const items: Agent[] = data?.agents || data?.data || [];
    setAgents(items);
    if (items.length > 0 && !selected) selectAgent(items[0]);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  function selectAgent(a: Agent) {
    setSelected(a);
    if (tab === 'orchestration') setJsonDraft(JSON.stringify(a.orchestration || {}, null, 2));
    else if (tab === 'tools') setJsonDraft(JSON.stringify(a.tools || {}, null, 2));
    else if (tab === 'guardrails') setJsonDraft(JSON.stringify({ boundary: a.boundary || {}, ironLaws: a.ironLaws || [] }, null, 2));
  }

  useEffect(() => {
    if (selected) selectAgent(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function handleSave() {
    if (!selected) return;
    setSaving(true); setMessage('');
    let payload: Record<string, unknown> = {};
    try {
      if (tab === 'identity') {
        payload = { name: selected.name, description: selected.description, systemPrompt: selected.systemPrompt, isActive: selected.isActive };
      } else {
        payload = JSON.parse(jsonDraft);
        if (tab === 'orchestration') payload = { orchestration: payload };
        else if (tab === 'tools') payload = { tools: payload };
        else if (tab === 'guardrails') {
          payload = { boundary: payload.boundary, ironLaws: payload.ironLaws };
        }
      }
    } catch (e: any) { setMessage('JSON parse error: ' + e.message); setSaving(false); return; }
    const res = await fetchJSON('/api/v2/admin/agents/' + selected.id, token, {
      method: 'PUT', body: JSON.stringify(payload),
    });
    if (res) { setMessage(t('blueprint.saved')); await load(); }
    else setMessage(t('blueprint.saveFailed'));
    setSaving(false);
  }

  return (
    <div className={s.root}>
      <header className={s.header}>
        <h1 className={s.title}>{t('blueprint.title')}</h1>
      </header>

      <div className={s.layout}>
        <aside className={s.list} data-testid='agent-list'>
          {agents.map((a) => (
            <button key={a.id} data-testid={'agent-row-' + a.id} className={selected?.id === a.id ? s.itemActive : s.item} onClick={() => selectAgent(a)}>
              <div>{a.name}</div>
              {a.description && <div className={s.itemDesc}>{a.description.slice(0, 60)}</div>}
            </button>
          ))}
          {agents.length === 0 && <div className={s.empty}>{t('blueprint.empty')}</div>}
        </aside>

        <main className={s.detail}>
          {selected && (
            <>
              <nav className={s.tabs}>
                <button className={tab === 'identity' ? s.tabActive : s.tab} onClick={() => setTab('identity')}>{t('blueprint.tabIdentity')}</button>
                <button className={tab === 'orchestration' ? s.tabActive : s.tab} onClick={() => setTab('orchestration')}>{t('blueprint.tabOrchestration')}</button>
                <button className={tab === 'tools' ? s.tabActive : s.tab} onClick={() => setTab('tools')}>{t('blueprint.tabTools')}</button>
                <button className={tab === 'guardrails' ? s.tabActive : s.tab} onClick={() => setTab('guardrails')}>{t('blueprint.tabGuardrails')}</button>
              </nav>

              <section className={s.section}>
                {tab === 'identity' && (
                  <div className={s.form}>
                    <label>{t('blueprint.name')}: <input value={selected.name || ''} onChange={(e) => setSelected({ ...selected, name: e.target.value })} /></label>
                    <label>{t('blueprint.description')}: <input value={selected.description || ''} onChange={(e) => setSelected({ ...selected, description: e.target.value })} /></label>
                    <label>{t('blueprint.systemPrompt')}: <textarea rows={8} value={selected.systemPrompt || ''} onChange={(e) => setSelected({ ...selected, systemPrompt: e.target.value })} /></label>
                    <label><input type='checkbox' checked={selected.isActive ?? true} onChange={(e) => setSelected({ ...selected, isActive: e.target.checked })} /> {t('blueprint.isActive')}</label>
                  </div>
                )}
                {tab !== 'identity' && (
                  <textarea className={s.jsonEditor} data-testid='blueprint-json' value={jsonDraft} onChange={(e) => setJsonDraft(e.target.value)} spellCheck={false} />
                )}
              </section>

              <div className={s.actions}>
                <button className={s.saveBtn} onClick={handleSave} disabled={saving} data-testid='blueprint-save'>{saving ? t('blueprint.saving') : t('blueprint.save')}</button>
                {message && <span className={s.message}>{message}</span>}
              </div>

              <section className={s.section}>
                <h2 className={s.sectionTitle}>{t('blueprint.hintTitle')}</h2>
                <pre className={s.hint}>{tab === 'orchestration' ? '{ skillRefs: [{skillId, params}], mcpRefs: [{serverId, toolWhitelist}], kbRetrievalMap: {name: {kbId, strategy, topK}}, maxTurns, maxBudgetUsd, retryStrategy, parallelExecution }' : tab === 'tools' ? '{ allow: [], deny: [], perSessionLimits: {toolName: count} }' : '{ boundary: { inputFilter, outputFilter, escalationRules }, ironLaws: [...] }'}</pre>
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
