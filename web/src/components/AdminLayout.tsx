import { type ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { SIDEBAR_GROUPS } from '../routes';
import { useCommandPalette } from '../store/command-palette';
import { CommandPalette } from './CommandPalette';
import s from './AdminLayout.module.css';

interface Props {
  children: ReactNode;
}

export function AdminLayout({ children }: Props) {
  const toggleCommandPalette = useCommandPalette((s) => s.toggle);

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
      <aside className={s.sidebar}>
        <Sidebar groups={SIDEBAR_GROUPS} />
      </aside>
      <main className={s.main}>{children}</main>
      <CommandPalette />
    </div>
  );
}
