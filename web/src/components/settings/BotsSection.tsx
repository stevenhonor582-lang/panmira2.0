import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../../store';
import type { BotInfo, PermissionConfig } from '../../types';
import { BotPermissionsPanel } from './BotPermissionsPanel';
import { SensitiveField } from '../SensitiveField';
import { SlideOverPanel } from '../SlideOverPanel';
import { AGENT_CATEGORIES } from './AgentsSection';
import type { AgentTemplate } from './AgentsSection';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styles from '../SettingsView.module.css';

interface BotsSectionProps {
  agents: AgentTemplate[];
}

export function BotsSection({ agents: propAgents }: BotsSectionProps) {
  const { t } = useTranslation();
  const token = useStore((s) => s.token);
  const connected = useStore((s) => s.connected);
  const bots = useStore((s) => s.bots);
  const aiProviders = useStore((s) => s.aiProviders);
  const defaultProviderId = useStore((s) => s.defaultProviderId);
  const defaultWorkDir = useStore((s) => s.defaultWorkDir);
  const defaultProvider = aiProviders.find((p) => p.id === defaultProviderId);
  const logout = useStore((s) => s.logout);

  // Local agents state — loaded on demand if propAgents is empty
  const [localAgents, setLocalAgents] = useState<AgentTemplate[]>([]);
  const agents = propAgents.length > 0 ? propAgents : localAgents;

  const [showPanel, setShowPanel] = useState(false);
  const [botMode, setBotMode] = useState<'create' | 'edit'>('create');
  const [editBot, setEditBot] = useState<BotInfo | undefined>();

  const [botName, setBotName] = useState('');
  const [botPlatform, setBotPlatform] = useState('web');
  const [botWorkDir, setBotWorkDir] = useState('');
  const [botDesc, setBotDesc] = useState('');
  const [botMaxTurns, setBotMaxTurns] = useState('');
  const [feishuAppId, setFeishuAppId] = useState('');
  const [feishuAppSecret, setFeishuAppSecret] = useState('');
  const [selectedProviderId, setSelectedProviderId] = useState('');
  const [botEngine, setBotEngine] = useState('claude');
  const [botModel, setBotModel] = useState('');
  const [oaiBaseUrl, setOaiBaseUrl] = useState('');
  const [oaiApiKey, setOaiApiKey] = useState('');
  const [botLoading, setBotLoading] = useState(false);
  const [botError, setBotError] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [botSystemPrompt, setBotSystemPrompt] = useState('');
  const [feishuAppIdHint, setFeishuAppIdHint] = useState('');
  const [feishuSecretHint, setFeishuSecretHint] = useState(false);
  const [botAgentSearch, setBotAgentSearch] = useState('');
  const [showAgentDropdown, setShowAgentDropdown] = useState(false);
  const [permsPanelOpen, setPermsPanelOpen] = useState(false);
  const [permsBotName, setPermsBotName] = useState('');
  const [permsConfig, setPermsConfig] = useState<PermissionConfig | undefined>();

  // Auto-generate workspace from bot name in create mode
  const prevBotMode = useRef(botMode);
  const prevBotName = useRef(botName);
  useEffect(() => {
    if (botMode === 'create') {
      // Only auto-set when user types a name (not on initial mount)
      const justSwitchedToCreate = prevBotMode.current !== 'create';
      const nameChanged = botName !== prevBotName.current;
      if ((justSwitchedToCreate || nameChanged) && botName.trim()) {
        setBotWorkDir(`/home/ubuntu/workspace-${botName.trim()}`);
      }
    }
    prevBotMode.current = botMode;
    prevBotName.current = botName;
  }, [botMode, botName]);

  const ensureAgents = useCallback(async () => {
    if (propAgents.length > 0 || localAgents.length > 0) return;
    try {
      const res = await fetch('/api/agents', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setLocalAgents(data.agents || []);
      }
    } catch { /* proceed without agents */ }
  }, [token, propAgents.length, localAgents.length]);

  const openCreateBot = useCallback(async () => {
    setBotMode('create');
    setEditBot(undefined);
    setBotName('');
    setBotPlatform('web');
    setBotDesc('');
    setBotMaxTurns('');
    setFeishuAppId('');
    setFeishuAppSecret('');
    setFeishuAppIdHint('');
    setFeishuSecretHint(false);
    setBotError('');
    setSelectedTemplateId('');
    setBotSystemPrompt('');
    setBotAgentSearch('');
    ensureAgents();
    if (defaultProvider) {
      setSelectedProviderId(defaultProvider.id);
      setBotEngine('claude');
      setBotModel(defaultProvider.model);
      setOaiBaseUrl(defaultProvider.baseUrl);
      setOaiApiKey(defaultProvider.apiKey);
      setBotWorkDir('');
    } else {
      setSelectedProviderId('');
      setBotEngine('claude');
      setBotModel('');
      setOaiBaseUrl('');
      setOaiApiKey('');
      setBotWorkDir(defaultWorkDir || bots[0]?.workingDirectory || '');
    }
    setShowPanel(true);
  }, [defaultProvider, defaultWorkDir, bots]);

  const openEditBot = useCallback(async (bot: BotInfo) => {
    setBotMode('edit');
    setEditBot(bot);
    setBotError('');

    // 1. Load agents so we can look up agent names
    let loadedAgents = agents;
    if (propAgents.length === 0 && localAgents.length === 0) {
      try {
        const res = await fetch('/api/agents', { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const data = await res.json();
          const fetched = data.agents || [];
          setLocalAgents(fetched);
          loadedAgents = fetched;
        }
      } catch { /* proceed without agents */ }
    }

    // 2. Fetch bot detail from DB — single source of truth for ALL fields
    let cfg: Record<string, any> = {};
    try {
      const res = await fetch(`/api/bots/${encodeURIComponent(bot.name)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        cfg = data.config || data;
      }
    } catch { /* proceed with what we have */ }

    // 3. Populate ALL form fields from DB config
    setBotName(cfg.name || bot.name);
    setBotPlatform(cfg.platform || bot.platform);
    setBotWorkDir(cfg.workingDirectory || bot.workingDirectory);
    setBotDesc(cfg.description || '');
    setBotMaxTurns(cfg.maxTurns != null ? String(cfg.maxTurns) : '');
    setFeishuAppId(cfg.feishuAppId || '');
    setFeishuAppSecret(cfg.feishuAppSecret || '');
    setFeishuAppIdHint('');
    setFeishuSecretHint(false);

    const engine = cfg.engine || bot.engine || 'claude';
    setBotEngine(engine);
    setBotModel(cfg.model || bot.model || '');

    // 4. Match AI provider by baseUrl (most reliable) then model
    const botBaseUrl = cfg.baseUrl || bot.claudeBaseUrl || bot.openaiCompat?.baseUrl;
    const botApiKey = cfg.apiKey || '';
    let matchedProviderId = '';
    if (botBaseUrl) {
      const match = aiProviders.find((p) => p.baseUrl === botBaseUrl);
      if (match) matchedProviderId = match.id;
    }
    if (!matchedProviderId && cfg.model) {
      const match = aiProviders.find((p) => p.model === cfg.model);
      if (match) matchedProviderId = match.id;
    }
    if (!matchedProviderId && !engine && defaultProvider) {
      matchedProviderId = defaultProvider.id;
    }
    if (matchedProviderId) {
      const p = aiProviders.find((pr) => pr.id === matchedProviderId);
      if (p) {
        setSelectedProviderId(p.id);
        setBotModel(p.model);
        setOaiBaseUrl(p.baseUrl);
        setOaiApiKey(p.apiKey || botApiKey);
      }
    } else {
      setSelectedProviderId('');
      setOaiBaseUrl(botBaseUrl || '');
      setOaiApiKey(botApiKey);
    }

    // 5. Template — from DB templateId, look up agent name
    const templateId = cfg.agentId || '';
    setSelectedTemplateId(templateId);
    if (templateId) {
      const agent = loadedAgents.find((a: any) => a.id === templateId);
      setBotSystemPrompt(agent?.systemPrompt || cfg.systemPrompt || '');
      setBotAgentSearch(agent?.name || '');
    } else {
      setBotSystemPrompt(cfg.systemPrompt || '');
      setBotAgentSearch('');
    }

    setShowPanel(true);
  }, [token, aiProviders, defaultProvider, agents, propAgents, localAgents]);

  const handleAgentSelect = useCallback((templateId: string) => {
    setSelectedTemplateId(templateId);
    if (!templateId) {
      setBotSystemPrompt('');
      setBotDesc('');
      return;
    }
    const tmpl = agents.find((a) => a.id === templateId);
    if (!tmpl) return;
    
    // Auto-populate from template
    setBotSystemPrompt(tmpl.systemPrompt || tmpl.description || '');
    setBotDesc(tmpl.description || '');
    
    // If this is a template (from /api/templates), auto-set engine+model
    const t = tmpl as any;
    if (t.isTemplate) {
      if (t.default_engine && t.default_engine !== 'claude') {
        setBotEngine(t.default_engine);
      }
      if (t.default_model) setBotModel(t.default_model);
    }
  }, [agents]);

  const handleProviderChange = useCallback((providerId: string) => {
    setSelectedProviderId(providerId);
    if (!providerId) {
      setBotEngine('claude');
      setBotModel('');
      setOaiBaseUrl('');
      setOaiApiKey('');
      return;
    }
    const p = aiProviders.find((pr) => pr.id === providerId);
    if (p) {
      setBotEngine('claude');
      setBotModel(p.model);
      setOaiBaseUrl(p.baseUrl);
      setOaiApiKey(p.apiKey);
    }
  }, [aiProviders, botMode]);

  const openPermsPanel = useCallback(async (bot: BotInfo) => {
    setPermsBotName(bot.name);
    setPermsConfig(undefined);
    try {
      const res = await fetch(`/api/bots/${encodeURIComponent(bot.name)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPermsConfig(data.permissions || {});
      }
    } catch { /* use empty config */ }
    setPermsPanelOpen(true);
  }, [token]);

  const handleSavePerms = useCallback(async (permissions: PermissionConfig) => {
    // Fetch current bot config first, then merge permissions in
    const res = await fetch(`/api/bots/${encodeURIComponent(permsBotName)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to fetch bot config');
    const cfg = await res.json();
    const body = { ...cfg, permissions };
    // Remove runtime fields that shouldn't be sent back
    delete body.paused;
    delete body.createdAt;
    delete body.updatedAt;

    const putRes = await fetch(`/api/bots/${encodeURIComponent(permsBotName)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (!putRes.ok) {
      const err = await putRes.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${putRes.status}`);
    }
    // Refresh bot list
    const r = await fetch('/api/bots', { headers: { Authorization: `Bearer ${token}` } });
    if (r.ok) { const d = await r.json(); useStore.getState().setBots(d.bots); }
  }, [permsBotName, token]);

  const handlePauseBot = useCallback(async (name: string) => {
    if (!window.confirm(t('bots.pauseConfirm', { name }))) return;
    try {
      const res = await fetch(`/api/bots/${encodeURIComponent(name)}/pause`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setBotError(d.error || t('bots.pauseFailed')); return; }
      const r = await fetch('/api/bots', { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) { const d = await r.json(); useStore.getState().setBots(d.bots); }
    } catch { setBotError(t('bots.pauseFailed')); }
  }, [token]);

  const handleResumeBot = useCallback(async (name: string) => {
    try {
      const res = await fetch(`/api/bots/${encodeURIComponent(name)}/resume`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setBotError(d.error || t('bots.resumeFailed')); return; }
      const r = await fetch('/api/bots', { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) { const d = await r.json(); useStore.getState().setBots(d.bots); }
    } catch { setBotError(t('bots.resumeFailed')); }
  }, [token]);

  const handleDeleteBot = useCallback(async (name: string) => {
    if (!window.confirm(t('bots.deleteConfirm', { name }))) return;
    try {
      await fetch(`/api/bots/${encodeURIComponent(name)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch { /* WS will update list */ }
  }, [token]);

  const handleSaveBot = useCallback(async () => {
    if (!botName.trim()) { setBotError(t('bots.nameRequired')); return; }
    if (!botWorkDir.trim()) { setBotError(t('bots.workDirRequired')); return; }
    if (botPlatform === 'feishu' && botMode === 'create') {
      if (!feishuAppId.trim() || !feishuAppSecret.trim()) {
        setBotError(t('bots.feishuCredentialsRequired'));
        return;
      }
    }
    setBotLoading(true);
    setBotError('');
    const body: Record<string, unknown> = {
      name: botName.trim(),
      platform: botPlatform,
      workingDirectory: botWorkDir.trim(),
      engine: botEngine,
    };
    if (botDesc.trim()) body.description = botDesc.trim();
    if (botModel.trim()) body.model = botModel.trim();
    if (botEngine === 'codex' && botModel.trim()) body.codex = { model: botModel.trim() };
    if (botMaxTurns.trim()) body.maxTurns = parseInt(botMaxTurns, 10);
    if (botEngine === 'openai-compat') {
      const openaiCompat: Record<string, string> = {};
      if (oaiBaseUrl.trim()) openaiCompat.baseUrl = oaiBaseUrl.trim();
      if (oaiApiKey.trim()) openaiCompat.apiKey = oaiApiKey.trim();
      if (botModel.trim()) openaiCompat.model = botModel.trim();
      if (Object.keys(openaiCompat).length > 0) body.openaiCompat = openaiCompat;
    }
    if (botEngine === 'claude') {
      if (oaiBaseUrl.trim()) body.baseUrl = oaiBaseUrl.trim();
      if (oaiApiKey.trim()) body.apiKey = oaiApiKey.trim();
    }
    if (botPlatform === 'feishu') {
      if (feishuAppId.trim()) body.feishuAppId = feishuAppId.trim();
      if (feishuAppSecret.trim()) body.feishuAppSecret = feishuAppSecret.trim();
    }
    if (selectedTemplateId) {
      body.agentId = selectedTemplateId;
      // If selected template is from /api/templates, auto-populate skills + agents + knowledge
      const t = agents.find((a) => a.id === selectedTemplateId) as any;
      if (t?.isTemplate) {
        if (t.default_skills?.length) body.skills = t.default_skills;
        if (t.default_agents?.length) body.agents = t.default_agents;
        if (t.knowledgeFolders?.length) body.knowledgeFolders = t.knowledgeFolders;
      }
    } else {
      body.agentId = '';
      if (botSystemPrompt.trim()) body.systemPrompt = botSystemPrompt.trim();
    }
    try {
      const url = botMode === 'create' ? '/api/bots' : `/api/bots/${encodeURIComponent(editBot!.name)}`;
      const method = botMode === 'create' ? 'POST' : 'PUT';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = await res.json().catch(() => ({}) as any);
      if (data.message?.includes('restart')) {
        setBotError(t('bots.restartNeeded'));
        setTimeout(() => setShowPanel(false), 4000);
        return;
      }
      // Refresh bot list so next edit sees latest agentId
      try {
        const rr = await fetch('/api/bots', { headers: { Authorization: `Bearer ${token}` } });
        if (rr.ok) {
          const bd = await rr.json();
          useStore.getState().setBots(bd.bots);
        }
      } catch { /* non-critical */ }
      setShowPanel(false);
    } catch (err) {
      setBotError(err instanceof Error ? err.message : t('bots.operationFailed'));
    } finally {
      setBotLoading(false);
    }
  }, [botName, botPlatform, botWorkDir, botDesc, botMaxTurns, botEngine, botModel, feishuAppId, feishuAppSecret, oaiBaseUrl, oaiApiKey, selectedTemplateId, botSystemPrompt, botMode, editBot, token]);

  const selectedProvider = aiProviders.find((p) => p.id === selectedProviderId);

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <h2 className={styles.contentTitle} style={{ margin: 0 }}>{t('bots.title')}</h2>
        <button className={`${styles.btn} ${styles.btnAccent}`} onClick={openCreateBot}>{t('bots.addBot')}</button>
      </div>
      <p className={styles.contentDesc}>{t('bots.desc')}</p>
      <div className={styles.card}>
        {bots.length === 0 ? (
          <div className={styles.cardItem}>
            <div className={styles.cardItemLeft}>
              <span className={styles.cardItemLabel}>{t('bots.noBots')}</span>
              <span className={styles.cardItemDesc}>{connected ? t('bots.noBotsDesc') : t('bots.noBotsOffline')}</span>
            </div>
          </div>
        ) : (
          <div className={styles.botList}>
            {bots.map((bot: any) => (
              <div key={bot.name} className={styles.botItem}>
                <span className={`${styles.botDot} ${(bot as any).paused ? styles.botDotOffline : (connected ? styles.botDotOnline : styles.botDotOffline)}`} />
                <div className={styles.botInfo}>
                  <div className={styles.botName}>{bot.name}{(bot as any).paused ? ` (${t('bots.paused')})` : ''}</div>
                  <div className={styles.botMeta}>{bot.platform} &middot; {bot.workingDirectory}</div>
                  {bot.description && <div className={styles.cardItemDesc} style={{ marginTop: '2px' }}>{bot.description}</div>}
                </div>
                <div className={styles.botActions}>
                  <button className={`${styles.btn} ${styles.btnSmall} ${styles.btnOutline}`} onClick={() => openPermsPanel(bot)}>权限</button>
                  {(bot as any).paused ? (
                    <button className={`${styles.btn} ${styles.btnSmall} ${styles.btnAccent}`} onClick={() => handleResumeBot(bot.name)}>{t('bots.resume')}</button>
                  ) : (
                    <button className={`${styles.btn} ${styles.btnSmall} ${styles.btnOutline}`} onClick={() => openEditBot(bot)}>{t('bots.edit')}</button>
                  )}
                  {(bot as any).paused ? (
                    <button className={`${styles.btn} ${styles.btnSmall} ${styles.btnOutline}`} onClick={() => handleDeleteBot(bot.name)}>{t("bots.delete")}</button>
                  ) : (
                    <>
                      <button className={`${styles.btn} ${styles.btnSmall} ${styles.btnOutline}`} onClick={() => handlePauseBot(bot.name)} title={t("bots.pause")}>{t("bots.pause")}</button>
                      <button className={`${styles.btn} ${styles.btnSmall} ${styles.btnDanger}`} onClick={() => handleDeleteBot(bot.name)}>{t("bots.delete")}</button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <SlideOverPanel
        open={showPanel}
        onClose={() => setShowPanel(false)}
        title={botMode === 'create' ? t('bots.addBotTitle') : t('bots.editBotTitle', { name: editBot?.name || '' })}
      >
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginBottom: 16 }}>
          <button className={`${styles.btn} ${styles.btnOutline}`} onClick={() => setShowPanel(false)}>{t('bots.cancel')}</button>
          <button className={`${styles.btn} ${styles.btnAccent}`} onClick={handleSaveBot} disabled={botLoading}>
            {botLoading ? t('bots.saving') : botMode === 'create' ? t('bots.create') : t('bots.save')}
          </button>
        </div>
        {botError && <div className={styles.msgErr} style={{ marginBottom: '14px' }}>{botError}</div>}
        <input type="text" style={{ display: 'none' }} tabIndex={-1} autoComplete="username" />
        <input type="password" style={{ display: 'none' }} tabIndex={-1} autoComplete="new-password" />
        <div className={styles.row}>
          <label className={styles.field}>
            <span className={styles.label}>{t('bots.nameLabel')}</span>
            <input className={styles.input} value={botName} onChange={(e) => setBotName(e.target.value)} placeholder="my-bot" autoComplete="off" />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>{t('bots.platformLabel')}</span>
            <select className={styles.input} value={botPlatform} onChange={(e) => setBotPlatform(e.target.value)} disabled={botMode === 'edit'}>
              <option value="web">Web</option>
              <option value="feishu">{t('bots.platformFeishu')}</option>
            </select>
          </label>
        </div>

        {botPlatform === 'feishu' && (
          <div className={styles.formSection}>
            <h3 className={styles.formSectionTitle}>{t('bots.feishuCredentials')}</h3>
            <div className={styles.row}>
              <label className={styles.field}>
                <span className={styles.label}>App ID {botMode === 'create' && '*'}</span>
                <input className={styles.input} value={feishuAppId} onChange={(e) => setFeishuAppId(e.target.value)}
                  placeholder="cli_a9xxxxxxxxxxxxxxx"
                  autoComplete="new-password" spellCheck={false} />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>App Secret {botMode === 'create' && '*'}</span>
                <SensitiveField value={feishuAppSecret} onChange={setFeishuAppSecret}
                  placeholder={t('bots.appSecretPlaceholder')} />
              </label>
            </div>
            {botMode === 'edit' && <div className={styles.formHint}>{t('bots.keepCredentials')}</div>}
          </div>
        )}

        <label className={styles.field}>
          <span className={styles.label}>{t('bots.workDirLabel')}</span>
          <input className={styles.input} value={botWorkDir} onChange={(e) => setBotWorkDir(e.target.value)} placeholder="/home/ubuntu/workspace" autoComplete="off" />
        </label>

        <div className={styles.formSection}>
          <h3 className={styles.formSectionTitle}>{t('bots.aiProvider')}</h3>
          {aiProviders.length === 0 ? (
            <div className={styles.formHint}>{t('bots.noProviderConfigured')}</div>
          ) : (
            <label className={styles.field}>
              <span className={styles.label}>{t('bots.selectProvider')}</span>
              <select className={styles.input} value={selectedProviderId} onChange={(e) => handleProviderChange(e.target.value)}>
                <option value="">{t('bots.noUse')}</option>
                {aiProviders.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.model || t('bots.modelNotSet')}{p.id === defaultProviderId ? t('bots.defaultLabel') : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
          {selectedProvider && (
            <div className={styles.formHint} style={{ color: 'var(--accent)' }}>
              {t('bots.modelInfo', { model: botModel, engine: botEngine })}
            </div>
          )}
        </div>

        <div className={styles.formSection}>
          <h3 className={styles.formSectionTitle}>{t('bots.agentTemplate')}</h3>
          {agents.length === 0 ? (
            <div className={styles.formHint}>{t('bots.noTemplates')}</div>
          ) : (
            <label className={styles.field} style={{ position: 'relative' }}>
              <span className={styles.label}>{t('bots.selectTemplate')}</span>
              <input
                className={styles.input}
                placeholder={t('bots.searchTemplates')}
                value={botAgentSearch}
                onChange={(e) => { setBotAgentSearch(e.target.value); }}
                onFocus={() => { setBotAgentSearch(''); setShowAgentDropdown(true); }}
                onBlur={() => { setTimeout(() => setShowAgentDropdown(false), 150); }}
                autoComplete="off"
              />
              {showAgentDropdown && (
                <div className={styles.agentComboList}>
                  <button
                    className={`${styles.agentComboItem}`}
                    onMouseDown={(e) => { e.preventDefault(); handleAgentSelect(''); setBotAgentSearch(''); setShowAgentDropdown(false); }}
                  >
                    {t('bots.noTemplate')}
                  </button>
                  {agents
                    .filter((a) => a.templateType === "custom" || a.templateType === "standard" || (a as any).isTemplate)
                    .filter((a) => !botAgentSearch || a.name.toLowerCase().includes(botAgentSearch.toLowerCase()) || (a.description || '').toLowerCase().includes(botAgentSearch.toLowerCase()))
                    .slice(0, 30)
                    .map((a) => (
                      <button
                        key={a.id}
                        className={`${styles.agentComboItem} ${selectedTemplateId === a.id ? styles.agentComboItemActive : ''}`}
                        onMouseDown={(e) => { e.preventDefault(); handleAgentSelect(a.id); setBotAgentSearch(''); setShowAgentDropdown(false); }}
                      >
                        <span>{a.name}</span>
                        <span className={styles.agentComboMeta}>{t(AGENT_CATEGORIES[a.category] || a.category)}</span>
                      </button>
                    ))}
                </div>
              )}
            </label>
          )}
          {selectedTemplateId && (() => {
            const selected = agents.find((a) => a.id === selectedTemplateId);
            if (!selected) return null;
            return (
              <div style={{
                marginTop: '8px',
                padding: '10px 12px',
                background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
                border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
                borderRadius: '6px',
                fontSize: '13px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ color: 'var(--accent)', fontWeight: 600, fontSize: '14px' }}>
                    {t('bots.loaded', { name: selected.name })}
                  </span>
                  <button
                    type="button"
                    style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-2)', cursor: 'pointer', fontSize: '12px', padding: '2px 8px' }}
                    onClick={() => { handleAgentSelect(''); setBotAgentSearch(''); }}
                  >{t('bots.remove')}</button>
                </div>
                {selected.description && (
                  <div style={{ color: 'var(--text-2)', fontSize: '12px', marginBottom: '4px' }}>{selected.description}</div>
                )}
                <div style={{ color: 'var(--text-3)', fontSize: '11px' }}>
                  {t('bots.promptChars', { count: botSystemPrompt.length })}
                </div>
              </div>
            );
          })()}
          {botSystemPrompt && !selectedTemplateId && (
            <div style={{ marginTop: '8px', color: 'var(--text-3)', fontSize: '12px' }}>
              {t('bots.customPrompt', { count: botSystemPrompt.length })}
            </div>
          )}
          {botSystemPrompt && (
            <div className={styles.markdownPreview} style={{ maxHeight: '200px', marginTop: '6px' }}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{botSystemPrompt}</ReactMarkdown>
            </div>
          )}
        </div>

        <div className={styles.row}>
          <label className={styles.field}>
            <span className={styles.label}>{t('bots.descLabel')}</span>
            <input className={styles.input} value={botDesc} onChange={(e) => setBotDesc(e.target.value)} placeholder={t('bots.descPlaceholder')} autoComplete="off" />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>{t('bots.maxTurnsLabel')}</span>
            <input className={styles.input} type="number" value={botMaxTurns} onChange={(e) => setBotMaxTurns(e.target.value)} placeholder="30" autoComplete="off" />
          </label>
        </div>
      </SlideOverPanel>

      <BotPermissionsPanel
        open={permsPanelOpen}
        onClose={() => setPermsPanelOpen(false)}
        botName={permsBotName}
        permissions={permsConfig}
        onSave={handleSavePerms}
      />
    </>
  );
}
