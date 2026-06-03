import { useState, useEffect, useCallback } from 'react';
import { SlideOverPanel } from '../SlideOverPanel';
import type { PermissionConfig, AllowedUser } from '../../types';
import styles from '../SettingsView.module.css';

interface BotPermissionsPanelProps {
  open: boolean;
  onClose: () => void;
  botName: string;
  permissions: PermissionConfig | undefined;
  onSave: (permissions: PermissionConfig) => Promise<void>;
}

const ROLE_LABELS: Record<string, string> = {
  viewer: 'viewer — 只能查看知识库',
  operator: 'operator — 可搜索和运行安全命令',
  editor: 'editor — 可写文件和命令行',
  admin: 'admin — 全部权限',
};

export function BotPermissionsPanel({
  open,
  onClose,
  botName,
  permissions: initialPermissions,
  onSave,
}: BotPermissionsPanelProps) {
  const [perms, setPerms] = useState<PermissionConfig>(initialPermissions || {});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUserId, setNewUserId] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserRole, setNewUserRole] = useState('editor');

  useEffect(() => {
    if (open) {
      setPerms(initialPermissions || {});
      setError('');
    }
  }, [open, initialPermissions]);

  const updatePerms = useCallback((fn: (p: PermissionConfig) => PermissionConfig) => {
    setPerms((prev) => fn({ ...prev }));
  }, []);

  const handleSave = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const clean = JSON.parse(JSON.stringify(perms));
      if (clean.accessControl?.allowedUsers?.length === 0) {
        delete clean.accessControl.allowedUsers;
      }
      await onSave(clean);
      onClose();
    } catch (err: any) {
      setError(err.message || '保存失败');
    } finally {
      setLoading(false);
    }
  }, [perms, onSave, onClose]);

  const addUser = useCallback(() => {
    if (!newUserId.trim()) return;
    const user: AllowedUser = {
      userId: newUserId.trim(),
      name: newUserName.trim() || undefined,
      role: newUserRole as AllowedUser['role'],
    };
    updatePerms((p) => ({
      ...p,
      accessControl: {
        ...p.accessControl,
        mode: p.accessControl?.mode || 'allowlist',
        allowedUsers: [...(p.accessControl?.allowedUsers || []), user],
      },
    }));
    setNewUserId('');
    setNewUserName('');
    setNewUserRole('editor');
    setShowAddUser(false);
  }, [newUserId, newUserName, newUserRole, updatePerms]);

  const removeUser = useCallback((userId: string) => {
    updatePerms((p) => ({
      ...p,
      accessControl: {
        ...p.accessControl,
        allowedUsers: (p.accessControl?.allowedUsers || []).filter((u) => u.userId !== userId),
      },
    }));
  }, [updatePerms]);

  const updateUserRole = useCallback((userId: string, role: string) => {
    updatePerms((p) => ({
      ...p,
      accessControl: {
        ...p.accessControl,
        allowedUsers: (p.accessControl?.allowedUsers || []).map((u) =>
          u.userId === userId ? { ...u, role: role as AllowedUser['role'] } : u,
        ),
      },
    }));
  }, [updatePerms]);

  return (
    <SlideOverPanel open={open} onClose={onClose} title={`权限配置: ${botName}`} width={520}>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginBottom: 16 }}>
        <button className={`${styles.btn} ${styles.btnOutline}`} onClick={onClose}>取消</button>
        <button className={`${styles.btn} ${styles.btnAccent}`} onClick={handleSave} disabled={loading}>
          {loading ? '保存中...' : '保存'}
        </button>
      </div>
      {error && <div className={styles.msgErr} style={{ marginBottom: 14 }}>{error}</div>}

      {/* Access Control */}
      <div className={styles.formSection}>
        <h3 className={styles.formSectionTitle}>访问控制</h3>

        <label className={styles.field}>
          <span className={styles.label}>访问模式</span>
          <select
            className={styles.input}
            value={perms.accessControl?.mode || 'all'}
            onChange={(e) =>
              updatePerms((p) => ({
                ...p,
                accessControl: { ...p.accessControl, mode: e.target.value as 'all' | 'allowlist' },
              }))
            }
          >
            <option value="all">所有人可用</option>
            <option value="allowlist">仅白名单用户</option>
          </select>
        </label>

        <label className={styles.field}>
          <span className={styles.label}>默认角色（不在白名单中的用户）</span>
          <select
            className={styles.input}
            value={perms.defaultRole || 'editor'}
            onChange={(e) =>
              updatePerms((p) => ({ ...p, defaultRole: e.target.value as PermissionConfig['defaultRole'] }))
            }
          >
            {Object.entries(ROLE_LABELS).map(([role, label]) => (
              <option key={role} value={role}>{label}</option>
            ))}
          </select>
        </label>

        {/* User Allowlist */}
        <div style={{ marginTop: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span className={styles.label}>白名单用户</span>
            <button
              className={`${styles.btn} ${styles.btnSmall} ${styles.btnAccent}`}
              onClick={() => setShowAddUser(true)}
            >
              + 添加
            </button>
          </div>

          {(perms.accessControl?.allowedUsers || []).length === 0 ? (
            <div className={styles.formHint}>
              {perms.accessControl?.mode === 'allowlist'
                ? '尚未添加任何用户，切换为白名单模式后将无人能访问此机器人'
                : '未添加白名单用户'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {(perms.accessControl?.allowedUsers || []).map((user) => (
                <div
                  key={user.userId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 8px',
                    background: 'var(--bg-2)',
                    borderRadius: 6,
                    fontSize: 13,
                  }}
                >
                  <span style={{ flex: 1, fontFamily: 'monospace', fontSize: 12 }} title={user.userId}>
                    {user.userId.slice(0, 20)}...
                  </span>
                  <span style={{ color: 'var(--text-2)', minWidth: 40 }}>{user.name || '-'}</span>
                  <select
                    value={user.role}
                    onChange={(e) => updateUserRole(user.userId, e.target.value)}
                    style={{
                      background: 'var(--bg-1)',
                      border: '1px solid var(--border)',
                      borderRadius: 4,
                      color: 'var(--text-1)',
                      padding: '2px 4px',
                      fontSize: 12,
                    }}
                  >
                    <option value="viewer">viewer</option>
                    <option value="operator">operator</option>
                    <option value="editor">editor</option>
                    <option value="admin">admin</option>
                  </select>
                  <button
                    onClick={() => removeUser(user.userId)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-3)',
                      cursor: 'pointer',
                      fontSize: 14,
                      padding: '0 4px',
                    }}
                    title="移除"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add User Inline Form */}
          {showAddUser && (
            <div
              style={{
                marginTop: 8,
                padding: 10,
                background: 'var(--bg-2)',
                borderRadius: 8,
                border: '1px solid var(--border)',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <input
                className={styles.input}
                placeholder="飞书用户 open_id (如 ou_xxx...)"
                value={newUserId}
                onChange={(e) => setNewUserId(e.target.value)}
                autoFocus
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className={styles.input}
                  placeholder="姓名（备注）"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  style={{ flex: 1 }}
                />
                <select
                  className={styles.input}
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value)}
                  style={{ width: 100 }}
                >
                  <option value="viewer">viewer</option>
                  <option value="operator">operator</option>
                  <option value="editor">editor</option>
                  <option value="admin">admin</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className={`${styles.btn} ${styles.btnSmall} ${styles.btnOutline}`} onClick={() => setShowAddUser(false)}>
                  取消
                </button>
                <button className={`${styles.btn} ${styles.btnSmall} ${styles.btnAccent}`} onClick={addUser}>
                  添加
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bash Safety */}
      <div className={styles.formSection}>
        <h3 className={styles.formSectionTitle}>命令安全</h3>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, cursor: 'pointer', fontSize: 13 }}>
          <input
            type="checkbox"
            checked={perms.bashSafety?.blockGitPush !== false}
            onChange={(e) =>
              updatePerms((p) => ({ ...p, bashSafety: { ...p.bashSafety, blockGitPush: e.target.checked } }))
            }
          />
          禁止 git push
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, cursor: 'pointer', fontSize: 13 }}>
          <input
            type="checkbox"
            checked={perms.bashSafety?.blockPackageInstall !== false}
            onChange={(e) =>
              updatePerms((p) => ({ ...p, bashSafety: { ...p.bashSafety, blockPackageInstall: e.target.checked } }))
            }
          />
          禁止安装软件包 (npm/pip/apt)
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
          <input
            type="checkbox"
            checked={perms.bashSafety?.blockNetworkOps === true}
            onChange={(e) =>
              updatePerms((p) => ({ ...p, bashSafety: { ...p.bashSafety, blockNetworkOps: e.target.checked } }))
            }
          />
          禁止网络操作 (curl/wget/ssh)
        </label>
      </div>

      {/* File System Protection */}
      <div className={styles.formSection}>
        <h3 className={styles.formSectionTitle}>文件保护</h3>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, cursor: 'pointer', fontSize: 13 }}>
          <input
            type="checkbox"
            checked={perms.fileSystem?.protectSkills !== false}
            onChange={(e) =>
              updatePerms((p) => ({ ...p, fileSystem: { ...p.fileSystem, protectSkills: e.target.checked } }))
            }
          />
          保护技能文件 (禁止修改 ~/.claude/skills/)
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
          <input
            type="checkbox"
            checked={perms.fileSystem?.protectConfig !== false}
            onChange={(e) =>
              updatePerms((p) => ({ ...p, fileSystem: { ...p.fileSystem, protectConfig: e.target.checked } }))
            }
          />
          保护系统配置 (禁止修改 metabot 源码)
        </label>
        <div className={styles.formHint} style={{ marginTop: 6 }}>
          此外，始终禁止: sudo、rm -rf /、chmod 777、dd、mkfs 等危险命令，以及写入 /etc/ 和 ~/metabot/src/ 等系统路径。
        </div>
      </div>
    </SlideOverPanel>
  );
}
