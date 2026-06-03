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

export function SkillsSection() {
  const { t } = useTranslation();
  const token = useStore((s) => s.token);

  const [skillTab, setSkillTab] = useState<'plugins' | 'catalog'>('plugins');
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [catalogSkills, setCatalogSkills] = useState<CatalogSkill[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [skillSearch, setSkillSearch] = useState('');
  const [skillPluginFilter, setSkillPluginFilter] = useState('all');
  const [skillPreviewDir, setSkillPreviewDir] = useState<string | null>(null);
  const [skillContent, setSkillContent] = useState('');
  const [skillContentLoading, setSkillContentLoading] = useState(false);

  const fetchPlugins = useCallback(async () => {
    setSkillsLoading(true);
    try {
      const res = await fetch('/api/skills/plugins', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { const d = await res.json(); setPlugins(d.plugins || []); }
    } catch { /* ignore */ }
    setSkillsLoading(false);
  }, [token]);

  const fetchCatalog = useCallback(async () => {
    setSkillsLoading(true);
    try {
      const res = await fetch('/api/skills/catalog', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { const d = await res.json(); setCatalogSkills(d.skills || []); }
    } catch { /* ignore */ }
    setSkillsLoading(false);
  }, [token]);

  const fetchSkillContent = useCallback(async (dir: string) => {
    setSkillContentLoading(true);
    try {
      const res = await fetch(`/api/skills/catalog-content?dir=${encodeURIComponent(dir)}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { const d = await res.json(); setSkillContent(d.skillMd || ''); }
    } catch { /* ignore */ }
    setSkillContentLoading(false);
  }, [token]);

  useEffect(() => {
    if (skillTab === 'plugins' && plugins.length === 0) fetchPlugins();
    if (skillTab === 'catalog' && catalogSkills.length === 0) fetchCatalog();
  }, [skillTab]);

  const pluginNames = [...new Set(catalogSkills.map((s) => s.pluginName))];
  const filteredCatalog = catalogSkills
    .filter((s) => skillPluginFilter === 'all' || s.pluginName === skillPluginFilter)
    .filter((s) => !skillSearch || s.name.toLowerCase().includes(skillSearch.toLowerCase()) || s.description.toLowerCase().includes(skillSearch.toLowerCase()));

  const totalSkills = catalogSkills.length;
  const totalPlugins = plugins.length;

  return (
    <>
      <h2 className={styles.contentTitle}>{t('skills.title')}</h2>
      <p className={styles.contentDesc}>{t('skills.desc', { plugins: totalPlugins, skills: totalSkills })}</p>

      <div className={styles.tabBar}>
        {([
          { key: 'plugins' as const, label: t('skills.installedPlugins') },
          { key: 'catalog' as const, label: t('skills.skillCatalog') },
        ]).map((tab) => (
          <button
            key={tab.key}
            className={`${styles.tabBtn} ${skillTab === tab.key ? styles.tabBtnActive : ''}`}
            onClick={() => { setSkillTab(tab.key); setSkillSearch(''); setSkillPreviewDir(null); }}
          >
            {tab.label}
            <span className={styles.tabCount}>
              {tab.key === 'plugins' ? totalPlugins : totalSkills}
            </span>
          </button>
        ))}
      </div>

      {skillsLoading ? (
        <div className={styles.agentGrid}>
          <div className={styles.agentCard}><span className={styles.cardItemDesc}>{t('skills.loading')}</span></div>
        </div>
      ) : skillTab === 'plugins' ? (
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
      ) : (
        <>
          <div style={{ marginBottom: '10px' }}>
            <input
              className={styles.input}
              style={{ width: '100%' }}
              placeholder={t('skills.searchPlaceholder')}
              value={skillSearch}
              onChange={(e) => setSkillSearch(e.target.value)}
            />
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
      )}
    </>
  );
}
