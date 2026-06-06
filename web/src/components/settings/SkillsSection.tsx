import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../../store';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styles from '../SettingsView.module.css';

interface SkillEntry {
  name: string;
  summary: string;
  description?: string;
  scope: string;
  owner_bot: string;
  category: string;
  triggers: string[];
  directory?: string;
  enabled?: boolean; // per-bot binding state
  origin?: string;
  pluginName?: string;
}

const CATEGORIES = ['all', 'system', 'productivity', 'knowledge', 'communication', 'voice', 'admin'] as const;
const CATEGORY_LABELS: Record<string, string> = {
  system: '系统', productivity: '效率', knowledge: '知识',
  communication: '沟通', voice: '语音', admin: '管理',
};

const PLUGIN_LABELS: Record<string, string> = {
  system: '系统',
  lark: '飞书',
  superpowers: 'Superpowers',
  gstack: 'gstack',
  ecc: 'ECC',
  anthropics: 'anthropics',
  antigravity: '去AI味',
  marketing: '营销',
  slides: 'PPT',
  vmt: 'VMT',
  user: '用户',
};

export function SkillsSection() {
  const { t } = useTranslation();
  const token = useStore((s) => s.token);
  const bots = useStore((s) => s.bots);

  // ── State ──
  const [allSkills, setAllSkills] = useState<SkillEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [scopeFilter, setScopeFilter] = useState('all'); // 'all' | 'global' | 'bot'
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [pluginFilter, setPluginFilter] = useState('all');
  const [selectedBot, setSelectedBot] = useState('');
  const [bindings, setBindings] = useState<Map<string, boolean>>(new Map()); // skillName -> enabled
  const [previewSkill, setPreviewSkill] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [showInstall, setShowInstall] = useState(false);
  const [installSearch, setInstallSearch] = useState('');
  const [actionLoading, setActionLoading] = useState('');

  // ── Fetch all skills + bindings ──
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [regRes, bindRes] = await Promise.all([
        fetch('/api/skills/registry', { headers: { Authorization: `Bearer ${token}` } }),
        selectedBot
          ? fetch(`/api/skills/registry?bot=${encodeURIComponent(selectedBot)}`, { headers: { Authorization: `Bearer ${token}` } })
          : Promise.resolve(null),
      ]);
      
      const regData = regRes.ok ? await regRes.json() : { skills: [] };
      const skills: SkillEntry[] = (regData.skills || []).map((s: any) => ({
        name: s.name,
        summary: s.summary || '',
        description: s.description || '',
        scope: s.scope || 'global',
        owner_bot: s.ownerBot || '',
        category: s.category || 'system',
        triggers: s.triggers || [],
        directory: s.directory || '',
        origin: s.origin || s.pluginName || '',
        pluginName: s.pluginName || '',
      }));
      setAllSkills(skills);

      // Load per-bot bindings from API
      if (selectedBot && bindRes && bindRes.ok) {
        const bd = await bindRes.json();
        const map = new Map<string, boolean>();
        (bd.skills || bd || []).forEach((b: any) => {
          map.set(b.skill_name || b.name, b.enabled !== false);
        });
        setBindings(map);
      } else if (!selectedBot) {
        // All bots: no binding state shown
        setBindings(new Map());
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [token, selectedBot]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Toggle enable/disable ──
  const toggleSkill = async (skillName: string, enabled: boolean) => {
    if (!selectedBot) return;
    setActionLoading(skillName);
    try {
      await fetch(`/api/bot-skills/${encodeURIComponent(selectedBot)}/${encodeURIComponent(skillName)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ enabled }),
      });
      setBindings(prev => { const m = new Map(prev); m.set(skillName, enabled); return m; });
    } catch (e) { console.error(e); }
    setActionLoading('');
  };

  // ── Install ──
  const installSkill = async (skillName: string) => {
    if (!selectedBot) return;
    try {
      await fetch(`/api/skills/${encodeURIComponent(skillName)}/install`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ botName: selectedBot }),
      });
      setBindings(prev => { const m = new Map(prev); m.set(skillName, true); return m; });
      setShowInstall(false);
    } catch (e) { console.error(e); }
  };

  // ── Preview ──
  const togglePreview = async (skill: SkillEntry) => {
    if (previewSkill === skill.name) { setPreviewSkill(null); setPreviewContent(''); return; }
    setPreviewSkill(skill.name);
    setPreviewLoading(true);
    try {
      if (skill.directory) {
        const res = await fetch(`/api/skills/catalog-content?dir=${encodeURIComponent(skill.directory)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) { const d = await res.json(); setPreviewContent(d.skillMd || ''); }
      } else {
        setPreviewContent(`# ${skill.name}\n\n${skill.summary}\n\n触发词: ${skill.triggers.join(', ')}`);
      }
    } catch { setPreviewContent(''); }
    setPreviewLoading(false);
  };

  // ── Filters ──
  const filtered = allSkills
    .filter(s => scopeFilter === 'all' || s.scope === scopeFilter)
    .filter(s => categoryFilter === 'all' || s.category === categoryFilter)
    .filter(s => pluginFilter === 'all' || s.pluginName === pluginFilter)
    .filter(s => !selectedBot || s.scope === 'global' || s.owner_bot === selectedBot)
    .filter(s => !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.summary.toLowerCase().includes(search.toLowerCase()));

  // Categories and plugins present in current data
  const activeCategories = [...new Set(allSkills.map(s => s.category))];
  const activePlugins = [...new Set(allSkills.map(s => s.pluginName).filter((p): p is string => !!p))];
  const pluginCounts: Record<string, number> = {};
  for (const s of allSkills) {
    const p = s.pluginName || 'user';
    pluginCounts[p] = (pluginCounts[p] || 0) + 1;
  }
  const scopeCounts = { all: allSkills.length, global: allSkills.filter(s => s.scope === 'global').length, bot: allSkills.filter(s => s.scope === 'bot').length };

  // Skills not yet bound to selected bot
  const boundNames = new Set([...bindings.keys()]);
  const installable = allSkills.filter(s => (s.scope === 'global') && !boundNames.has(s.name));
  const filteredInstallable = installable.filter(s => !installSearch || s.name.toLowerCase().includes(installSearch.toLowerCase()));

  return (
    <>
      <h2 className={styles.contentTitle}>{t('skills.title')}</h2>
      <p className={styles.contentDesc}>
        {t('skills.desc', { plugins: activePlugins.length, skills: allSkills.length })} ·
        全局 {scopeCounts.global} · Bot私有 {scopeCounts.bot}
        {selectedBot && <> · {selectedBot} 已绑定 {bindings.size}</>}
        {filtered.length !== allSkills.length && (
          <> · <span style={{ color: 'var(--accent, #6c8aff)', fontWeight: 600 }}>筛选结果: {filtered.length} / {allSkills.length}</span>
            <button style={{ marginLeft: 6, fontSize: 11, color: 'var(--muted)', background: 'none', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 8px', cursor: 'pointer' }}
              onClick={() => { setScopeFilter('all'); setCategoryFilter('all'); setPluginFilter('all'); setSearch(''); }}>清除筛选</button>
          </>
        )}
      </p>

      {/* ── Filter Bar ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <select className={styles.input} style={{ width: 200 }} value={selectedBot}
          onChange={(e) => { setSelectedBot(e.target.value); setBindings(new Map()); }}>
          <option value="">{t('skills.allBots')}</option>
          {(bots || []).map((b: any) => (
            <option key={b.name || b.id} value={b.name || b.id}>{b.name || b.id}</option>
          ))}
        </select>

        <div className={styles.filterBar} style={{ margin: 0 }}>
          <button className={`${styles.filterChip} ${scopeFilter === 'all' ? styles.filterChipActive : ''}`}
            onClick={() => setScopeFilter('all')}>全部</button>
          <button className={`${styles.filterChip} ${scopeFilter === 'global' ? styles.filterChipActive : ''}`}
            onClick={() => setScopeFilter('global')}>🌐 全局</button>
          <button className={`${styles.filterChip} ${scopeFilter === 'bot' ? styles.filterChipActive : ''}`}
            onClick={() => setScopeFilter('bot')}>🤖 Bot私有</button>
        </div>

        <div className={styles.filterBar} style={{ margin: 0 }}>
          <button className={`${styles.filterChip} ${categoryFilter === 'all' ? styles.filterChipActive : ''}`}
            onClick={() => setCategoryFilter('all')}>全部类型</button>
          {activeCategories.filter(c => c !== 'all').map(c => (
            <button key={c} className={`${styles.filterChip} ${categoryFilter === c ? styles.filterChipActive : ''}`}
              onClick={() => setCategoryFilter(c)}>{CATEGORY_LABELS[c] || c}</button>
          ))}
        </div>

        <div className={styles.filterBar} style={{ margin: 0 }}>
          <button className={`${styles.filterChip} ${pluginFilter === 'all' ? styles.filterChipActive : ''}`}
            onClick={() => setPluginFilter('all')}>全部插件</button>
          {activePlugins.sort((a, b) => (pluginCounts[b] || 0) - (pluginCounts[a] || 0)).map(p => (
            <button key={p} className={`${styles.filterChip} ${pluginFilter === p ? styles.filterChipActive : ''}`}
              onClick={() => setPluginFilter(p)}>
              {PLUGIN_LABELS[p] || p} <span style={{ opacity: 0.6, fontSize: 10 }}>{pluginCounts[p] || 0}</span>
            </button>
          ))}
        </div>

        <input className={styles.input} style={{ width: 200 }} placeholder={t('skills.searchPlaceholder')}
          value={search} onChange={(e) => setSearch(e.target.value)} />

        {selectedBot && (
          <button className={`${styles.btn} ${styles.btnAccent} ${styles.btnSmall}`}
            onClick={() => setShowInstall(true)}>+ {t('skills.installSkill')}</button>
        )}
      </div>

      {/* ── Skill List ── */}
      {loading ? (
        <div className={styles.agentGrid}>
          <div className={styles.agentCard}><span className={styles.cardItemDesc}>{t('skills.loading')}</span></div>
        </div>
      ) : filtered.length === 0 ? (
        <div className={styles.agentCard}>
          <div className={styles.agentCardName}>{t('skills.noBindings')}</div>
          <div className={styles.agentCardDesc}>{search ? '无匹配结果' : t('skills.noBindingsDesc')}</div>
        </div>
      ) : (
        <div className={styles.agentGrid}>
          {filtered.map(skill => {
            const isPreview = previewSkill === skill.name;
            const isEnabled = selectedBot ? (bindings.get(skill.name) ?? false) : false;
            const hasBinding = selectedBot ? bindings.has(skill.name) : false;
            const isActionLoading = actionLoading === skill.name;

            return (
              <div key={skill.name} className={`${styles.agentCard} ${isPreview ? styles.agentCardExpanded : ''}`}>
                <div className={styles.agentCardHeader}>
                  <div className={styles.agentCardName}>{skill.name}</div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <span className={styles.agentCategoryTag}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setCategoryFilter(skill.category)}>{CATEGORY_LABELS[skill.category] || skill.category}</span>
                    <span style={{
                      display: 'inline-block', padding: '1px 6px', borderRadius: 3, fontSize: 10,
                      background: skill.scope === 'bot' ? 'rgba(251,191,36,.15)' : 'rgba(108,138,255,.15)',
                      color: skill.scope === 'bot' ? '#fbbf24' : '#6c8aff',
                    }}>
                      {skill.scope === 'bot' ? `🤖 ${skill.owner_bot}` : '🌐 全局'}
                    </span>
                    {skill.pluginName && (
                      <span style={{
                        display: 'inline-block', padding: '1px 6px', borderRadius: 3, fontSize: 10,
                        background: 'rgba(255,255,255,.08)', color: 'var(--muted)',
                        cursor: 'pointer',
                      }} onClick={() => setPluginFilter(skill.pluginName!)}>
                        {PLUGIN_LABELS[skill.pluginName] || skill.pluginName}
                      </span>
                    )}
                  </div>
                </div>
                <div className={styles.agentCardDesc}>
                  {skill.summary?.slice(0, 120) || skill.description?.slice(0, 120) || t('skills.noDescription')}
                </div>
                {skill.triggers.length > 0 && (
                  <div style={{ marginTop: 4, display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                    {skill.triggers.slice(0, 5).map(tr => (
                      <span key={tr} style={{ fontSize: 10, color: 'var(--muted)', background: 'var(--bg)', padding: '1px 5px', borderRadius: 3, cursor: 'pointer' }}
                            onClick={() => setSearch(tr)}>{tr}</span>
                    ))}
                  </div>
                )}
                <div className={styles.agentCardActions} style={{ gap: 4 }}>
                  <button className={`${styles.btn} ${styles.btnSmall} ${styles.btnOutline}`}
                    onClick={() => togglePreview(skill)}>
                    {isPreview ? '收起' : '预览'}
                  </button>
                  {selectedBot && (
                    <>
                      <button
                        className={`${styles.btn} ${styles.btnSmall} ${hasBinding && isEnabled ? styles.btnAccent : styles.btnOutline}`}
                        disabled={isActionLoading}
                        onClick={() => toggleSkill(skill.name, !(hasBinding && isEnabled))}
                      >
                        {isActionLoading ? '...' : hasBinding && isEnabled ? '🟢 已启用' : hasBinding ? '⚫ 已禁用' : '安装'}
                      </button>
                      {hasBinding && skill.scope !== 'bot' && (
                        <button className={`${styles.btn} ${styles.btnSmall} ${styles.btnOutline}`}
                          onClick={() => toggleSkill(skill.name, false)}>卸载</button>
                      )}
                    </>
                  )}
                </div>
                {isPreview && (
                  <div className={styles.agentPreview}>
                    {previewLoading ? t('skills.loading') : (
                      <div className={styles.markdownPreview}>
                        {previewContent ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{previewContent}</ReactMarkdown> : '无内容'}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Install Modal ── */}
      {showInstall && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 200,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={(e) => { if (e.target === e.currentTarget) setShowInstall(false); }}>
          <div style={{
            background: 'var(--surface, #1a1d27)', border: '1px solid var(--border, #2a2d3a)',
            borderRadius: 12, padding: 20, width: 480, maxHeight: '70vh', overflow: 'auto',
          }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>安装到 {selectedBot}</h3>
            <input className={styles.input} style={{ width: '100%', marginBottom: 10 }}
              placeholder="搜索..." value={installSearch}
              onChange={(e) => setInstallSearch(e.target.value)} />
            <div style={{ maxHeight: 400, overflow: 'auto' }}>
              {filteredInstallable.map(s => (
                <div key={s.name} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 0', borderBottom: '1px solid var(--border, #2a2d3a)',
                }}>
                  <div>
                    <div style={{ fontWeight: 500 }}>{s.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{s.summary?.slice(0, 60)}</div>
                  </div>
                  <button className={`${styles.btn} ${styles.btnSmall} ${styles.btnAccent}`}
                    onClick={() => installSkill(s.name)}>安装</button>
                </div>
              ))}
              {filteredInstallable.length === 0 && (
                <div style={{ textAlign: 'center', padding: 20, color: 'var(--muted)' }}>
                  {installSearch ? '无匹配结果' : '所有全局 skill 已安装'}
                </div>
              )}
            </div>
            <div style={{ marginTop: 12, textAlign: 'right' }}>
              <button className={`${styles.btn} ${styles.btnSmall}`} onClick={() => setShowInstall(false)}>关闭</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
