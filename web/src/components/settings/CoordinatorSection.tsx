import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../../store';
import styles from '../SettingsView.module.css';

interface CoordConfig { id: string; groupId: string; groupName: string; coordinatorBot: string; teamMembers: string[] }
interface DiscoveredGroup { chatId: string; chatName: string; botName: string }

export function CoordinatorSection() {
  const { t } = useTranslation();
  const token = useStore((s) => s.token);

  const [coordConfigs, setCoordConfigs] = useState<CoordConfig[]>([]);
  const [coordBots, setCoordBots] = useState<{ name: string; platform: string }[]>([]);
  const [coordLoading, setCoordLoading] = useState(false);
  const [coordEditGroup, setCoordEditGroup] = useState('');
  const [coordEditBot, setCoordEditBot] = useState('');
  const [selectedTeamMembers, setSelectedTeamMembers] = useState<string[]>([]);
  const [discoveredGroups, setDiscoveredGroups] = useState<DiscoveredGroup[]>([]);
  const [coordManualId, setCoordManualId] = useState(false);
  const [selectedGroupBots, setSelectedGroupBots] = useState<string[]>([]);
  const [coordEditName, setCoordEditName] = useState('');
  const newGroupIdRef = useRef('');

  const fetchCoordinator = useCallback(async () => {
    setCoordLoading(true);
    try {
      const [cfgRes, botRes, grpRes] = await Promise.all([
        fetch('/api/coordinator/configs', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/bots', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/coordinator/discovered-groups', { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const cfgData = await cfgRes.json();
      const botData = await botRes.json();
      const grpData = await grpRes.json();
      setCoordConfigs(cfgData.configs || []);
      setCoordBots(botData.bots || []);
      setDiscoveredGroups(grpData.groups || []);
    } catch { setCoordConfigs([]); setCoordBots([]); setDiscoveredGroups([]); }
    setCoordLoading(false);
  }, [token]);

  useEffect(() => { fetchCoordinator(); }, [fetchCoordinator]);

  const saveCoordConfig = async (groupId: string, groupName: string, coordinatorBot: string, teamMembers: string[]) => {
    const res = await fetch(`/api/coordinator/configs/${encodeURIComponent(groupId)}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ groupName, coordinatorBot, teamMembers }),
    });
    if (res.ok) { setCoordEditGroup(''); setSelectedTeamMembers([]); fetchCoordinator(); }
  };

  const deleteCoordConfig = async (groupId: string) => {
    const res = await fetch(`/api/coordinator/configs/${encodeURIComponent(groupId)}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) fetchCoordinator();
  };

  const feishuBots = selectedGroupBots.length > 0
    ? coordBots.filter((b) => b.platform === 'feishu' && selectedGroupBots.includes(b.name))
    : coordBots.filter((b) => b.platform === 'feishu');
  const allBots = selectedGroupBots.length > 0
    ? coordBots.filter((b) => selectedGroupBots.includes(b.name))
    : coordBots;
  const availableTeamMembers = allBots.filter((b) => !selectedTeamMembers.includes(b.name));
  const usedGroupIds = coordConfigs.map((c) => c.groupId);

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <h2 className={styles.contentTitle} style={{ margin: 0 }}>{t('coordinator.title')}</h2>
        <button className={`${styles.btn} ${styles.btnAccent}`} onClick={() => { setCoordEditGroup('new'); setCoordEditBot(''); setSelectedTeamMembers([]); setCoordManualId(false); setSelectedGroupBots([]); setCoordEditName(''); newGroupIdRef.current = ''; }}>{t('coordinator.addGroup')}</button>
      </div>
      <p className={styles.contentDesc}>{t('coordinator.desc')}</p>

      {coordEditGroup && (
        <div className={styles.card} style={{ marginBottom: '12px' }}>
          <div className={styles.cardItem}>
            <span className={styles.cardItemLabel}>{coordEditGroup === 'new' ? t('coordinator.newGroup') : t('coordinator.editGroup', { name: coordEditGroup })}</span>
          </div>
          <div style={{ padding: '0 22px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <label className={styles.field}>
              <span className={styles.label}>{t('coordinator.groupLabel')}</span>
              {coordEditGroup === 'new' ? (
                coordManualId ? (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input className={styles.input} placeholder="oc_xxxxxx" onChange={(e) => { newGroupIdRef.current = e.target.value; }} />
                    <button className={`${styles.btn} ${styles.btnSmall} ${styles.btnOutline}`} onClick={() => setCoordManualId(false)}>{t('coordinator.selectFromList')}</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <select className={styles.input} onChange={async (e) => {
                      newGroupIdRef.current = e.target.value;
                      setSelectedGroupBots([]);
                      if (e.target.value) {
                        try {
                          const r = await fetch(`/api/coordinator/discovered-groups/${encodeURIComponent(e.target.value)}/bots`, { headers: { Authorization: `Bearer ${token}` } });
                          if (r.ok) { const d = await r.json(); setSelectedGroupBots(d.bots || []); }
                        } catch {}
                      }
                    }} defaultValue="">
                      <option value="" disabled>{t('coordinator.selectDiscoveredGroup')}</option>
                      {discoveredGroups
                        .filter((g) => !usedGroupIds.includes(g.chatId))
                        .map((g) => <option key={g.chatId} value={g.chatId}>{g.chatName ? `${g.chatName} (${g.chatId})` : g.chatId}</option>)}
                    </select>
                    <button className={`${styles.btn} ${styles.btnSmall} ${styles.btnOutline}`} onClick={() => setCoordManualId(true)}>{t('coordinator.manualInput')}</button>
                  </div>
                )
              ) : (
                <input className={styles.input} value={(() => { const d = discoveredGroups.find((g) => g.chatId === coordEditGroup); return d?.chatName ? `${d.chatName} (${coordEditGroup})` : coordEditGroup; })()} readOnly style={{ opacity: 0.7 }} />
              )}
            </label>

            <label className={styles.field}>
              <span className={styles.label}>{t('coordinator.groupNameLabel')}</span>
              <input className={styles.input} value={coordEditName} placeholder={t('coordinator.groupNamePlaceholder')} onChange={(e) => setCoordEditName(e.target.value)} />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>{t('coordinator.coordinatorLabel')}</span>
              <select className={styles.input} value={coordEditBot} onChange={(e) => setCoordEditBot(e.target.value)}>
                <option value="">{t('coordinator.selectFeishuBot')}</option>
                {feishuBots.map((b) => <option key={b.name} value={b.name}>{b.name}</option>)}
              </select>
            </label>

            <div className={styles.field}>
              <span className={styles.label}>{t('coordinator.teamMembersLabel')}</span>
              {selectedTeamMembers.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                  {selectedTeamMembers.map((name) => (
                    <span key={name}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '16px', background: 'var(--accent-softer)', color: 'var(--accent)', fontSize: '13px', cursor: 'pointer' }}
                      onClick={() => setSelectedTeamMembers((prev) => prev.filter((n) => n !== name))} title={t('coordinator.clickToRemove')}
                    >{name} <span style={{ opacity: 0.6 }}>✕</span></span>
                  ))}
                </div>
              )}
              {availableTeamMembers.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {availableTeamMembers.map((b) => (
                    <span key={b.name}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '16px', background: 'var(--glass-border)', color: 'var(--text-2)', fontSize: '13px', cursor: 'pointer', transition: 'background 0.15s' }}
                      onClick={() => setSelectedTeamMembers((prev) => [...prev, b.name])}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent-softer)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--glass-border)'; }}
                    >＋ {b.name}</span>
                  ))}
                </div>
              ) : (
                <span style={{ color: 'var(--text-3)', fontSize: '13px' }}>{t('coordinator.allWorkersAdded')}</span>
              )}
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button className={`${styles.btn} ${styles.btnAccent}`}
                onClick={() => {
                  const gid = coordEditGroup === 'new' ? newGroupIdRef.current : coordEditGroup;
                  if (!gid) return;
                  saveCoordConfig(gid, coordEditName, coordEditBot, selectedTeamMembers);
                }}
                disabled={!coordEditBot || (coordEditGroup === 'new' && !newGroupIdRef.current)}
              >{t('coordinator.save')}</button>
              <button className={`${styles.btn} ${styles.btnOutline}`} onClick={() => { setCoordEditGroup(''); setSelectedTeamMembers([]); }}>{t('coordinator.cancel')}</button>
            </div>
          </div>
        </div>
      )}

      {coordLoading ? (
        <div className={styles.card}><div className={styles.cardItem}><span className={styles.cardItemDesc}>{t('coordinator.loading')}</span></div></div>
      ) : coordConfigs.length === 0 ? (
        <div className={styles.card} style={{ padding: '24px 22px', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-2)', marginBottom: '12px' }}>{t('coordinator.noConfigs')}</p>
          {discoveredGroups.length > 0 ? (
            <p style={{ color: 'var(--text-3)', fontSize: '13px' }}>{t('coordinator.discoveredCount', { count: discoveredGroups.length })}</p>
          ) : (
            <div style={{ color: 'var(--text-3)', fontSize: '13px', lineHeight: '1.8', textAlign: 'left', maxWidth: 360, margin: '0 auto' }}>
              <p style={{ marginBottom: 8 }}>{t('coordinator.usageTitle')}</p>
              <ol style={{ paddingLeft: 20, margin: 0 }}>
                <li>{t('coordinator.usageStep1')}</li>
                <li>{t('coordinator.usageStep2')}</li>
                <li>{t('coordinator.usageStep3')}</li>
                <li>{t('coordinator.usageStep4')}</li>
              </ol>
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {coordConfigs.map((cfg) => {
            const discovered = discoveredGroups.find((g) => g.chatId === cfg.groupId);
            const displayName = cfg.groupName || discovered?.chatName || cfg.groupId;
            return (
              <div key={cfg.id} className={styles.card} style={{ padding: '16px 22px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text-1)' }}>{displayName}</div>
                    {(cfg.groupName || discovered?.chatName) && <div style={{ color: 'var(--text-3)', fontSize: '12px', marginTop: '2px' }}>ID: {cfg.groupId}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button className={`${styles.btn} ${styles.btnSmall} ${styles.btnOutline}`} onClick={async () => {
                      setCoordEditGroup(cfg.groupId); setCoordEditBot(cfg.coordinatorBot); setSelectedTeamMembers([...cfg.teamMembers]); setCoordEditName(cfg.groupName);
                      try {
                        const r = await fetch(`/api/coordinator/discovered-groups/${encodeURIComponent(cfg.groupId)}/bots`, { headers: { Authorization: `Bearer ${token}` } });
                        if (r.ok) { const d = await r.json(); setSelectedGroupBots(d.bots || []); }
                      } catch { setSelectedGroupBots([]); }
                    }}>{t('coordinator.edit')}</button>
                    <button className={`${styles.btn} ${styles.btnSmall} ${styles.btnDanger}`} onClick={() => deleteCoordConfig(cfg.groupId)}>{t('coordinator.delete')}</button>
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>{t('coordinator.coordinatorColon')}</span>
                  <span style={{ padding: '2px 8px', borderRadius: '12px', background: 'var(--accent-softer)', color: 'var(--accent)', fontSize: '12px' }}>{cfg.coordinatorBot || t('coordinator.notSet')}</span>
                  {cfg.teamMembers.length > 0 && (
                    <>
                      <span style={{ fontSize: '12px', color: 'var(--text-3)', marginLeft: '6px' }}>{t('coordinator.teamColon')}</span>
                      {cfg.teamMembers.map((m) => (
                        <span key={m} style={{ padding: '2px 8px', borderRadius: '12px', background: 'var(--glass-border)', color: 'var(--text-2)', fontSize: '12px' }}>{m}</span>
                      ))}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
