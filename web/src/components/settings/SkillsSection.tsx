import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../../store';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styles from '../SettingsView.module.css';

interface PluginInfo {
  id: string; name: string; version: string; description: string;
  author: string; skillCount: number; agentCount: number; commandCount: number; enabled: boolean;
}
interface CatalogSkill {
  name: string; description: string; origin: string;
  pluginId: string; pluginName: string; directory: string;
}
interface BotSkillBinding {
  skill_name: string; enabled: boolean; scope: string; owner_bot: string; summary: string;
}

export function SkillsSection() {
  const { t } = useTranslation();
  const token = useStore((s) => s.token);
  const bots = useStore((s) => s.bots);

  // Sub-tabs: plugins | catalog | bots
  type SkillTab = 'plugins' | 'catalog' | 'bots';
  const [skillTab, setSkillTab] = useState<SkillTab>('plugins');

  // Plugins tab
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);

  // Catalog tab
  const [catalogSkills, setCatalogSkills] = useState<CatalogSkill[]>([]);
  const [skillSearch, setSkillSearch] = useState('');
  const [skillPluginFilter, setSkillPluginFilter] = useState('all');
  const [skillPreviewDir, setSkillPreviewDir] = useState<string | null>(null);
  const [skillContent, setSkillContent] = useState('');
  const [skillContentLoading, setSkillContentLoading] = useState(false);

  // Bot skills tab
  const [botBindings, setBotBindings] = useState<BotSkillBinding[]>([]);
  const [selectedBot, setSelectedBot] = useState('');
  const [botBindingSearch, setBotBindingSearch] = useState('');
  const [botBindingsLoading, setBotBindingsLoading] = useState(false);
  const [showInstallPanel, setShowInstallPanel] = useState(false);
  const [availableSkills, setAvailableSkills] = useState<{name:string;summary:string;scope:string;owner_bot:string}[]>([]);
  const [installSearch, setInstallSearch] = useState('');

  const [loading, setLoading] = useState(false);

  // ── Fetch helpers ──
  const fetchPlugins = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/skills/plugins', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { const d = await res.json(); setPlugins(d.plugins || []); }
    } catch { /* ignore */ }
    setLoading(false);
  }, [token]);

  const fetchCatalog = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/skills/catalog', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { const d = await res.json(); setCatalogSkills(d.skills || []); }
    } catch { /* ignore */ }
    setLoading(false);
  }, [token]);

  const fetchSkillContent = useCallback(async (dir: string) => {
    setSkillContentLoading(true);
    try {
      const res = await fetch(`/api/skills/catalog-content?dir=${encodeURIComponent(dir)}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { const d = await res.json(); setSkillContent(d.skillMd || ''); }
    } catch { /* ignore */ }
    setSkillContentLoading(false);
  }, [token]);

  const fetchBotBindings = useCallback(async (botName?: string) => {
    setBotBindingsLoading(true);
    try {
      const bot = botName || selectedBot;
      // Fetch bindings + registry to get scope/owner info
      const [bindRes, regRes] = await Promise.all([
        bot
          ? fetch(`/api/skills/registry?bot=${encodeURIComponent(bot)}`, { headers: { Authorization: `Bearer ${token}` } })
          : fetch(`/api/skills/registry`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/skills/registry`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const allRegistry: any[] = regRes.ok ? ((await regRes.json()).skills || []) : [];
      if (bindRes.ok) {
        const d = await bindRes.json();
        const skills = (d.skills || d || []).map((s: any) => {
          const meta = allRegistry.find((r: any) => r.name === (s.skill_name || s.name));
          return {
            skill_name: s.skill_name || s.name,
            enabled: s.enabled !== false,
            scope: meta?.scope || s.scope || 'global',
            owner_bot: meta?.ownerBot || s.owner_bot || '',
            summary: meta?.summary || s.summary || '',
          };
        });
        setBotBindings(skills);
      }
    } catch { /* ignore */ }
    setBotBindingsLoading(false);
  }, [token, selectedBot]);

  const fetchAvailableSkills = useCallback(async () => {
    try {
      const res = await fetch('/api/skills/registry', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const d = await res.json();
        const bound = new Set(botBindings.map(b => b.skill_name));
        setAvailableSkills((d.skills || []).filter((s: any) => !bound.has(s.name)));
      }
    } catch { /* ignore */ }
  }, [token, botBindings]);

  // ── Effects ──
  useEffect(() => {
    if (skillTab === 'plugins' && plugins.length === 0) fetchPlugins();
    if (skillTab === 'catalog' && catalogSkills.length === 0) fetchCatalog();
    if (skillTab === 'bots') fetchBotBindings(selectedBot);
  }, [skillTab, selectedBot]);

  // ── Actions ──
  const toggleBinding = async (skillName: string, enabled: boolean) => {
    if (!selectedBot) return;
    try {
      await fetch(`/api/bot-skills/${encodeURIComponent(selectedBot)}/${encodeURIComponent(skillName)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ enabled }),
      });
      setBotBindings(prev => prev.map(b => b.skill_name === skillName ? { ...b, enabled } : b));
    } catch (e) { console.error(e); }
  };

  const installSkill = async (skillName: string) => {
    if (!selectedBot) return;
    try {
      await fetch(`/api/skills/${encodeURIComponent(skillName)}/install`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ botName: selectedBot }),
      });
      fetchBotBindings(selectedBot);
      setShowInstallPanel(false);
    } catch (e) { console.error(e); }
  };

  const uninstallSkill = async (skillName: string) => {
    if (!confirm(`Uninstall ${skillName} from ${selectedBot}?`)) return;
    try {
      // Disable binding
      await fetch(`/api/bot-skills/${encodeURIComponent(selectedBot)}/${encodeURIComponent(skillName)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ enabled: false }),
      });
      fetchBotBindings(selectedBot);
    } catch (e) { console.error(e); }
  };

  const deleteSkill = async (skillName: string) => {
    if (!confirm(`Delete skill "${skillName}" permanently?`)) return;
    const adminBot = (bots || []).find((b: any) => b.config?.permissions?.isAdminBot);
    if (!adminBot) { alert('No admin bot configured'); return; }
    try {
      await fetch(`/api/skills/${encodeURIComponent(skillName)}`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ botName: adminBot.name || adminBot.id }),
      });
      fetchBotBindings(selectedBot);
    } catch (e) { console.error(e); }
  };

  // ── Derived data ──
  const pluginNames = [...new Set(catalogSkills.map((s) => s.pluginName))];
  const filteredCatalog = catalogSkills
    .filter((s) => skillPluginFilter === 'all' || s.pluginName === skillPluginFilter)
    .filter((s) => !skillSearch || s.name.toLowerCase().includes(skillSearch.toLowerCase()) || s.description.toLowerCase().includes(skillSearch.toLowerCase()));
  const totalSkills = catalogSkills.length;
  const totalPlugins = plugins.length;

  const filteredBindings = botBindings
    .filter(b => !botBindingSearch || b.skill_name.toLowerCase().includes(botBindingSearch.toLowerCase()));
  const filteredAvailable = availableSkills
    .filter(s => !installSearch || s.name.toLowerCase().includes(installSearch.toLowerCase()));

  // ── Render ──
  return (
    <>
      <h2 className={styles.contentTitle}>{t('skills.title')}</h2>
      <p className={styles.contentDesc}>{t('skills.desc', { plugins: totalPlugins, skills: totalSkills })}</p>

      <div className={styles.tabBar}>
        {([
          { key: 'plugins' as const, label: t('skills.installedPlugins') },
          { key: 'catalog' as const, label: t('skills.skillCatalog') },
          { key: 'bots' as const, label: t('skills.botSkills') },
        ]).map((tab) => (
          <button
            key={tab.key}
            className={`${styles.tabBtn} ${skillTab === tab.key ? styles.tabBtnActive : ''}`}
            onClick={() => { setSkillTab(tab.key); setSkillSearch(''); setSkillPreviewDir(null); }}
          >
            {tab.label}
            <span className={styles.tabCount}>
              {tab.key === 'plugins' ? totalPlugins : tab.key === 'catalog' ? totalSkills : botBindings.length}
            </span>
          </button>
        ))}
      </div>

      {loading || botBindingsLoading ? (
        <div className={styles.agentGrid}>
          <div className={styles.agentCard}><span className={styles.cardItemDesc}>{t('skills.loading')}</span></div>
        </div>
      ) : skillTab === 'plugins' ? (
        /* ── Plugins Tab ── */
        <div className={styles.agentGrid}>
          {plugins.map((p) => (
            <div key={p.id} className={styles.pluginCard}>
              <div className={styles.pluginCardHeader}>
                <div className={styles.pluginCardName}>{p.name}</div>
                <span className={styles.pluginVersion}>v{p.version}</span>
              </div>
              <div className={styles.pluginCardDesc}>{p.description || t('skills.noDescription')}</div>
              <div className={styles.pluginStats}>
                <span className={styles.statBadge}>{t('skills.skillCount', { count: p.skillCount })}</span>
                <span className={styles.statBadge}>{p.agentCount} agents</span>
                <span className={styles.statBadge}>{t('skills.commandCount', { count: p.commandCount })}</span>
                {p.enabled ? <span className={styles.statBadgeEnabled}>{t('skills.enabled')}</span> : <span className={styles.statBadge}>{t('skills.disabled')}</span>}
              </div>
              <div className={styles.pluginCardActions}>
                <button className={`${styles.btn} ${styles.btnSmall} ${styles.btnOutline}`} onClick={() => {
                  setSkillTab('catalog');
                  setSkillPluginFilter(p.name === 'superpowers' ? 'Superpowers' : p.name.includes('claude-mem') ? 'Claude-Mem' : 'ECC');
                  setSkillSearch('');
                }}>
                  {t('skills.viewSkills')}
                </button>
              </div>
            </div>
          ))}
          {plugins.length === 0 && (
            <div className={styles.agentCard}>
              <div className={styles.agentCardName}>{t('skills.noPlugins')}</div>
              <div className={styles.agentCardDesc}>{t('skills.noPluginsDesc')}</div>
            </div>
          )}
        </div>
      ) : skillTab === 'catalog' ? (
        /* ── Catalog Tab ── */
        <>
          <div style={{ marginBottom: '10px' }}>
            <input className={styles.input} style={{ width: '100%' }} placeholder={t('skills.searchPlaceholder')}
              value={skillSearch} onChange={(e) => setSkillSearch(e.target.value)} />
          </div>
          {pluginNames.length > 1 && (
            <div className={styles.filterBar}>
              <button className={`${styles.filterChip} ${skillPluginFilter === 'all' ? styles.filterChipActive : ''}`} onClick={() => setSkillPluginFilter('all')}>{t('skills.all')}</button>
              {pluginNames.sort().map((pn) => (
                <button key={pn} className={`${styles.filterChip} ${skillPluginFilter === pn ? styles.filterChipActive : ''}`} onClick={() => setSkillPluginFilter(pn)}>{pn}</button>
              ))}
            </div>
          )}
          <div className={styles.agentGrid}>
            {filteredCatalog.map((skill) => {
              const isPreview = skillPreviewDir === skill.directory;
              return (
                <div key={skill.directory} className={`${styles.agentCard} ${isPreview ? styles.agentCardExpanded : ''}`}>
                  <div className={styles.agentCardHeader}>
                    <div className={styles.agentCardName}>{skill.name}</div>
                    <span className={styles.agentCategoryTag}>{skill.pluginName}</span>
                  </div>
                  <div className={styles.agentCardDesc}>{skill.description || t('skills.noDescription')}</div>
                  <div className={styles.agentCardActions}>
                    <button className={`${styles.btn} ${styles.btnSmall} ${styles.btnOutline}`} onClick={() => {
                      if (isPreview) { setSkillPreviewDir(null); setSkillContent(''); }
                      else { setSkillPreviewDir(skill.directory); fetchSkillContent(skill.directory); }
                    }}>
                      {isPreview ? t('skills.collapse') : t('skills.preview')}
                    </button>
                  </div>
                  {isPreview && (
                    <div className={styles.agentPreview}>
                      {skillContentLoading ? t('skills.loading') : (
                        <div className={styles.markdownPreview}>
                          {skillContent ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{skillContent}</ReactMarkdown> : t('skills.noContent')}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {filteredCatalog.length === 0 && (
              <div className={styles.agentCard}>
                <div className={styles.agentCardName}>{skillSearch ? t('skills.noMatchSkill') : t('skills.noSkills')}</div>
                <div className={styles.agentCardDesc}>{skillSearch ? t('skills.tryDifferentSearch') : t('skills.noSkillsDesc')}</div>
              </div>
            )}
          </div>
        </>
      ) : (
        /* ── Bot Skills Tab ── */
        <>
          <div className={styles.row} style={{ gap: 10, marginBottom: 12 }}>
            <select className={styles.input} style={{ width: 220 }} value={selectedBot}
              onChange={(e) => setSelectedBot(e.target.value)}>
              <option value="">{t('skills.allBots')}</option>
              {(bots || []).map((b: any) => (
                <option key={b.name || b.id} value={b.name || b.id}>{b.name || b.id}</option>
              ))}
            </select>
            <input className={styles.input} style={{ flex: 1 }} placeholder={t('skills.searchPlaceholder')}
              value={botBindingSearch} onChange={(e) => setBotBindingSearch(e.target.value)} />
            {selectedBot && (
              <button className={`${styles.btn} ${styles.btnAccent} ${styles.btnSmall}`}
                onClick={() => { fetchAvailableSkills(); setShowInstallPanel(true); }}>
                + {t('skills.installSkill')}
              </button>
            )}
          </div>

          {filteredBindings.length === 0 ? (
            <div className={styles.agentCard}>
              <div className={styles.agentCardName}>{t('skills.noBindings')}</div>
              <div className={styles.agentCardDesc}>{t('skills.noBindingsDesc')}</div>
            </div>
          ) : (
            <div className={styles.agentGrid}>
              {filteredBindings.map((b) => (
                <div key={b.skill_name} className={styles.agentCard}>
                  <div className={styles.agentCardHeader}>
                    <div className={styles.agentCardName}>{b.skill_name}</div>
                    <span className={`${styles.agentCategoryTag}`} style={{
                      background: b.scope === 'bot' ? 'rgba(251,191,36,.15)' : 'rgba(108,138,255,.15)',
                      color: b.scope === 'bot' ? '#fbbf24' : '#6c8aff',
                    }}>
                      {b.scope === 'bot' ? `🤖 ${t('skills.scopeBot')}` : `🌐 ${t('skills.scopeGlobal')}`}
                    </span>
                  </div>
                  {b.summary && <div className={styles.agentCardDesc}>{b.summary.slice(0, 100)}</div>}
                  <div className={styles.agentCardActions} style={{ gap: 6 }}>
                    <button className={`${styles.btn} ${styles.btnSmall} ${b.enabled ? styles.btnAccent : styles.btnOutline}`}
                      onClick={() => toggleBinding(b.skill_name, !b.enabled)}>
                      {b.enabled ? '🟢 ' + t('skills.enabled') : '⚫ ' + t('skills.disabled')}
                    </button>
                    {selectedBot && (
                      <button className={`${styles.btn} ${styles.btnSmall} ${styles.btnOutline}`}
                        onClick={() => uninstallSkill(b.skill_name)}>
                        {t('skills.uninstall')}
                      </button>
                    )}
                    {b.scope === 'bot' && (
                      <button className={`${styles.btn} ${styles.btnSmall} ${styles.btnDanger}`}
                        onClick={() => deleteSkill(b.skill_name)}>🗑</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Install Skill SlideOver */}
          {showInstallPanel && (
            <div style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 200,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }} onClick={(e) => { if (e.target === e.currentTarget) setShowInstallPanel(false); }}>
              <div style={{
                background: 'var(--surface, #1a1d27)', border: '1px solid var(--border, #2a2d3a)',
                borderRadius: 12, padding: 20, width: 480, maxHeight: '70vh', overflow: 'auto',
              }}>
                <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>{t('skills.availableSkills')}</h3>
                <input className={styles.input} style={{ width: '100%', marginBottom: 10 }}
                  placeholder={t('skills.searchAvailable')} value={installSearch}
                  onChange={(e) => setInstallSearch(e.target.value)} />
                <div style={{ maxHeight: 400, overflow: 'auto' }}>
                  {filteredAvailable.map((s) => (
                    <div key={s.name} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '8px 0', borderBottom: '1px solid var(--border, #2a2d3a)',
                    }}>
                      <div>
                        <div style={{ fontWeight: 500 }}>{s.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--muted, #8b8fa7)' }}>{s.summary?.slice(0, 60)}</div>
                      </div>
                      <button className={`${styles.btn} ${styles.btnSmall} ${styles.btnAccent}`}
                        onClick={() => installSkill(s.name)}>
                        {t('skills.installSkill')}
                      </button>
                    </div>
                  ))}
                  {filteredAvailable.length === 0 && (
                    <div style={{ textAlign: 'center', padding: 20, color: 'var(--muted, #8b8fa7)' }}>
                      {installSearch ? '无匹配结果' : '所有 skill 已安装'}
                    </div>
                  )}
                </div>
                <div style={{ marginTop: 12, textAlign: 'right' }}>
                  <button className={`${styles.btn} ${styles.btnSmall}`} onClick={() => setShowInstallPanel(false)}>关闭</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
