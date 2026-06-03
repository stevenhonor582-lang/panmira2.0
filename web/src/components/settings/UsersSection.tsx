import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../../store';
import type { CurrentUser } from '../../store';
import { SensitiveField } from '../SensitiveField';
import styles from '../SettingsView.module.css';

interface UserItem {
  id: string; email: string | null; name: string;
  role: 'admin' | 'member'; isActive: boolean;
}

export function UsersSection() {
  const { t } = useTranslation();
  const token = useStore((s) => s.token);
  const currentUser = useStore((s) => s.currentUser) as CurrentUser | null;

  const [userList, setUserList] = useState<UserItem[]>([]);
  const [userLoading, setUserLoading] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  // Add user
  const [showAddUser, setShowAddUser] = useState(false);
  const [addUserEmail, setAddUserEmail] = useState('');
  const [addUserName, setAddUserName] = useState('');
  const [addUserPassword, setAddUserPassword] = useState('');
  const [addUserConfirm, setAddUserConfirm] = useState('');
  const [addUserLoading, setAddUserLoading] = useState(false);
  const [addUserError, setAddUserError] = useState('');

  // Password change
  const [showPwPanel, setShowPwPanel] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pwLoading, setPwLoading] = useState(false);

  const fetchUsers = useCallback(async () => {
    setUserLoading(true);
    try {
      const res = await fetch('/api/auth/users', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { const d = await res.json(); setUserList(d.users || []); }
    } catch { setUserList([]); }
    setUserLoading(false);
  }, [token]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const toggleUserRole = async (id: string) => {
    const res = await fetch(`/api/auth/users/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: 'toggleRole' }),
    });
    if (res.ok) { const d = await res.json(); setUserList((prev) => prev.map((u) => (u.id === id ? d.user : u))); }
  };

  const toggleUserActive = async (id: string) => {
    const res = await fetch(`/api/auth/users/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: 'toggleActive' }),
    });
    if (res.ok) { const d = await res.json(); setUserList((prev) => prev.map((u) => (u.id === id ? d.user : u))); }
  };

  const handleAddUser = useCallback(async () => {
    if (!addUserEmail.trim() || !addUserPassword.trim()) { setAddUserError(t('users.emailPasswordRequired')); return; }
    if (addUserPassword.length < 6) { setAddUserError(t('users.passwordMinLength')); return; }
    if (addUserPassword !== addUserConfirm) { setAddUserError(t('users.passwordMismatch')); return; }
    setAddUserLoading(true); setAddUserError('');
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: addUserEmail.trim(), password: addUserPassword, name: addUserName.trim() || undefined }),
      });
      const d = await res.json();
      if (!res.ok) { setAddUserError(d.error || t('users.addFailed')); } else {
        setShowAddUser(false); setAddUserEmail(''); setAddUserName(''); setAddUserPassword(''); setAddUserConfirm('');
        fetchUsers();
      }
    } catch { setAddUserError(t('users.networkError')); }
    setAddUserLoading(false);
  }, [addUserEmail, addUserName, addUserPassword, addUserConfirm, token, fetchUsers]);

  const handleDeleteUser = useCallback(async (id: string) => {
    const res = await fetch(`/api/auth/users/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) { setUserList((prev) => prev.filter((u) => u.id !== id)); }
  }, [token]);

  const resetPwForm = useCallback(() => {
    setShowPwPanel(false); setNewPassword(''); setConfirmPassword(''); setPwMsg(null);
  }, []);

  const handleChangePassword = useCallback(async () => {
    setPwMsg(null);
    if (!newPassword) { setPwMsg({ ok: false, text: t('users.enterNewPassword') }); return; }
    if (newPassword.length < 6) { setPwMsg({ ok: false, text: t('users.passwordMinLength') }); return; }
    if (newPassword !== confirmPassword) { setPwMsg({ ok: false, text: t('users.passwordMismatch') }); return; }
    setPwLoading(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ oldPassword: '', newPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        setPwMsg({ ok: true, text: t('users.passwordChangeSuccess') });
        setTimeout(() => resetPwForm(), 1500);
      } else {
        setPwMsg({ ok: false, text: data.error || t('users.passwordChangeFailed') });
      }
    } catch {
      setPwMsg({ ok: false, text: t('users.networkError') });
    } finally {
      setPwLoading(false);
    }
  }, [token, newPassword, confirmPassword, resetPwForm]);

  // ─── Detail view ───
  const selectedUser = userList.find((u) => u.id === selectedUserId);
  if (selectedUser) {
    const isSelf = selectedUser.id === currentUser?.id;
    const isAdmin = currentUser?.role === 'admin';
    return (
      <>
        <button className={`${styles.btn} ${styles.btnSmall} ${styles.btnOutline}`} style={{ marginBottom: 12 }} onClick={() => setSelectedUserId(null)}>{t('users.backToList')}</button>

        <div style={{
          background: 'var(--glass-bg, rgba(255,255,255,0.04))',
          border: '1px solid var(--glass-border, rgba(255,255,255,0.08))',
          borderRadius: 16, padding: '24px 28px', marginBottom: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%',
              background: selectedUser.role === 'admin' ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'linear-gradient(135deg, #10b981, #34d399)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 20, fontWeight: 700, flexShrink: 0,
            }}>
              {selectedUser.name.charAt(0).toUpperCase()}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-0, #fff)' }}>{selectedUser.name}</span>
                <span className={styles.roleBadge}>{selectedUser.role === 'admin' ? t('users.admin') : t('users.member')}</span>
                <span className={styles.typeTag} style={{
                  background: selectedUser.isActive ? 'var(--accent-softer)' : 'var(--glass-border)',
                  color: selectedUser.isActive ? 'var(--accent)' : 'var(--text-3)',
                }}>{selectedUser.isActive ? t('users.active') : t('users.disabled')}</span>
                <button className={`${styles.btn} ${styles.btnSmall} ${styles.btnOutline}`}
                  style={{ fontSize: 12, padding: '2px 10px', marginLeft: 'auto' }}
                  onClick={() => { setNewPassword(''); setConfirmPassword(''); setPwMsg(null); setShowPwPanel(true); }}>
                  {t('users.changePassword')}
                </button>
              </div>
              <span style={{ fontSize: 13, color: 'var(--text-2, #888)' }}>{selectedUser.email || t('users.emailNotSet')}</span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px 0', fontSize: 13, color: 'var(--text-1)', marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <span style={{ color: 'var(--text-3)', width: 48, flexShrink: 0 }}>ID</span>
              <span style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{selectedUser.id}</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <span style={{ color: 'var(--text-3)', width: 48, flexShrink: 0 }}>{t('users.emailLabel')}</span>
              <span>{selectedUser.email || '-'}</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <span style={{ color: 'var(--text-3)', width: 48, flexShrink: 0 }}>{t('users.roleLabel')}</span>
              <span>{selectedUser.role === 'admin' ? t('users.adminRole') : t('users.memberRole')}</span>
            </div>
          </div>

          {!isSelf && isAdmin && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, borderTop: '1px solid var(--glass-border, rgba(255,255,255,0.08))', paddingTop: 14 }}>
              <button className={`${styles.btn} ${styles.btnOutline}`} onClick={async () => { await toggleUserRole(selectedUser.id); fetchUsers(); }}>{t('users.toggleRole')}</button>
              <button className={`${styles.btn} ${styles.btnOutline}`} onClick={async () => { await toggleUserActive(selectedUser.id); fetchUsers(); }}>
                {selectedUser.isActive ? t('users.disableAccount') : t('users.enableAccount')}
              </button>
              <button className={`${styles.btn} ${styles.btnDanger}`} onClick={() => { if (confirm(`${t('users.deleteConfirm', { name: selectedUser.name })}`)) { handleDeleteUser(selectedUser.id); setSelectedUserId(null); } }}>{t('users.deleteUser')}</button>
            </div>
          )}
        </div>

        {showPwPanel && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', zIndex: 100,
          }} onClick={() => resetPwForm()}>
            <div style={{
              background: 'var(--bg-1, #1a1a2e)', border: '1px solid var(--glass-border)',
              borderRadius: 16, padding: '24px 28px', width: 380, maxWidth: '90vw',
            }} onClick={(e) => e.stopPropagation()}>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-0)', marginBottom: 16 }}>{t('users.changePassword')}</div>
              {pwMsg && <div style={{ fontSize: 13, marginBottom: 12, color: pwMsg.ok ? 'var(--accent)' : 'var(--danger, #ef4444)' }}>{pwMsg.text}</div>}
              <label className={styles.field}>
                <span className={styles.label}>{t('users.newPasswordLabel')}</span>
                <SensitiveField value={newPassword} onChange={setNewPassword} placeholder={t('users.newPasswordPlaceholder')} hideCopy />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>{t('users.confirmNewPasswordLabel')}</span>
                <SensitiveField value={confirmPassword} onChange={setConfirmPassword} placeholder={t('users.confirmNewPasswordPlaceholder')} hideCopy />
              </label>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                <button className={`${styles.btn} ${styles.btnOutline}`} onClick={resetPwForm}>{t('users.cancel')}</button>
                <button className={`${styles.btn} ${styles.btnAccent}`} onClick={handleChangePassword} disabled={pwLoading}>{pwLoading ? t('users.submitting') : t('users.confirm')}</button>
              </div>
            </div>
          </div>
        )}

        {isSelf && isAdmin && token && !token.startsWith('eyJ') && (
          <div style={{
            background: 'var(--glass-bg, rgba(255,255,255,0.04))',
            border: '1px solid var(--glass-border, rgba(255,255,255,0.08))',
            borderRadius: 16, padding: '20px 28px',
          }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-0)', marginBottom: 6 }}>{t('users.loginToken')}</div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 12 }}>{t('users.loginTokenDesc')}</div>
            <SensitiveField value={token} />
          </div>
        )}
      </>
    );
  }

  // ─── List view ───
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <h2 className={styles.contentTitle} style={{ margin: 0 }}>{t('users.title')}</h2>
        {currentUser?.role === 'admin' && (
          <button className={`${styles.btn} ${styles.btnAccent}`} onClick={() => setShowAddUser(!showAddUser)}>
            {showAddUser ? t('users.cancel') : t('users.addUser')}
          </button>
        )}
      </div>
      <p className={styles.contentDesc}>{t('users.clickToView')}</p>

      {showAddUser && (
        <div className={styles.card} style={{ marginBottom: '12px' }}>
          <div className={styles.cardItem}><span className={styles.cardItemLabel}>{t('users.newUser')}</span></div>
          <div style={{ padding: '0 22px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <label className={styles.field}>
              <span className={styles.label}>{t('users.emailLabel')}</span>
              <input className={styles.input} placeholder="user@panmira.com" value={addUserEmail} onChange={(e) => setAddUserEmail(e.target.value)} />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>{t('users.usernameLabel')}</span>
              <input className={styles.input} placeholder={t('users.usernamePlaceholder')} value={addUserName} onChange={(e) => setAddUserName(e.target.value)} />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>{t('users.passwordLabel')}</span>
              <SensitiveField value={addUserPassword} onChange={setAddUserPassword} placeholder={t('users.passwordPlaceholder')} hideCopy />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>{t('users.confirmPasswordLabel')}</span>
              <SensitiveField value={addUserConfirm} onChange={setAddUserConfirm} placeholder={t('users.confirmPasswordPlaceholder')} hideCopy />
            </label>
            {addUserError && <span style={{ color: 'var(--danger, #ef4444)', fontSize: 13 }}>{addUserError}</span>}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className={`${styles.btn} ${styles.btnAccent}`} onClick={handleAddUser} disabled={addUserLoading}>{addUserLoading ? t('users.saving') : t('users.save')}</button>
              <button className={`${styles.btn} ${styles.btnOutline}`} onClick={() => { setShowAddUser(false); setAddUserError(''); }}>{t('users.cancel')}</button>
            </div>
          </div>
        </div>
      )}

      {userLoading ? (
        <div className={styles.card}><div className={styles.cardItem}><span className={styles.cardItemDesc}>{t('users.loading')}</span></div></div>
      ) : userList.length === 0 ? (
        <div className={styles.card}><div className={styles.cardItem}><span className={styles.cardItemDesc}>{t('users.noUsers')}</span></div></div>
      ) : (
        <div className={styles.card}>
          {userList.map((u) => (
            <div key={u.id} className={styles.cardItem} style={{ cursor: 'pointer' }} onClick={() => setSelectedUserId(u.id)}>
              <div className={styles.cardItemLeft}>
                <span className={styles.cardItemLabel}>
                  {u.name}
                  <span className={styles.typeTag}>{u.role === 'admin' ? t('users.admin') : t('users.member')}</span>
                  <span className={styles.typeTag} style={{ background: u.isActive ? 'var(--accent-softer)' : 'var(--glass-border)', color: u.isActive ? 'var(--accent)' : 'var(--text-3)' }}>
                    {u.isActive ? t('users.active') : t('users.disabled')}
                  </span>
                </span>
                <span className={styles.cardItemDesc}>{u.email || '-'}</span>
              </div>
              <span style={{ color: 'var(--text-3)', fontSize: 12 }}>→</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
