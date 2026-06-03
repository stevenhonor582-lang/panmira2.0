import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../../store';
import { Toggle, ConfirmDialog } from '../ui';
import styles from '../SettingsView.module.css';

interface MemoryConfig {
  'retention.days': string;
  'retention.auto_cleanup': string;
  'embedding.auto_tag': string;
  'embedding.auto_embed': string;
  'wiki.auto_sync': string;
  'knowledge.auto_link': string;
  [key: string]: string;
}

interface EmbeddingStatus {
  available: boolean;
  provider: string;
  model: string;
  baseUrl: string;
  dimensions: number;
}

interface MemoryStats {
  totalDocuments: number;
  totalFolders: number;
  documentsByScope: { scope: string; count: number }[];
}

const SCOPE_KEYS: Record<string, string> = {
  org: 'knowledge.orgPublic',
  bot: 'knowledge.digitalWorkers',
  group: 'knowledge.groupCollabArea',
  other: 'knowledge.other',
};

export function KnowledgeSection() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const token = useStore((s) => s.token);
  const [config, setConfig] = useState<MemoryConfig | null>(null);
  const [embedding, setEmbedding] = useState<EmbeddingStatus | null>(null);
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; latency?: number; error?: string; model?: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [cleanupPreview, setCleanupPreview] = useState<number | null>(null);
  const [cleaning, setCleaning] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const loadData = useCallback(async () => {
    try {
      const [configRes, embedRes, statsRes] = await Promise.all([
        fetch('/api/knowledge/config', { headers }),
        fetch('/api/knowledge/embedding-status', { headers }),
        fetch('/api/knowledge/stats', { headers }),
      ]);
      if (configRes.ok) {
        const data = await configRes.json();
        setConfig(data.config);
      }
      if (embedRes.ok) setEmbedding(await embedRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
    } catch {}
  }, [token]);

  useEffect(() => { loadData(); }, [loadData]);

  const toggleConfig = async (key: string) => {
    if (!config) return;
    const newVal = config[key] === 'true' ? 'false' : 'true';
    const res = await fetch('/api/knowledge/config', {
      method: 'PUT',
      headers,
      body: JSON.stringify({ key, value: newVal }),
    });
    if (res.ok) setConfig({ ...config, [key]: newVal });
  };

  const updateRetentionDays = async (days: number) => {
    if (!config || days < 0) return;
    await fetch('/api/knowledge/config', {
      method: 'PUT',
      headers,
      body: JSON.stringify({ key: 'retention.days', value: String(days) }),
    });
    setConfig({ ...config, 'retention.days': String(days) });
    loadCleanupPreview(days);
  };

  const loadCleanupPreview = async (days?: number) => {
    const d = days ?? parseInt(config?.['retention.days'] || '365', 10);
    const res = await fetch(`/api/knowledge/cleanup-preview?days=${d}`, { headers });
    if (res.ok) {
      const data = await res.json();
      setCleanupPreview(data.count);
    }
  };

  const doCleanup = async () => {
    const days = parseInt(config?.['retention.days'] || '365', 10);
    setConfirmDialog({
      title: t('knowledge.cleanupNow'),
      message: t('knowledge.cleanupConfirm', { count: cleanupPreview ?? '?', days }),
      onConfirm: () => { setConfirmDialog(null); doCleanupConfirm(); },
    });
    return;
  };

  const doCleanupConfirm = async () => {
    const days = parseInt(config?.['retention.days'] || '365', 10);
    setCleaning(true);
    try {
      const res = await fetch('/api/knowledge/cleanup', {
        method: 'POST',
        headers,
        body: JSON.stringify({ days }),
      });
      if (res.ok) {
        const data = await res.json();
        setMsg({ text: t('knowledge.cleanedCount', { count: data.deleted }), ok: true });
        setCleanupPreview(0);
        loadData();
      }
    } catch {
      setMsg({ text: t('knowledge.cleanupFailed'), ok: false });
    }
    setCleaning(false);
  };

  const testEmbedding = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/knowledge/embedding-test', { method: 'POST', headers });
      if (res.ok) setTestResult(await res.json());
    } catch {
      setTestResult({ success: false, error: t('knowledge.requestFailed') });
    }
    setTesting(false);
  };

  const rebuildIndex = async () => {
    setConfirmDialog({
      title: t('knowledge.rebuildButton'),
      message: t('knowledge.rebuildConfirm'),
      onConfirm: () => { setConfirmDialog(null); doRebuildConfirm(); },
    });
  };

  const doRebuildConfirm = async () => {
    setRebuilding(true);
    try {
      const res = await fetch('/api/knowledge/rebuild-index', { method: 'POST', headers });
      if (res.ok) {
        const data = await res.json();
        setMsg({ text: data.message || t('knowledge.rebuildComplete'), ok: true });
      }
    } catch {
      setMsg({ text: t('knowledge.rebuildFailed'), ok: false });
    }
    setRebuilding(false);
  };

  useEffect(() => {
    if (config) loadCleanupPreview();
  }, [config?.['retention.days']]);

  if (!config) return <div className={styles.cardItemDesc}>{t('knowledge.loading')}</div>;

  return (
    <>
      <h2 className={styles.contentTitle}>{t('knowledge.title')}</h2>

      {/* Section 1: Memory Strategy */}
      <h3 className={styles.contentSubTitle}>{t('knowledge.memoryStrategy')}</h3>
      <div className={styles.card}>
        <div className={styles.cardItem}>
          <div className={styles.cardItemLeft}>
            <span className={styles.cardItemLabel}>{t('knowledge.autoTag')}</span>
            <span className={styles.cardItemDesc}>{t('knowledge.autoTagDesc')}</span>
          </div>
          <Toggle on={config['embedding.auto_tag'] === 'true'} onClick={() => toggleConfig('embedding.auto_tag')} ariaLabel="Toggle auto tag" />
        </div>
        <div className={styles.cardItem}>
          <div className={styles.cardItemLeft}>
            <span className={styles.cardItemLabel}>{t('knowledge.autoEmbed')}</span>
            <span className={styles.cardItemDesc}>{t('knowledge.autoEmbedDesc')}</span>
          </div>
          <Toggle on={config['embedding.auto_embed'] === 'true'} onClick={() => toggleConfig('embedding.auto_embed')} ariaLabel="Toggle auto embed" />
        </div>
        <div className={styles.cardItem}>
          <div className={styles.cardItemLeft}>
            <span className={styles.cardItemLabel}>{t('knowledge.bidirectionalLink')}</span>
            <span className={styles.cardItemDesc}>{t('knowledge.bidirectionalLinkDesc')}</span>
          </div>
          <Toggle on={config['knowledge.auto_link'] === 'true'} onClick={() => toggleConfig('knowledge.auto_link')} ariaLabel="Toggle auto link" />
        </div>
        <div className={styles.cardItem}>
          <div className={styles.cardItemLeft}>
            <span className={styles.cardItemLabel}>{t('knowledge.feishuWikiSync')}</span>
            <span className={styles.cardItemDesc}>{t('knowledge.feishuWikiSyncDesc')}</span>
          </div>
          <Toggle on={config['wiki.auto_sync'] === 'true'} onClick={() => toggleConfig('wiki.auto_sync')} ariaLabel="Toggle wiki sync" />
        </div>
      </div>

      {/* Section 2: Embedding */}
      <h3 className={styles.contentSubTitle}>{t('knowledge.embeddingSettings')}</h3>
      <div className={styles.card}>
        <div className={styles.cardItem}>
          <div className={styles.cardItemLeft}>
            <span className={styles.cardItemLabel}>{t('knowledge.serviceStatus')}</span>
            <span className={styles.cardItemDesc}>
              {embedding
                ? `${embedding.available ? t('knowledge.available') : t('knowledge.unavailable')} — ${embedding.provider !== 'none' ? embedding.provider : t('knowledge.notConfigured')}`
                : t('knowledge.loading')}
            </span>
          </div>
          <span className={`${styles.connBadge} ${embedding?.available ? styles.connBadgeOnline : styles.connBadgeOffline}`}>
            <span className={`${styles.connDot} ${embedding?.available ? styles.connDotOn : styles.connDotOff}`} />
            {embedding?.available ? t('knowledge.configured') : t('knowledge.notConfigured')}
          </span>
        </div>
        <div className={styles.cardItem}>
          <div className={styles.cardItemLeft}>
            <span className={styles.cardItemLabel}>{t('knowledge.modelLabel')}</span>
            <span className={styles.cardItemDesc}>{embedding?.model || 'N/A'}</span>
          </div>
          <span className={styles.typeTag}>{t('knowledge.dimensionsLabel', { dims: embedding?.dimensions ?? 1024 })}</span>
        </div>
        {embedding?.baseUrl && (
          <div className={styles.cardItem}>
            <div className={styles.cardItemLeft}>
              <span className={styles.cardItemLabel}>{t('knowledge.apiAddress')}</span>
              <span className={styles.cardItemDesc}>{embedding.baseUrl}</span>
            </div>
          </div>
        )}
        <div className={styles.cardItem}>
          <div className={styles.cardItemLeft}>
            <span className={styles.cardItemLabel}>{t('knowledge.connectionTest')}</span>
            {testResult && (
              <span className={testResult.success ? styles.msgOk : styles.msgErr}>
                {testResult.success ? t('knowledge.testSuccess', { latency: testResult.latency, model: testResult.model }) : t('knowledge.testFailed', { error: testResult.error })}
              </span>
            )}
          </div>
          <button className={`${styles.btn} ${styles.btnOutline} ${styles.btnSmall}`} onClick={testEmbedding} disabled={testing}>
            {testing ? t('knowledge.testing') : t('knowledge.testConnection')}
          </button>
        </div>
      </div>

      {/* Section 3: Cleanup */}
      <h3 className={styles.contentSubTitle}>{t('knowledge.longTermCleanup')}</h3>
      <div className={styles.card}>
        <div className={styles.cardItem}>
          <div className={styles.cardItemLeft}>
            <span className={styles.cardItemLabel}>{t('knowledge.retentionDays')}</span>
            <span className={styles.cardItemDesc}>{t('knowledge.retentionDaysDesc')}</span>
          </div>
          <input
            type="number"
            className={styles.input}
            style={{ width: 80, textAlign: 'center' }}
            value={config['retention.days']}
            min={0}
            onChange={(e) => updateRetentionDays(parseInt(e.target.value, 10) || 0)}
          />
        </div>
        <div className={styles.cardItem}>
          <div className={styles.cardItemLeft}>
            <span className={styles.cardItemLabel}>{t('knowledge.autoCleanup')}</span>
            <span className={styles.cardItemDesc}>{t('knowledge.autoCleanupDesc')}</span>
          </div>
          <Toggle on={config['retention.auto_cleanup'] === 'true'} onClick={() => toggleConfig('retention.auto_cleanup')} ariaLabel="Toggle auto cleanup" />
        </div>
        <div className={styles.cardItem}>
          <div className={styles.cardItemLeft}>
            <span className={styles.cardItemLabel}>{t('knowledge.cleanupPreview')}</span>
            <span className={styles.cardItemDesc}>
              {cleanupPreview !== null
                ? t('knowledge.cleanupPreviewDesc', { count: cleanupPreview, days: config['retention.days'] })
                : t('knowledge.loading')}
            </span>
          </div>
          <button
            className={`${styles.btn} ${styles.btnDanger} ${styles.btnSmall}`}
            onClick={doCleanup}
            disabled={cleaning || (cleanupPreview ?? 0) === 0}
          >
            {cleaning ? t('knowledge.cleaning') : t('knowledge.cleanupNow')}
          </button>
        </div>
      </div>

      {/* Section 4: Overview */}
      <h3 className={styles.contentSubTitle}>{t('knowledge.overview')}</h3>
      <div className={styles.card}>
        <div className={styles.cardItem}>
          <div className={styles.cardItemLeft}>
            <span className={styles.cardItemLabel}>{t('knowledge.totalDocs')}</span>
            <span className={styles.cardItemDesc}>{t('knowledge.totalDocsDesc', { docs: stats?.totalDocuments ?? '-', folders: stats?.totalFolders ?? '-' })}</span>
          </div>
        </div>
        {stats?.documentsByScope.map((s) => (
          <div key={s.scope} className={styles.cardItem}>
            <div className={styles.cardItemLeft}>
              <span className={styles.cardItemLabel}>{SCOPE_KEYS[s.scope] ? t(SCOPE_KEYS[s.scope]) : s.scope}</span>
              <span className={styles.cardItemDesc}>{t('knowledge.docCount', { count: s.count })}</span>
            </div>
            <span className={styles.statBadge}>{s.count}</span>
          </div>
        ))}
        <div className={styles.cardItem}>
          <div className={styles.cardItemLeft}>
            <span className={styles.cardItemLabel}>{t('knowledge.rebuildIndex')}</span>
            <span className={styles.cardItemDesc}>{t('knowledge.rebuildIndexDesc')}</span>
          </div>
          <button
            className={`${styles.btn} ${styles.btnOutline} ${styles.btnSmall}`}
            onClick={rebuildIndex}
            disabled={rebuilding}
          >
            {rebuilding ? t('knowledge.rebuilding') : t('knowledge.rebuildButton')}
          </button>
        </div>
        <div className={styles.cardItem}>
          <div className={styles.cardItemLeft}>
            <span className={styles.cardItemLabel}>{t('knowledge.browseDocs')}</span>
            <span className={styles.cardItemDesc}>{t('knowledge.browseDocsDesc')}</span>
          </div>
          <button
            className={`${styles.btn} ${styles.btnOutline} ${styles.btnSmall}`}
            onClick={() => navigate('/memory')}
          >
            {t('knowledge.openBrowser')}
          </button>
        </div>
      </div>

      {msg && (
        <div className={msg.ok ? styles.msgOk : styles.msgErr} style={{ marginTop: 12 }}>
          {msg.text}
        </div>
      )}

      {confirmDialog && (
        <ConfirmDialog
          open
          title={confirmDialog.title}
          message={confirmDialog.message}
          variant="danger"
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
    </>
  );
}
