import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../../store';
import { SlideOverPanel } from '../SlideOverPanel';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styles from '../SettingsView.module.css';

export interface AgentTemplate {
  id: string;
  name: string;
  roleTemplate: string | null;
  description: string | null;
  systemPrompt: string | null;
  capabilities: any[];
  tools: any[];
  isActive: boolean;
  category: string;
  templateType: 'standard' | 'custom';
  sourceTemplateId: string | null;
  knowledgeFolders?: string[];
  skills?: string[];
  createdAt: string;
  updatedAt: string;
}

const AGENT_CATEGORY_KEYS: Record<string, string> = {
  all: 'agents.all',
  engineering: 'agents.engineering',
  marketing: 'agents.marketing',
  sales: 'agents.sales',
  support: 'agents.support',
  product: 'agents.product',
  finance: 'agents.finance',
  design: 'agents.design',
  'project-management': 'agents.projectManagement',
  'paid-media': 'agents.paidMedia',
  testing: 'agents.testing',
  academic: 'agents.academic',
  'game-development': 'agents.gameDev',
  'spatial-computing': 'agents.spatialComputing',
  specialized: 'agents.specialized',
  development: 'agents.development',
  data: 'agents.data',
  devops: 'agents.devops',
  productivity: 'agents.productivity',
  hr: 'agents.hr',
  education: 'agents.education',
  creative: 'agents.creative',
  healthcare: 'agents.healthcare',
  ecommerce: 'agents.ecommerce',
  automation: 'agents.automation',
  legal: 'agents.legal',
  security: 'agents.security',
  saas: 'agents.saas',
  'supply-chain': 'agents.supplyChain',
  business: 'agents.business',
  general: 'agents.general',
};

export function getAgentCategoryLabel(key: string, t: (key: string) => string): string {
  const i18nKey = AGENT_CATEGORY_KEYS[key];
  return i18nKey ? t(i18nKey) : key;
}

// Backward-compatible export: returns i18n keys for use with t()
export const AGENT_CATEGORIES: Record<string, string> = AGENT_CATEGORY_KEYS;

export function getBlankTemplatePrompt(t: (key: string) => string): string {
  return `# \${t('agents.blankTitle')}

## \${t('agents.blankCoreIdentity')}
- **\${t('agents.blankRole')}:** \${t('agents.blankRoleDesc')}
- **\${t('agents.blankPersonality')}:** \${t('agents.blankPersonalityDesc')}
- **\${t('agents.blankCommStyle')}:** \${t('agents.blankCommStyleDesc')}

## \${t('agents.blankResponsibilities')}
1. **\${t('agents.blankRespName')}**
   - \${t('agents.blankTaskDesc')}
   - \${t('agents.blankExpectedOutput')}

## \${t('agents.blankGuidelines')}
### \${t('agents.blankShould')}:
- \${t('agents.blankPositiveBehavior')}
### \${t('agents.blankShouldNot')}:
- \${t('agents.blankProhibitedBehavior')}

## \${t('agents.blankExampleInteraction')}
> \${t('agents.blankExampleUser')}
> \${t('agents.blankExampleAgent')}`;
}

interface AgentsSectionProps {
  onAgentsLoaded?: (agents: AgentTemplate[]) => void;
}

