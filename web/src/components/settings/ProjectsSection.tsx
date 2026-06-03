import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../../store';
import styles from '../SettingsView.module.css';

interface ProjectRoot { name: string; path: string; modified: string }
interface ProjectItem { name: string; path: string; isDirectory: boolean; size: number; modified: string; icon: string }

export function ProjectsSection() {
  const { t } = useTranslation();
  const token = useStore((s) => s.token);

  const [projectRoots, setProjectRoots] = useState<ProjectRoot[]>([]);
  const [projectItems, setProjectItems] = useState<ProjectItem[]>([]);
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [projectBreadcrumbs, setProjectBreadcrumbs] = useState<{ name: string; path: string }[]>([]);
  const [projectLoading, setProjectLoading] = useState(false);
  const [projectFileContent, setProjectFileContent] = useState<{ path: string; content: string } | null>(null);
  const [projectFileLoading, setProjectFileLoading] = useState(false);

  const fetchProjectRoots = useCallback(async () => {
    setProjectLoading(true);
    try {
      const res = await fetch('/api/projects/roots', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { const d = await res.json(); setProjectRoots(d.roots || []); }
    } catch { /* ignore */ }
    setProjectLoading(false);
  }, [token]);

  const fetchProjectDir = useCallback(async (dir: string) => {
    setProjectLoading(true);
    setProjectFileContent(null);
    try {
      const res = await fetch(`/api/projects/list?dir=${encodeURIComponent(dir)}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const d = await res.json();
        setProjectItems(d.items || []);
        setProjectPath(dir);
        const crumbs: { name: string; path: string }[] = [];
        for (const root of projectRoots) {
          if (dir === root.path || dir.startsWith(root.path + '/')) {
            crumbs.push({ name: root.name, path: root.path });
            const rel = dir.slice(root.path.length + 1);
            if (rel) {
              const parts = rel.split('/');
              let p = root.path;
              for (const part of parts) { p += '/' + part; crumbs.push({ name: part, path: p }); }
            }
            break;
          }
        }
        setProjectBreadcrumbs(crumbs);
      }
    } catch { /* ignore */ }
    setProjectLoading(false);
  }, [token, projectRoots]);

  const fetchProjectFile = useCallback(async (filePath: string) => {
    setProjectFileLoading(true);
    try {
      const res = await fetch(`/api/projects/read?path=${encodeURIComponent(filePath)}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { const d = await res.json(); setProjectFileContent({ path: filePath, content: d.content || '' }); }
    } catch { /* ignore */ }
    setProjectFileLoading(false);
  }, [token]);

  useEffect(() => { if (projectRoots.length === 0) fetchProjectRoots(); }, []);

  return (
    <>
      <h2 className={styles.contentTitle}>{t('projects.title')}</h2>
      <p className={styles.contentDesc}>{t('projects.desc')}</p>

      {projectPath && (
        <div className={styles.projectBreadcrumbs}>
          <button className={`${styles.btn} ${styles.btnSmall} ${styles.btnOutline}`} onClick={() => { setProjectPath(null); setProjectItems([]); setProjectFileContent(null); }}>
            {t('projects.rootDir')}
          </button>
          {projectBreadcrumbs.map((crumb, i) => (
            <span key={crumb.path} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ color: 'var(--text-3)' }}>/</span>
              <button
                className={`${styles.btn} ${styles.btnSmall} ${i === projectBreadcrumbs.length - 1 ? styles.btnAccent : styles.btnOutline}`}
                onClick={() => fetchProjectDir(crumb.path)}
                style={{ fontSize: '12px' }}
              >
                {crumb.name}
              </button>
            </span>
          ))}
        </div>
      )}

      {projectFileContent && (
        <div className={styles.card} style={{ marginBottom: '12px' }}>
          <div className={styles.cardItem}>
            <div className={styles.cardItemLeft}>
              <span className={styles.cardItemLabel}>
                {projectFileContent.path.split('/').pop()}
                <span className={styles.typeTag}>{projectFileContent.path}</span>
              </span>
            </div>
            <button className={`${styles.btn} ${styles.btnSmall} ${styles.btnOutline}`} onClick={() => setProjectFileContent(null)}>{t('projects.close')}</button>
          </div>
          <div style={{ padding: '0 22px 16px' }}>
            {projectFileLoading ? t('projects.loading') : (
              <pre className={styles.projectCodeBlock}>{projectFileContent.content}</pre>
            )}
          </div>
        </div>
      )}

      {projectLoading ? (
        <div className={styles.card}>
          <div className={styles.cardItem}><span className={styles.cardItemDesc}>{t('projects.loading')}</span></div>
        </div>
      ) : !projectPath ? (
        <div className={styles.agentGrid}>
          {projectRoots.map((root) => (
            <div key={root.path} className={styles.pluginCard} style={{ cursor: 'pointer' }} onClick={() => fetchProjectDir(root.path)}>
              <div className={styles.pluginCardHeader}>
                <div className={styles.pluginCardName}>{root.name}</div>
                <span className={styles.agentCategoryTag}>{t('projects.directory')}</span>
              </div>
              <div className={styles.pluginCardDesc}>{root.path}</div>
            </div>
          ))}
          {projectRoots.length === 0 && (
            <div className={styles.agentCard}>
              <div className={styles.agentCardName}>{t('projects.noProjects')}</div>
              <div className={styles.agentCardDesc}>{t('projects.noProjectsDesc')}</div>
            </div>
          )}
        </div>
      ) : (
        <div className={styles.card}>
          {projectItems.length === 0 ? (
            <div className={styles.cardItem}><span className={styles.cardItemDesc}>{t('projects.emptyDir')}</span></div>
          ) : projectItems.map((item) => (
            <div key={item.path} className={styles.cardItem} style={{ cursor: 'pointer' }} onClick={() => {
              if (item.isDirectory) fetchProjectDir(item.path);
              else fetchProjectFile(item.path);
            }}>
              <div className={styles.cardItemLeft}>
                <span className={styles.cardItemLabel}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-3)', marginRight: '8px' }}>{item.icon}</span>
                  {item.name}
                  {item.isDirectory && <span className={styles.typeTag}>{t('projects.folder')}</span>}
                </span>
                <span className={styles.cardItemDesc}>
                  {item.isDirectory ? '' : `${(item.size / 1024).toFixed(1)} KB`}
                  {item.modified && ` · ${new Date(item.modified).toLocaleDateString('zh-CN')}`}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
