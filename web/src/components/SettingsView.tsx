import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store';
import { Badge, Button } from './ui';
import { SkillsSection } from './settings/SkillsSection';
import { UsersSection } from './settings/UsersSection';
import { SystemSection } from './settings/SystemSection';
import { ProjectsSection } from './settings/ProjectsSection';
import { CoordinatorSection } from './settings/CoordinatorSection';
import { ProvidersSection } from './settings/ProvidersSection';
import { BotsSection } from './settings/BotsSection';
import { AgentsSection } from './settings/AgentsSection';
import type { AgentTemplate } from './settings/AgentsSection';
import { KnowledgeSection } from './settings/KnowledgeSection';
import styles from './SettingsView.module.css';

type Section = 'providers' | 'bots' | 'agents' | 'skills' | 'projects' | 'sessions' | 'users' | 'coordinator' | 'system' | 'knowledge';

function getSections(t: (key: string) => string): { id: Section; label: string }[] {
  return [
    { id: 'users', label: t('settings.users') },
    { id: 'providers', label: t('settings.providers') },
    { id: 'bots', label: t('settings.bots') },
    { id: 'coordinator', label: t('settings.coordinator') },
    { id: 'knowledge', label: t('settings.knowledge') },
    { id: 'agents', label: t('settings.agents') },
    { id: 'skills', label: t('settings.skills') },
    { id: 'projects', label: t('settings.projects') },
    { id: 'system', label: t('settings.system') },
  ];
}

export function SettingsView() {
  const { t } = useTranslation();
  const logout = useStore((s) => s.logout);
  const bots = useStore((s) => s.bots);
  const aiProviders = useStore((s) => s.aiProviders);
  const [activeSection, setActiveSection] = useState<Section>('providers');
  const [sharedAgents, setSharedAgents] = useState<AgentTemplate[]>([]);
  const sections = getSections(t);

  useEffect(() => {
    if (sharedAgents.length > 0) return;
    const token = useStore.getState().token;
    if (!token) return;
    fetch('/api/agents', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => setSharedAgents(data.agents || []))
      .catch(() => {});
  }, []);

  const renderSection = () => {
    switch (activeSection) {
      case 'providers':
        return <ProvidersSection />;
      case 'bots':
        return <BotsSection agents={sharedAgents} />;
      case 'agents':
        return <AgentsSection onAgentsLoaded={setSharedAgents} />;
      case 'skills':
        return <SkillsSection />;
      case 'projects':
        return <ProjectsSection />;
      case 'system':
        return <SystemSection />;
      case 'users':
        return <UsersSection />;
      case 'coordinator':
        return <CoordinatorSection />;
      case 'knowledge':
        return <KnowledgeSection />;
    }
  };

  return (
    <div className={styles.layout}>
      <nav className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <h1 className={styles.sidebarTitle}>{t('settings.title')}</h1>
        </div>
        {sections.map((s) => (
          <button
            key={s.id}
            className={`${styles.navItem} ${activeSection === s.id ? styles.navItemActive : ''}`}
            onClick={() => setActiveSection(s.id)}
          >
            {s.label}
            {s.id === 'providers' && aiProviders.length > 0 && <Badge>{aiProviders.length}</Badge>}
            {s.id === 'bots' && bots.length > 0 && <Badge>{bots.length}</Badge>}
            {s.id === 'agents' && sharedAgents.length > 0 && <Badge>{sharedAgents.length}</Badge>}
          </button>
        ))}
        <div className={styles.sidebarFooter}>
          <Button variant="danger" size="sm" onClick={logout}>{t('settings.logout')}</Button>
        </div>
      </nav>

      <div className={styles.content}>
        {renderSection()}
      </div>
    </div>
  );
}