export function AgentsSection({ onAgentsLoaded }: AgentsSectionProps) {
  const { t } = useTranslation();
  const token = useStore((s) => s.token);
  const logout = useStore((s) => s.logout);

  const [agents, setAgents] = useState<AgentTemplate[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [showPanel, setShowPanel] = useState(false);
  const [agentMode, setAgentMode] = useState<'create' | 'edit'>('create');
  const [editingAgent, setEditingAgent] = useState<AgentTemplate | null>(null);
  const [agentName, setAgentName] = useState('');
  const [agentRole, setAgentRole] = useState('');
  const [agentDesc, setAgentDesc] = useState('');
  const [agentPrompt, setAgentPrompt] = useState('');
  const [agentEditView, setAgentEditView] = useState(false);
  const [agentSaving, setAgentSaving] = useState(false);
  const [agentError, setAgentError] = useState('');
  const [agentTab, setAgentTab] = useState<'standard' | 'custom'>('standard');
  const [agentCategory, setAgentCategory] = useState('all');
  const [agentSearch, setAgentSearch] = useState('');
  const [agentPreviewId, setAgentPreviewId] = useState<string | null>(null);
  const [agentRefining, setAgentRefining] = useState(false);
  const [knowledgeFolders, setKnowledgeFolders] = useState<string[]>([]);
  const [availableFolders, setAvailableFolders] = useState<{ id: string; name: string }[]>([]);
  const [agentSkills, setAgentSkills] = useState<string[]>([]);
  const [availableSkills, setAvailableSkills] = useState<{ name: string; summary: string; category: string; alwaysLoad?: boolean }[]>([]);
  const mdFileInputRef = useRef<HTMLInputElement>(null);

  const fetchFolders = useCallback(async () => {
    try {
      const res = await fetch('/memory/api/folders');
      if (res.ok) {
        const data = await res.json();
        const flat: { id: string; name: string }[] = [];
        const findAndWalk = (node: any, target: string): any => {
          if (node.name === target) return node;
          for (const child of node.children || []) {
            const found = findAndWalk(child, target);
            if (found) return found;
          }
          return null;
        };
        const walk = (node: any, prefix: string = '') => {
          const label = prefix ? `${prefix}/${node.name}` : node.name;
          if (node.id && node.id !== 'root') {
            flat.push({ id: node.id, name: label });
          }
          for (const child of node.children || []) {
            walk(child, node.id === 'root' ? '' : label);
          }
        };
        const orgNode = findAndWalk(data, t('memory.orgPublic'));
        if (orgNode) {
          walk(orgNode);
        }
        setAvailableFolders(flat);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchFolders(); }, [fetchFolders]);

  const fetchSkills = useCallback(async () => {
    try {
      const res = await fetch('/api/skills/registry');
      if (res.ok) {
        const data = await res.json();
        setAvailableSkills(data.skills || []);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchSkills(); }, [fetchSkills]);

  const fetchAgents = useCallback(async () => {
    setAgentsLoading(true);
    setAgentError('');
    try {
      const res = await fetch('/api/agents', { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 401) { logout(); return; }
      if (res.ok) {
        const data = await res.json();
        const agentList = data.agents || [];

        // Also fetch templates and merge them in
        let templateList: any[] = [];
        try {
          const tRes = await fetch('/api/templates', { headers: { Authorization: `Bearer ${token}` } });
          if (tRes.ok) {
            const tData = await tRes.json();
            templateList = (tData || []).map((t: any) => ({
              id: t.id,
              name: t.name,
              roleTemplate: t.display_name || t.name,
              description: t.description || '',
              systemPrompt: t.system_prompt || '',
              capabilities: t.default_skills || [],
              tools: [],
              isActive: t.is_active,
              category: t.category || 'template',
              templateType: 'standard' as const,
              sourceTemplateId: null,
              knowledgeFolders: t.default_knowledge_folders || [],
              skills: t.default_skills || [],
              createdAt: t.created_at,
              updatedAt: t.created_at,
              // preserve template metadata
              isTemplate: true,
              default_agents: t.default_agents || [],
              default_engine: t.default_engine,
              default_model: t.default_model,
              version: t.version,
            }));
          }
        } catch { /* templates fetch failed, continue with agents only */ }

        const list = [...templateList, ...agentList];
        setAgents(list);
        onAgentsLoaded?.(list);
      } else {
        setAgentError(t('agents.loadFailed', { status: res.status }));
      }
    } catch {
      setAgentError(t('agents.networkError'));
    }
    setAgentsLoading(false);
  }, [token, logout]);

  const fetchAgentDetail = useCallback(async (id: string): Promise<AgentTemplate | null> => {
    try {
      const res = await fetch(`/api/agents/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        const full = data.agent;
        setAgents((prev) => prev.map((a) => (a.id === id ? { ...a, systemPrompt: full.systemPrompt } : a)));
        return full;
      }
    } catch { /* ignore */ }
    return null;
  }, [token]);

  useEffect(() => { fetchAgents(); }, [fetchAgents]);

  const resetForm = useCallback(() => {
    setShowPanel(false);
    setEditingAgent(null);
    setAgentName('');
    setAgentRole('');
    setAgentDesc('');
    setAgentPrompt('');
    setAgentEditView(false);
    setAgentError('');
    setKnowledgeFolders([]);
    setAgentSkills([]);
  }, []);

  const openCreate = useCallback(() => {
    setAgentMode('create');
    setEditingAgent(null);
    setAgentName('');
    setAgentRole('');
    setAgentDesc('');
    setAgentPrompt(getBlankTemplatePrompt(t));
    setAgentEditView(true);
    setAgentError('');
    setKnowledgeFolders([]);
    setAgentSkills([]);
    setShowPanel(true);
  }, []);

  const createFromTemplate = useCallback(async (agent: AgentTemplate) => {
    const full = agent.systemPrompt ? agent : (await fetchAgentDetail(agent.id)) || agent;
    setAgentMode('create');
    setEditingAgent(null);
    setAgentName(t('agents.nameCopy', { name: full.name }));
    setAgentRole(full.roleTemplate || '');
    setAgentDesc(full.description || '');
    setAgentPrompt(full.systemPrompt || '');
    setAgentEditView(true);
    setAgentError('');
    setKnowledgeFolders([]);
    setAgentSkills([]);
    setShowPanel(true);
  }, [fetchAgentDetail]);

  const openEdit = useCallback(async (agent: AgentTemplate) => {
    const full = agent.systemPrompt ? agent : (await fetchAgentDetail(agent.id)) || agent;
    setAgentMode('edit');
    setEditingAgent(full);
    setAgentName(full.name);
    setAgentRole(full.roleTemplate || '');
    setAgentDesc(full.description || '');
    setAgentPrompt(full.systemPrompt || '');
    setAgentEditView(false);
    setAgentError('');
    setKnowledgeFolders(full.knowledgeFolders || []);
    setAgentSkills(full.skills || []);
    setShowPanel(true);
  }, [fetchAgentDetail]);

  const handleSave = useCallback(async () => {
    if (!agentName.trim()) { setAgentError(t('agents.nameRequired')); return; }
    setAgentSaving(true);
    setAgentError('');
    try {
      const body: Record<string, unknown> = {
        name: agentName.trim(),
        roleTemplate: agentRole.trim() || null,
        description: agentDesc.trim() || null,
        systemPrompt: agentPrompt || null,
        templateType: 'custom' as const,
        knowledgeFolders,
        skills: agentSkills,
      };
      const url = agentMode === 'create' ? '/api/agents' : `/api/agents/${editingAgent!.id}`;
      const method = agentMode === 'create' ? 'POST' : 'PUT';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setShowPanel(false);
      fetchAgents();
    } catch (err) {
      setAgentError(err instanceof Error ? err.message : t('agents.operationFailed'));
    } finally {
      setAgentSaving(false);
    }
  }, [agentMode, editingAgent, agentName, agentRole, agentDesc, agentPrompt, token, fetchAgents]);

  const handleDelete = useCallback(async (agent: AgentTemplate) => {
    if (!window.confirm(t('agents.deleteConfirm', { name: agent.name }))) return;
    try {
      await fetch(`/api/agents/${agent.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchAgents();
    } catch { /* ignore */ }
  }, [token, fetchAgents]);

  const handleMdImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.md')) { setAgentError(t('agents.mdFileRequired')); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      setAgentPrompt(content);
      setAgentEditView(true);
    };
    reader.onerror = () => setAgentError(t('agents.fileReadFailed'));
    reader.readAsText(file);
    e.target.value = '';
  }, []);

  const handleRefineTemplate = useCallback(async () => {
    if (!agentPrompt.trim()) { setAgentError(t('agents.refineFirst')); return; }
    setAgentRefining(true);
    setAgentError('');
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000);
      const res = await fetch('/api/agents/refine-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: agentPrompt }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data.refined) {
        setAgentPrompt(data.refined);
        setAgentEditView(true);
      } else {
        throw new Error(t('agents.aiReturnEmpty'));
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setAgentError(t('agents.refineTimeout'));
      } else {
        setAgentError(err instanceof Error ? err.message : t('agents.refineFailed'));
      }
    } finally {
      setAgentRefining(false);
    }
  }, [agentPrompt, token]);

  // ─── Render ───
  const filteredAgents = agents
    .filter((a) => a.templateType === agentTab)
    .filter((a) => agentCategory === 'all' || a.category === agentCategory)
    .filter((a) => !agentSearch || a.name.toLowerCase().includes(agentSearch.toLowerCase()) || (a.description || '').toLowerCase().includes(agentSearch.toLowerCase()));
  const usedCategories = [...new Set(agents.filter((a) => a.templateType === agentTab).map((a) => a.category))];

  const parseSections = (prompt: string | null) => {
    if (!prompt) return [];
    const lines = prompt.split('\n');
    const sections: { title: string; content: string }[] = [];
    let current: { title: string; content: string } | null = null;
    for (const line of lines) {
      const m = line.match(/^#{1,3}\s+(.+)/);
      if (m) {
        if (current) sections.push(current);
        current = { title: m[1].trim(), content: '' };
      } else if (current) {
        current.content += (current.content ? '\n' : '') + line;
      }
    }
    if (current) sections.push(current);
    return sections;
  };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <h2 className={styles.contentTitle} style={{ margin: 0 }}>{t('agents.title')}</h2>
        <button className={`${styles.btn} ${styles.btnAccent}`} onClick={openCreate}>{t('agents.blankTemplate')}</button>
      </div>
      <p className={styles.contentDesc}>
        {agentTab === 'standard' ? t('agents.standardTabDesc') : t('agents.customTabDesc')}
      </p>

      <div className={styles.tabBar}>
        {(['standard', 'custom'] as const).map((tab) => (
          <button
            key={tab}
            className={`${styles.tabBtn} ${agentTab === tab ? styles.tabBtnActive : ''}`}
            onClick={() => { setAgentTab(tab); setAgentCategory('all'); setAgentSearch(''); setAgentPreviewId(null); }}
          >
            {tab === 'standard' ? t('agents.templateLibrary') : t('agents.myTemplates')}
            <span className={styles.tabCount}>{agents.filter((a) => a.templateType === tab).length}</span>
          </button>
        ))}
      </div>

      <div style={{ marginBottom: '10px' }}>
        <input
          className={styles.input}
          style={{ width: '100%' }}
          placeholder={agentTab === 'standard' ? t('agents.searchStandard') : t('agents.searchCustom')}
          value={agentSearch}
          onChange={(e) => setAgentSearch(e.target.value)}
        />
      </div>

      {usedCategories.length > 1 && (
        <div className={styles.filterBar}>
          <button
            className={`${styles.filterChip} ${agentCategory === 'all' ? styles.filterChipActive : ''}`}
            onClick={() => setAgentCategory('all')}
          >
            {t('agents.all')}
          </button>
          {usedCategories.sort().map((cat) => (
            <button
              key={cat}
              className={`${styles.filterChip} ${agentCategory === cat ? styles.filterChipActive : ''}`}
              onClick={() => setAgentCategory(cat)}
            >
              {AGENT_CATEGORIES[cat] || cat}
            </button>
          ))}
        </div>
      )}

      {agentsLoading ? (
        <div className={styles.agentGrid}>
          <div className={styles.agentCard}><span className={styles.cardItemDesc}>{t('agents.loading')}</span></div>
        </div>
      ) : agentError ? (
        <div className={styles.agentGrid}>
          <div className={styles.agentCard}>
            <div className={styles.agentCardName}>{agentError}</div>
            <button className={styles.btn} onClick={fetchAgents} style={{ marginTop: 8 }}>{t('agents.retry')}</button>
          </div>
        </div>
      ) : filteredAgents.length === 0 ? (
        <div className={styles.agentGrid}>
          <div className={styles.agentCard}>
            <div className={styles.agentCardName}>{t(agentTab === 'standard' ? 'agents.noStandard' : 'agents.noCustom')}</div>
            <div className={styles.agentCardDesc}>
              {agentTab === 'custom' ? t('agents.createOrImport') : agentSearch ? t('agents.noMatch') : t('agents.importFirst')}
            </div>
          </div>
        </div>
      ) : (
        <div className={styles.agentGrid}>
          {filteredAgents.map((agent) => {
            const isPreview = agentPreviewId === agent.id;
            const sections = isPreview ? parseSections(agent.systemPrompt) : [];
            return (
              <div key={agent.id} className={`${styles.agentCard} ${isPreview ? styles.agentCardExpanded : ''}`}>
                <div className={styles.agentCardHeader}>
                  <div className={styles.agentCardName}>{agent.name}</div>
                  <span className={styles.agentCategoryTag}>{AGENT_CATEGORIES[agent.category] || agent.category}</span>
                </div>
                <div className={styles.agentCardDesc}>{agent.description || t('agents.noDescription')}</div>
                <div className={styles.agentCardActions}>
                  {agent.templateType === 'standard' ? (
                    <>
                      <button className={`${styles.btn} ${styles.btnSmall} ${styles.btnOutline}`} onClick={async () => { if (!isPreview && !agent.systemPrompt) await fetchAgentDetail(agent.id); setAgentPreviewId(isPreview ? null : agent.id); }}>
                        {isPreview ? t('agents.collapse') : t('agents.preview')}
                      </button>
                      <button className={`${styles.btn} ${styles.btnSmall} ${styles.btnAccent}`} onClick={() => createFromTemplate(agent)}>
                        {t('agents.import')}
                      </button>
                    </>
                  ) : (
                    <>
                      <button className={`${styles.btn} ${styles.btnSmall} ${styles.btnOutline}`} onClick={async () => { if (!isPreview && !agent.systemPrompt) await fetchAgentDetail(agent.id); setAgentPreviewId(isPreview ? null : agent.id); }}>
                        {isPreview ? t('agents.collapse') : t('agents.preview')}
                      </button>
                      <button className={`${styles.btn} ${styles.btnSmall} ${styles.btnOutline}`} onClick={() => openEdit(agent)}>{t('agents.edit')}</button>
                      <button className={`${styles.btn} ${styles.btnSmall} ${styles.btnDanger}`} onClick={() => handleDelete(agent)}>{t('agents.delete')}</button>
                    </>
                  )}
                </div>
                {isPreview && (
                  <div className={styles.agentPreview}>
                    {sections.length > 0 ? sections.map((s, i) => (
                      <div key={i} className={styles.agentPreviewSection}>
                        <div className={styles.agentPreviewTitle}>{s.title}</div>
                        {s.content.trim() && (
                          <div className={styles.agentPreviewContent}>
                            {s.content.length > 200 ? s.content.slice(0, 200) + '...' : s.content}
                          </div>
                        )}
                      </div>
                    )) : (
                      <div className={styles.agentPreviewContent}>
                        {agent.systemPrompt ? (agent.systemPrompt.length > 300 ? agent.systemPrompt.slice(0, 300) + '...' : agent.systemPrompt) : t('agents.noContentPreview')}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <SlideOverPanel
        open={showPanel}
        onClose={resetForm}
        title={agentMode === 'create' ? t('agents.addAgentTitle') : t('agents.editAgentTitle', { name: editingAgent?.name || '' })}
        width={620}
        footer={
          <>
            <button className={`${styles.btn} ${styles.btnOutline}`} onClick={resetForm} disabled={agentRefining}>{t('agents.cancel')}</button>
            <button className={`${styles.btn} ${styles.btnAccent}`} onClick={handleSave} disabled={agentSaving || agentRefining}>
              {agentSaving ? t('agents.saving') : agentMode === 'create' ? t('agents.create') : t('agents.save')}
            </button>
          </>
        }
      >
        {agentError && <div className={styles.msgErr} style={{ marginBottom: '14px' }}>{agentError}</div>}
        {agentRefining && <div className={styles.msgOk} style={{ marginBottom: '14px' }}>{t('agents.refining')}</div>}
        <div className={styles.row}>
          <label className={styles.field}>
            <span className={styles.label}>{t('agents.nameLabel')}</span>
            <input className={styles.input} value={agentName} onChange={(e) => setAgentName(e.target.value)} placeholder={t('agents.namePlaceholder')} autoComplete="off" disabled={agentRefining} />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>{t('agents.roleLabel')}</span>
            <input className={styles.input} value={agentRole} onChange={(e) => setAgentRole(e.target.value)} placeholder={t('agents.rolePlaceholder')} autoComplete="off" disabled={agentRefining} />
          </label>
        </div>
        <label className={styles.field}>
          <span className={styles.label}>{t('agents.descLabel')}</span>
          <input className={styles.input} value={agentDesc} onChange={(e) => setAgentDesc(e.target.value)} placeholder={t('agents.descPlaceholder')} autoComplete="off" disabled={agentRefining} />
        </label>

        {availableFolders.length > 0 && (
          <div className={styles.formSection}>
            <h3 className={styles.formSectionTitle}>{t('agents.knowledgeBinding')}</h3>
            <div className={styles.formHint} style={{ marginBottom: 8 }}>{t('agents.knowledgeBindingHint')}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {availableFolders.map((f) => {
                const selected = knowledgeFolders.includes(f.id);
                return (
                  <button
                    key={f.id}
                    type="button"
                    className={`${styles.btn} ${styles.btnSmall} ${selected ? styles.btnAccent : styles.btnOutline}`}
                    onClick={() => {
                      setKnowledgeFolders(selected ? knowledgeFolders.filter((id) => id !== f.id) : [...knowledgeFolders, f.id]);
                    }}
                    disabled={agentRefining}
                  >
                    {selected ? '✓ ' : ''}{f.name}
                  </button>
                );
              })}
            </div>
            {knowledgeFolders.length > 0 && (
              <div className={styles.formHint} style={{ marginTop: 6 }}>{t('agents.boundFolders', { count: knowledgeFolders.length })}</div>
            )}
          </div>
        )}

        {availableSkills.length > 0 && (
          <div className={styles.formSection}>
            <h3 className={styles.formSectionTitle}>{t('agents.skillBinding')}</h3>
            <div className={styles.formHint} style={{ marginBottom: 8 }}>
              {t('agents.skillBindingHint')}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {availableSkills.filter((s) => !s.alwaysLoad).map((s) => {
                const selected = agentSkills.includes(s.name);
                return (
                  <button
                    key={s.name}
                    type="button"
                    className={`${styles.btn} ${styles.btnSmall} ${selected ? styles.btnAccent : styles.btnOutline}`}
                    onClick={() => {
                      setAgentSkills(selected ? agentSkills.filter((n) => n !== s.name) : [...agentSkills, s.name]);
                    }}
                    disabled={agentRefining}
                  >
                    {selected ? '✓ ' : ''}{s.name}
                  </button>
                );
              })}
            </div>
            {agentSkills.length > 0 && (
              <div className={styles.formHint} style={{ marginTop: 6 }}>
                {t('agents.boundSkills', { count: agentSkills.length })}
              </div>
            )}
          </div>
        )}

        <div className={styles.formSection}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 className={styles.formSectionTitle} style={{ margin: 0 }}>System Prompt</h3>
            <div style={{ display: 'flex', gap: '4px' }}>
              <input ref={mdFileInputRef} type="file" accept=".md" style={{ display: 'none' }} onChange={handleMdImport} />
              <button
                className={`${styles.btn} ${styles.btnSmall} ${styles.btnOutline}`}
                onClick={() => mdFileInputRef.current?.click()}
                type="button"
                disabled={agentRefining}
              >
                {t('agents.importMd')}
              </button>
              <button
                className={`${styles.btn} ${styles.btnSmall} ${styles.btnOutline}`}
                onClick={handleRefineTemplate}
                disabled={agentRefining}
                type="button"
              >
                {agentRefining ? t('agents.refiningStatus') : t('agents.aiRefine')}
              </button>
              <button
                className={`${styles.btn} ${styles.btnSmall} ${!agentEditView ? styles.btnAccent : styles.btnOutline}`}
                onClick={() => setAgentEditView(false)}
                type="button"
              >
                {t('agents.previewTab')}
              </button>
              <button
                className={`${styles.btn} ${styles.btnSmall} ${agentEditView ? styles.btnAccent : styles.btnOutline}`}
                onClick={() => setAgentEditView(true)}
                type="button"
              >
                {t('agents.editTab')}
              </button>
            </div>
          </div>
          {agentEditView ? (
            <textarea
              className={styles.textarea}
              value={agentPrompt}
              onChange={(e) => { if (!agentRefining) setAgentPrompt(e.target.value); }}
              placeholder={t('agents.promptPlaceholder')}
              rows={18}
              spellCheck={false}
              disabled={agentRefining}
              style={agentRefining ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}
            />
          ) : (
            <div className={styles.markdownPreview}>
              {agentPrompt ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{agentPrompt}</ReactMarkdown>
              ) : (
                <span style={{ color: 'var(--text-3)' }}>{t('agents.noContent')}</span>
              )}
            </div>
          )}
        </div>
      </SlideOverPanel>
    </>
  );
}
