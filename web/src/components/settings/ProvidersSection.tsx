import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../../store';
import { SensitiveField } from '../SensitiveField';
import { SlideOverPanel } from '../SlideOverPanel';
import { PROVIDER_TEMPLATES } from '../../utils/models';
import type { AIProvider } from '../../utils/models';
import styles from '../SettingsView.module.css';

export function ProvidersSection() {
  const { t } = useTranslation();
  const token = useStore((s) => s.token);
  const aiProviders = useStore((s) => s.aiProviders);
  const addProvider = useStore((s) => s.addProvider);
  const updateProvider = useStore((s) => s.updateProvider);
  const removeProvider = useStore((s) => s.removeProvider);
  const defaultProviderId = useStore((s) => s.defaultProviderId);
  const setDefaultProviderId = useStore((s) => s.setDefaultProviderId);

  const [showPanel, setShowPanel] = useState(false);
  const [editingProvider, setEditingProvider] = useState<AIProvider | null>(null);
  const [provName, setProvName] = useState('');
  const [provType, setProvType] = useState<'LLM' | 'voice' | 'image' | 'video' | 'embedding'>('LLM');
  const [provBaseUrl, setProvBaseUrl] = useState('');
  const [provApiKey, setProvApiKey] = useState('');
  const [provModel, setProvModel] = useState('');
  const [provWorkDir, setProvWorkDir] = useState('');
  const [provTesting, setProvTesting] = useState(false);
  const [provTestResult, setProvTestResult] = useState<{ ok: boolean; text: string } | null>(null);

  const resetForm = useCallback(() => {
    setShowPanel(false);
    setEditingProvider(null);
    setProvName('');
    setProvType('LLM');
    setProvBaseUrl('');
    setProvApiKey('');
    setProvModel('');
    setProvWorkDir('');
    setProvTestResult(null);
  }, []);

  const handleEdit = useCallback((p: AIProvider) => {
    setEditingProvider(p);
    setProvName(p.name);
    setProvType(p.type);
    setProvBaseUrl(p.baseUrl);
    setProvApiKey('');
    setProvModel(p.model);
    setProvWorkDir(p.workDir || '');
    setProvTestResult(null);
    setShowPanel(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!provName.trim() || !provBaseUrl.trim()) return;
    if (!editingProvider && !provApiKey.trim()) return;
    const data: Record<string, any> = {
      name: provName.trim(),
      type: provType,
      baseUrl: provBaseUrl.trim(),
      model: provModel.trim(),
    };
    if (provApiKey.trim()) data.apiKey = provApiKey.trim();
    if (provWorkDir.trim()) data.workDir = provWorkDir.trim();
    if (editingProvider) {
      await updateProvider(editingProvider.id, data);
    } else {
      await addProvider({
        id: `prov-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: data.name,
        baseUrl: data.baseUrl,
        apiKey: data.apiKey || '',
        model: data.model,
        type: data.type,
        workDir: data.workDir,
      } as AIProvider);
    }
    resetForm();
  }, [editingProvider, provName, provType, provBaseUrl, provApiKey, provModel, provWorkDir, addProvider, updateProvider, resetForm]);

  const handleApplyTemplate = useCallback((t: (typeof PROVIDER_TEMPLATES)[number]) => {
    setProvName(t.name);
    setProvBaseUrl(t.baseUrl);
    setProvModel(t.defaultModel);
  }, []);

  const handleTest = useCallback(async () => {
    if (!provBaseUrl.trim()) {
      setProvTestResult({ ok: false, text: t('providers.nameRequired') });
      return;
    }
    if (!provApiKey.trim() && !editingProvider) {
      setProvTestResult({ ok: false, text: t('providers.apiKeyRequired') });
      return;
    }
    setProvTesting(true);
    setProvTestResult(null);
    try {
      const body: Record<string, string> = {
        baseUrl: provBaseUrl.trim(),
        model: provModel.trim() || '',
        type: provType,
      };
      if (provApiKey.trim()) {
        body.apiKey = provApiKey.trim();
      } else if (editingProvider) {
        body.providerId = editingProvider.id;
      }
      const res = await fetch('/api/providers/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setProvTestResult({ ok: true, text: `${t('providers.connectSuccess')}${data.model ? ' · ' + data.model : ''}` });
      } else {
        setProvTestResult({ ok: false, text: data.error || `HTTP ${res.status}` });
      }
    } catch {
      setProvTestResult({ ok: false, text: t('providers.networkFailed') });
    } finally {
      setProvTesting(false);
    }
  }, [provBaseUrl, provApiKey, provModel, token, editingProvider, t]);

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <h2 className={styles.contentTitle} style={{ margin: 0 }}>{t('providers.title')}</h2>
        <button className={`${styles.btn} ${styles.btnAccent}`} onClick={() => { resetForm(); setShowPanel(true); }}>
          {t('providers.addProvider')}
        </button>
      </div>
      <p className={styles.contentDesc}>{t('providers.desc')}</p>
      {aiProviders.length === 0 ? (
        <div className={styles.card}>
          <div className={styles.cardItem}>
            <div className={styles.cardItemLeft}>
              <span className={styles.cardItemLabel}>{t('providers.noProvider')}</span>
              <span className={styles.cardItemDesc}>{t('providers.noProviderDesc')}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className={styles.card}>
          {aiProviders.map((p) => (
            <div key={p.id} className={styles.cardItem} style={{ cursor: 'pointer' }} onClick={() => setDefaultProviderId(p.id)}>
              <div className={styles.cardItemLeft}>
                <span className={styles.cardItemLabel}>
                  {defaultProviderId === p.id && '\u2B50 '}
                  {p.name}
                  <span className={styles.typeTag}>{p.type}</span>
                  {defaultProviderId === p.id && <span className={styles.defaultTag}>{t('providers.defaultTag')}</span>}
                </span>
                <span className={styles.cardItemDesc}>
                  {p.model || t('providers.modelNotSet')} &middot; {p.baseUrl.replace(/^https?:\/\//, '').split('/')[0]}
                  {p.workDir ? ` · ${p.workDir}` : ''}
                </span>
              </div>
              <div className={styles.cardActions}>
                <button className={`${styles.btn} ${styles.btnSmall} ${styles.btnOutline}`} onClick={(e) => { e.stopPropagation(); handleEdit(p); }}>{t('providers.edit')}</button>
                <button className={`${styles.btn} ${styles.btnSmall} ${styles.btnDanger}`} onClick={(e) => { e.stopPropagation(); removeProvider(p.id); }}>{t('providers.delete')}</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <SlideOverPanel
        open={showPanel}
        onClose={resetForm}
        title={editingProvider ? t('providers.editProvider') : t('providers.addProviderTitle')}
        footer={
          <>
            <button className={`${styles.btn} ${styles.btnOutline}`} onClick={resetForm}>{t('providers.cancel')}</button>
            <button className={`${styles.btn} ${styles.btnOutline}`} onClick={handleTest} disabled={provTesting}>
              {provTesting ? t('providers.testing') : t('providers.testConnection')}
            </button>
            <button className={`${styles.btn} ${styles.btnAccent}`} onClick={handleSave}>
              {editingProvider ? t('providers.save') : t('providers.add')}
            </button>
          </>
        }
      >
        {provTestResult && (
          <div className={provTestResult.ok ? styles.msgOk : styles.msgErr} style={{ marginBottom: '14px' }}>
            {provTestResult.text}
          </div>
        )}
        <input type="text" style={{ display: 'none' }} tabIndex={-1} autoComplete="username" />
        <input type="password" style={{ display: 'none' }} tabIndex={-1} autoComplete="new-password" />
        <div className={styles.templateRow}>
          {PROVIDER_TEMPLATES.map((t) => (
            <button key={t.name} className={`${styles.btn} ${styles.btnSmall} ${styles.btnOutline}`} onClick={() => handleApplyTemplate(t)} type="button">
              {t.name}
            </button>
          ))}
        </div>
        <div className={styles.row}>
          <label className={styles.field}>
            <span className={styles.label}>{t('providers.nameLabel')}</span>
            <input className={styles.input} value={provName} onChange={(e) => setProvName(e.target.value)} placeholder={t('providers.namePlaceholder')} autoComplete="off" />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>{t('providers.typeLabel')}</span>
            <select className={styles.input} value={provType} onChange={(e) => setProvType(e.target.value as typeof provType)}>
              <option value="LLM">LLM</option>
              <option value="voice">{t('providers.typeVoice')}</option>
              <option value="image">{t('providers.typeImage')}</option>
              <option value="video">{t('providers.typeVideo')}</option>
              <option value="embedding">Embedding</option>
            </select>
          </label>
        </div>
        <label className={styles.field}>
          <span className={styles.label}>Base URL *</span>
          <input className={styles.input} value={provBaseUrl} onChange={(e) => setProvBaseUrl(e.target.value)} placeholder="https://open.bigmodel.cn/api/paas/v4" autoComplete="off" />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>API Key *</span>
          <SensitiveField value={provApiKey} onChange={setProvApiKey} placeholder={editingProvider ? '留空保留原 Key，输入则更新' : 'sk-...'} />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>{t('providers.modelLabel')}</span>
          <input className={styles.input} value={provModel} onChange={(e) => setProvModel(e.target.value)} placeholder="glm-4-flash" autoComplete="off" />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>{t('providers.workDirLabel')}</span>
          <input className={styles.input} value={provWorkDir} onChange={(e) => setProvWorkDir(e.target.value)} placeholder="/home/ubuntu/workspace" autoComplete="off" />
        </label>
      </SlideOverPanel>
    </>
  );
}
