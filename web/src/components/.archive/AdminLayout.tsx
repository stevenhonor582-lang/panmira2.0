import { type ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { SIDEBAR_GROUPS } from '../routes';
import { useCommandPalette } from '../store/command-palette';
import { useStore } from '../store';
import { CommandPalette } from './CommandPalette';
import s from './AdminLayout.module.css';

interface Props {
  children: ReactNode;
}

export function AdminLayout({ children }: Props) {
  const toggleCommandPalette = useCommandPalette((s) => s.toggle);
  const currentUser = useStore((s) => s.currentUser);
  const logout = useStore((s) => s.logout);

  const isAdmin = !currentUser || currentUser.role === 'admin' || currentUser.role === undefined;

  return (
    <div className={s.shell}>
      <header className={s.topbar}>
        <div className={s.brand}>Panmira</div>
        <button
          className={s.cmdTrigger}
          onClick={toggleCommandPalette}
          aria-label="打开命令面板"
        >
          <kbd>⌘K</kbd>
          <span>搜索/跳转</span>
        </button>
      </header>
      {!isAdmin && (
        <div className={s.authBanner} data-testid="auth-banner">
          <strong>⚠ 当前账号无 admin 权限</strong>
          <span>请用 admin 账号(邮箱密码)登录后再访问管理后台。</span>
          <button onClick={logout}>退出重新登录</button>
        </div>
      )}
      <aside className={s.sidebar}>
        <Sidebar groups={SIDEBAR_GROUPS} />
      </aside>
      <main className={s.main}>{children}</main>
      <CommandPalette />
    </div>
  );
}
