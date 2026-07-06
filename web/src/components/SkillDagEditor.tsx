import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store';
import s from './SkillDagEditor.module.css';

interface DagNode { id: string; type: string; label: string; config: Record<string, unknown>; }
interface DagEdge { from: string; to: string; condition?: string; label?: string; }
interface SkillDag {
  id: string; skillId: string; version: number;
  nodes: DagNode[]; edges: DagEdge[];
  validationStatus: string; validationErrors: string[];
}

async function fetchJSON(url: string, token: string | null, opts: any = {}): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(url, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
  return res.ok ? res.json() : null;
}

export function SkillDagEditor() {
  const { t } = useTranslation();
  const token = useStore((st) => st.token);
  const [dags, setDags] = useState<SkillDag[]>([]);
  const [selected, setSelected] = useState<SkillDag | null>(null);
  const [jsonDraft, setJsonDraft] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [skillId, setSkillId] = useState('demo-skill');

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchJSON('/api/v2/admin/skill-dags?skillId=' + encodeURIComponent(skillId), token);
    setDags(data?.data || []);
    setLoading(false);
  }, [token, skillId]);

  useEffect(() => { load(); }, [load]);

  function selectDag(d: SkillDag) {
    setSelected(d);
    setJsonDraft(JSON.stringify({ nodes: d.nodes, edges: d.edges }, null, 2));
    setErrors(d.validationErrors || []);
  }

  async function handleValidate() {
    try {
      const parsed = JSON.parse(jsonDraft);
      const res = await fetchJSON('/api/v2/admin/skill-dags/' + (selected?.id || 'new'), token, {
        method: 'PUT', body: JSON.stringify(parsed),
      });
      if (res?.validation?.ok) {
        setErrors([]);
        alert(t('dag.validationOk'));
        await load();
      } else {
        setErrors(res?.validation?.errors || ['unknown error']);
      }
    } catch (e: any) {
      setErrors(['JSON parse error: ' + e.message]);
    }
  }

  async function handleCreate() {
    const tenantId = prompt(t('dag.tenantIdPrompt'));
    if (!tenantId) return;
    const initial = { nodes: [{ id: 'n1', type: 'llm', label: 'Default LLM', config: { model: 'claude-opus' } }, { id: 'n2', type: 'output', label: 'Final', config: {} }], edges: [{ from: 'n1', to: 'n2' }] };
    const res = await fetchJSON('/api/v2/admin/skill-dags', token, {
      method: 'POST', body: JSON.stringify({ skillId, tenantId, ...initial }),
    });
    if (res?.data) {
      selectDag(res.data);
      await load();
    } else {
      alert('Create failed');
    }
  }

  if (loading) return <div className={s.loading}>{t('dag.loading')}</div>;

  return (
    <div className={s.root}>
      <header className={s.header}>
        <h1 className={s.title}>{t('dag.title')}</h1>
        <div className={s.controls}>
          <input className={s.skillIdInput} placeholder='Skill ID' value={skillId} onChange={(e) => setSkillId(e.target.value)} />
          <button className={s.createBtn} onClick={handleCreate}>+ {t('dag.newVersion')}</button>
        </div>
      </header>

      <div className={s.layout}>
        <aside className={s.list}>
          <div className={s.listTitle}>{t('dag.versions')}</div>
          {dags.map((d) => (
            <button key={d.id} data-testid={'dag-row-' + d.id} className={selected?.id === d.id ? s.itemActive : s.item} onClick={() => selectDag(d)}>
              <div>v{d.version}</div>
              <div className={s['status_' + d.validationStatus]}>{d.validationStatus}</div>
            </button>
          ))}
          {dags.length === 0 && <div className={s.empty}>{t('dag.empty')}</div>}
        </aside>

        <main className={s.detail}>
          {selected ? (
            <>
              <section className={s.section}>
                <h2 className={s.sectionTitle}>{t('dag.nodesAndEdges')}</h2>
                <textarea
                  className={s.jsonEditor}
                  data-testid='dag-json-editor'
                  value={jsonDraft}
                  onChange={(e) => setJsonDraft(e.target.value)}
                  spellCheck={false}
                />
              </section>
              {errors.length > 0 && (
                <section className={s.section}>
                  <h2 className={s.sectionTitle}>{t('dag.errors')}</h2>
                  <ul className={s.errorList}>{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
                </section>
              )}
              <section className={s.section}>
                <h2 className={s.sectionTitle}>{t('dag.nodesList')}</h2>
                <div className={s.nodeGrid}>
                  {(JSON.parse(jsonDraft || '{"nodes":[]}').nodes || []).map((n: DagNode) => (
                    <div key={n.id} className={s.nodeCard}>
                      <div className={s.nodeType}>{n.type}</div>
                      <div className={s.nodeLabel}>{n.label}</div>
                      <div className={s.nodeId}>{n.id}</div>
                    </div>
                  ))}
                </div>
              </section>
              <div className={s.actions}>
                <button className={s.validateBtn} onClick={handleValidate}>{t('dag.validate')}</button>
              </div>
            </>
          ) : (
            <div className={s.empty}>{t('dag.selectOne')}</div>
          )}
        </main>
      </div>
    </div>
  );
}
