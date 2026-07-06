# Panmira Plan H1 · 前端 IA 重构 + ⌘K 命令面板

> **Goal:** 把 panmira-web 从"7 个零散路由"重构为 spec § 14 的"12 流程页 + 3 横切页"结构,并实现 ⌘K 命令面板。

**Architecture:**
- 路由前缀统一 `/app/*`,保留 `/login` 顶层
- 侧栏分 4 组:工作台 / 资源 / 配置 / 管理
- ⌘K 全局快捷键打开命令面板,支持跳转 / 搜索 / 键盘导航
- 不破坏现有 7 个组件(ChatView/MemoryView/VoiceView/SettingsView/DashboardView/TeamWorkspace/LoginPage)

**Tech Stack:**
- React 19 + React Router 7 (BrowserRouter basename /web)
- Vite 6 + TypeScript 5.8
- Zustand(已有 store)
- i18next(zh + en)
- vitest + @testing-library/react(本 plan 新增前端测试基线)

## 全局约束

- i18n 走 zh.json + en.json,禁止硬编码
- 命令面板状态走 zustand,不用 Context
- 不要破坏现有 7 个组件,只调路由挂载点
- 暗/亮双主题支持(spec § 14.7)
- worktree 路径:/home/ubuntu/panmira-H1,branch: feat/plan-H1-ia-refactor

---

## Task 1: 路由重构 + 侧栏分组 (H1.1)

### Step 1: 安装 vitest + testing-library

```bash
cd /home/ubuntu/panmira-H1/web
pnpm add -D vitest @vitest/ui @testing-library/react @testing-library/dom @testing-library/user-event jsdom @testing-library/jest-dom 2>&1 | tail -5
```
失败则用 npm:
```bash
npm install -D vitest @vitest/ui @testing-library/react @testing-library/dom @testing-library/user-event jsdom @testing-library/jest-dom 2>&1 | tail -5
```

### Step 2: 配置 vitest

Create `web/vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': resolve(__dirname, './src') },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
});
```

Create `web/src/__tests__/setup.ts`:
```typescript
import '@testing-library/jest-dom/vitest';
```

Modify `web/package.json` scripts,加 `test` 和 `test:watch`:
```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

### Step 3: 写 Sidebar 测试(红灯)

Create `web/src/components/__tests__/Sidebar.test.tsx`:
```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from '../Sidebar';

describe('Sidebar', () => {
  const groups = [
    {
      label: '工作台',
      items: [
        { to: '/app', label: '总览' },
        { to: '/app/status', label: '实时状态' },
      ],
    },
    {
      label: '资源',
      items: [
        { to: '/app/models', label: '模型池' },
        { to: '/app/knowledge', label: '数智底座' },
        { to: '/app/resources', label: 'Skill / MCP 池' },
      ],
    },
  ];

  it('renders all group labels', () => {
    render(<MemoryRouter><Sidebar groups={groups} /></MemoryRouter>);
    expect(screen.getByText('工作台')).toBeInTheDocument();
    expect(screen.getByText('资源')).toBeInTheDocument();
  });

  it('renders all item labels', () => {
    render(<MemoryRouter><Sidebar groups={groups} /></MemoryRouter>);
    expect(screen.getByText('总览')).toBeInTheDocument();
    expect(screen.getByText('模型池')).toBeInTheDocument();
    expect(screen.getByText('数智底座')).toBeInTheDocument();
  });

  it('renders links with correct href', () => {
    render(<MemoryRouter><Sidebar groups={groups} /></MemoryRouter>);
    const dashboardLink = screen.getByText('总览').closest('a');
    expect(dashboardLink).toHaveAttribute('href', '/app');
  });

  it('highlights active route with aria-current', () => {
    render(<MemoryRouter initialEntries={['/app/models']}><Sidebar groups={groups} /></MemoryRouter>);
    const activeLink = screen.getByText('模型池').closest('a');
    expect(activeLink).toHaveAttribute('aria-current', 'page');
  });
});
```

### Step 4: 运行测试(确认红灯)

```bash
cd /home/ubuntu/panmira-H1/web && pnpm test 2>&1 | tail -10
```
Expected: FAIL — Sidebar module not found

### Step 5: 实现 Sidebar 组件

Create `web/src/components/Sidebar.tsx`:
```typescript
import { NavLink } from 'react-router-dom';

export interface SidebarItem {
  to: string;
  label: string;
  icon?: string;
}

export interface SidebarGroup {
  label: string;
  items: SidebarItem[];
}

interface Props {
  groups: SidebarGroup[];
  onNavigate?: () => void;
}

export function Sidebar({ groups, onNavigate }: Props) {
  return (
    <nav className="sidebar" aria-label="主导航">
      {groups.map((group) => (
        <div key={group.label} className="sidebar-group">
          <div className="sidebar-group-label">{group.label}</div>
          <ul className="sidebar-list">
            {group.items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === '/app'}
                  className={({ isActive }) =>
                    isActive ? 'sidebar-link active' : 'sidebar-link'
                  }
                  onClick={onNavigate}
                >
                  {item.icon && <span className="sidebar-icon">{item.icon}</span>}
                  <span>{item.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
```

Create `web/src/components/Sidebar.module.css`:
```css
.sidebar {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding: 1rem 0.5rem;
}
.sidebar-group-label {
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-tertiary, #888);
  padding: 0 0.75rem 0.5rem;
}
.sidebar-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}
.sidebar-link {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  color: var(--text-secondary, #aaa);
  text-decoration: none;
  font-size: 0.875rem;
  transition: background-color 120ms ease, color 120ms ease;
}
.sidebar-link:hover {
  background-color: var(--bg-hover, rgba(255, 255, 255, 0.04));
  color: var(--text-primary, #f0f0f2);
}
.sidebar-link.active {
  background-color: var(--bg-active, rgba(99, 102, 241, 0.15));
  color: var(--text-primary, #f0f0f2);
  font-weight: 500;
}
.sidebar-icon {
  font-size: 1rem;
  width: 1.25rem;
  text-align: center;
}
```

### Step 6: 运行测试(确认绿灯)

```bash
cd /home/ubuntu/panmira-H1/web && pnpm test 2>&1 | tail -10
```
Expected: 4 tests PASS

### Step 7: 定义路由分组数据

Create `web/src/routes.ts`:
```typescript
import type { SidebarGroup } from './components/Sidebar';

export const SIDEBAR_GROUPS: SidebarGroup[] = [
  {
    label: '工作台',
    items: [
      { to: '/app', label: '总览' },
      { to: '/app/status', label: '实时状态' },
      { to: '/app/alerts', label: '预警中心' },
    ],
  },
  {
    label: '资源',
    items: [
      { to: '/app/models', label: '模型池' },
      { to: '/app/knowledge', label: '数智底座' },
      { to: '/app/resources', label: 'Skill / MCP 池' },
    ],
  },
  {
    label: '配置',
    items: [
      { to: '/app/agents', label: 'Agent 列表' },
      { to: '/app/channels', label: 'Channel 接入' },
      { to: '/app/permissions', label: '权限配置' },
    ],
  },
  {
    label: '管理',
    items: [
      { to: '/app/reports', label: '资源报表' },
      { to: '/app/cost', label: '成本分析' },
      { to: '/app/oauth-clients', label: 'OAuth Client' },
      { to: '/app/settings', label: '系统设置' },
      { to: '/app/audit', label: '审计日志' },
    ],
  },
];
```

### Step 8: 重构 App.tsx 路由

Modify `web/src/App.tsx` — 替换 import + 路由块:

```typescript
import { useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useStore } from './store';
import { LoginPage } from './components/LoginPage';
import { Layout } from './components/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';

const ChatView = lazy(() => import('./components/ChatView').then(m => ({ default: m.ChatView })));
const MemoryView = lazy(() => import('./components/MemoryView').then(m => ({ default: m.MemoryView })));
const VoiceView = lazy(() => import('./components/VoiceView').then(m => ({ default: m.VoiceView })));
const SettingsView = lazy(() => import('./components/SettingsView').then(m => ({ default: m.SettingsView })));
const DashboardView = lazy(() => import('./components/DashboardView').then(m => ({ default: m.DashboardView })));
const TeamWorkspace = lazy(() => import('./components/team').then(m => ({ default: m.TeamWorkspace })));

const IDLE_MS = 15 * 60 * 1000;

function useIdleLogout() {
  const token = useStore((s) => s.token);
  const logout = useStore((s) => s.logout);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const reset = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (token) {
      timerRef.current = setTimeout(logout, IDLE_MS);
    }
  }, [token, logout]);

  useEffect(() => {
    if (!token) return;
    reset();
    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'] as const;
    for (const e of events) window.addEventListener(e, reset, { passive: true });
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      for (const e of events) window.removeEventListener(e, reset);
    };
  }, [token, reset]);
}

export function App() {
  const token = useStore((s) => s.token);
  const loadProviders = useStore((s) => s.loadProviders);
  useIdleLogout();

  useEffect(() => {
    if (token) loadProviders();
  }, [token, loadProviders]);

  if (!token) {
    return <LoginPage />;
  }

  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/" element={<Navigate to="/app" replace />} />
        <Route path="/admin/*" element={<Navigate to="/app/settings" replace />} />
        <Route path="/app/*" element={
          <Layout>
            <ErrorBoundary>
              <Suspense fallback={<div style={{ padding: 24, color: '#666' }}>加载中...</div>}>
                <Routes>
                  <Route index element={<DashboardView />} />
                  <Route path="dashboard" element={<Navigate to="/app" replace />} />
                  <Route path="memory" element={<MemoryView />} />
                  <Route path="voice" element={<VoiceView />} />
                  <Route path="settings" element={<SettingsView />} />
                  <Route path="team" element={<TeamWorkspace />} />
                  <Route path="chat" element={<ChatView />} />
                  <Route path="*" element={<Navigate to="/app" replace />} />
                </Routes>
              </Suspense>
            </ErrorBoundary>
          </Layout>
        } />
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
    </ErrorBoundary>
  );
}
```

### Step 9: 接入 Sidebar 到 Layout

Read `web/src/components/Layout.tsx` first, then:

1. Add imports at top:
```typescript
import { Sidebar } from './Sidebar';
import { SIDEBAR_GROUPS } from '../routes';
```

2. Find the existing sidebar render block (grep for "sidebar" in the file). Replace the sidebar list contents with:
```tsx
<Sidebar groups={SIDEBAR_GROUPS} />
```

(If Layout uses a hamburger that toggles a mobile drawer, pass `onNavigate={closeSidebar}` where closeSidebar is the existing toggle function.)

### Step 10: Build 验证

```bash
cd /home/ubuntu/panmira-H1/web && pnpm build 2>&1 | tail -20
```
Expected: build 成功,无 TS 错误,产物在 `../dist/web-staging/`

### Step 11: Commit

```bash
cd /home/ubuntu/panmira-H1
git add web/package.json web/pnpm-lock.yaml web/vitest.config.ts web/src/__tests__/ web/src/components/Sidebar.tsx web/src/components/Sidebar.module.css web/src/components/__tests__/Sidebar.test.tsx web/src/App.tsx web/src/components/Layout.tsx web/src/routes.ts
git commit -m "feat(plan-H1.1): 路由重构 + 侧栏分组 (4 组 + 12 流程页入口)"
```

---

## Task 2: ⌘K 命令面板 (H1.2)

### Step 1: 写 store slice 测试

Create `web/src/store/__tests__/command-palette.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { useCommandPalette } from '../command-palette';

describe('useCommandPalette', () => {
  beforeEach(() => {
    useCommandPalette.setState({ open: false });
  });

  it('starts closed', () => {
    expect(useCommandPalette.getState().open).toBe(false);
  });

  it('toggles open/close', () => {
    useCommandPalette.getState().toggle();
    expect(useCommandPalette.getState().open).toBe(true);
    useCommandPalette.getState().toggle();
    expect(useCommandPalette.getState().open).toBe(false);
  });

  it('sets open state explicitly', () => {
    useCommandPalette.getState().setOpen(true);
    expect(useCommandPalette.getState().open).toBe(true);
    useCommandPalette.getState().setOpen(false);
    expect(useCommandPalette.getState().open).toBe(false);
  });
});
```

### Step 2: 实现 store slice

Create `web/src/store/command-palette.ts`:
```typescript
import { create } from 'zustand';

interface CommandPaletteState {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}

export const useCommandPalette = create<CommandPaletteState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
}));
```

### Step 3: 运行 store 测试

```bash
cd /home/ubuntu/panmira-H1/web && pnpm test -- command-palette 2>&1 | tail -10
```
Expected: 3 tests PASS

### Step 4: 写 CommandPalette 组件测试

Create `web/src/components/__tests__/CommandPalette.test.tsx`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CommandPalette } from '../CommandPalette';
import { useCommandPalette } from '../../store/command-palette';

describe('CommandPalette', () => {
  beforeEach(() => {
    useCommandPalette.setState({ open: false });
  });

  it('renders nothing when closed', () => {
    const { container } = render(<MemoryRouter><CommandPalette /></MemoryRouter>);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('renders dialog when open', () => {
    useCommandPalette.getState().setOpen(true);
    render(<MemoryRouter><CommandPalette /></MemoryRouter>);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('lists sidebar items as commands', () => {
    useCommandPalette.getState().setOpen(true);
    render(<MemoryRouter><CommandPalette /></MemoryRouter>);
    expect(screen.getByText('总览')).toBeInTheDocument();
    expect(screen.getByText('模型池')).toBeInTheDocument();
    expect(screen.getByText('数智底座')).toBeInTheDocument();
  });

  it('closes on Escape key', () => {
    useCommandPalette.getState().setOpen(true);
    render(<MemoryRouter><CommandPalette /></MemoryRouter>);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(useCommandPalette.getState().open).toBe(false);
  });

  it('filters items by query', () => {
    useCommandPalette.getState().setOpen(true);
    render(<MemoryRouter><CommandPalette /></MemoryRouter>);
    const input = screen.getByPlaceholderText(/搜索/);
    fireEvent.change(input, { target: { value: '模型' } });
    expect(screen.getByText('模型池')).toBeInTheDocument();
    expect(screen.queryByText('数智底座')).toBeNull();
  });

  it('navigates on item click', () => {
    useCommandPalette.setState({ open: true });
    render(<MemoryRouter initialEntries={['/app']}><CommandPalette /></MemoryRouter>);
    fireEvent.click(screen.getByText('模型池'));
    expect(useCommandPalette.getState().open).toBe(false);
  });
});
```

### Step 5: 实现 CommandPalette 组件

Create `web/src/components/CommandPalette.tsx`:
```typescript
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCommandPalette } from '../store/command-palette';
import { SIDEBAR_GROUPS } from '../routes';

interface CommandItem {
  to: string;
  label: string;
  group: string;
}

function flattenCommands(): CommandItem[] {
  const items: CommandItem[] = [];
  for (const g of SIDEBAR_GROUPS) {
    for (const item of g.items) {
      items.push({ to: item.to, label: item.label, group: g.label });
    }
  }
  return items;
}

export function CommandPalette() {
  const open = useCommandPalette((s) => s.open);
  const setOpen = useCommandPalette((s) => s.setOpen);
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const allCommands = useMemo(flattenCommands, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return allCommands;
    const q = query.toLowerCase();
    return allCommands.filter(
      (c) => c.label.toLowerCase().includes(q) || c.group.toLowerCase().includes(q)
    );
  }, [query, allCommands]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        useCommandPalette.getState().toggle();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  function handleItemClick(item: CommandItem) {
    navigate(item.to);
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && filtered[selectedIdx]) {
      e.preventDefault();
      handleItemClick(filtered[selectedIdx]);
    }
  }

  if (!open) return null;

  return (
    <div className="cmd-overlay" onClick={() => setOpen(false)}>
      <div
        role="dialog"
        aria-label="命令面板"
        className="cmd-dialog"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelectedIdx(0);
          }}
          placeholder="搜索页面或资源..."
          className="cmd-input"
          aria-label="搜索"
        />
        <ul className="cmd-list">
          {filtered.length === 0 && (
            <li className="cmd-empty">无匹配项</li>
          )}
          {filtered.map((item, idx) => (
            <li
              key={item.to}
              className={idx === selectedIdx ? 'cmd-item selected' : 'cmd-item'}
              onClick={() => handleItemClick(item)}
              onMouseEnter={() => setSelectedIdx(idx)}
            >
              <span className="cmd-group">{item.group}</span>
              <span className="cmd-label">{item.label}</span>
            </li>
          ))}
        </ul>
        <div className="cmd-footer">
          <kbd>↑↓</kbd> 选择 <kbd>↵</kbd> 打开 <kbd>Esc</kbd> 关闭
        </div>
      </div>
    </div>
  );
}
```

Create `web/src/components/CommandPalette.module.css`:
```css
.cmd-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  z-index: 1000;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 12vh;
}
.cmd-dialog {
  width: 560px;
  max-width: 90vw;
  max-height: 60vh;
  background: var(--bg-elevated, #1a1a1f);
  border: 1px solid var(--border, rgba(255, 255, 255, 0.08));
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.cmd-input {
  width: 100%;
  padding: 1rem 1.25rem;
  font-size: 1rem;
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--border, rgba(255, 255, 255, 0.08));
  color: var(--text-primary, #f0f0f2);
  outline: none;
  font-family: inherit;
}
.cmd-input::placeholder {
  color: var(--text-tertiary, #888);
}
.cmd-list {
  flex: 1;
  list-style: none;
  padding: 0.5rem 0;
  margin: 0;
  overflow-y: auto;
}
.cmd-empty {
  padding: 2rem 1.25rem;
  text-align: center;
  color: var(--text-tertiary, #888);
  font-size: 0.875rem;
}
.cmd-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.625rem 1.25rem;
  cursor: pointer;
  transition: background-color 80ms ease;
}
.cmd-item.selected {
  background-color: var(--bg-active, rgba(99, 102, 241, 0.15));
}
.cmd-group {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-tertiary, #888);
  min-width: 80px;
}
.cmd-label {
  color: var(--text-primary, #f0f0f2);
  font-size: 0.9rem;
}
.cmd-footer {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  padding: 0.625rem 1.25rem;
  font-size: 0.75rem;
  color: var(--text-tertiary, #888);
  border-top: 1px solid var(--border, rgba(255, 255, 255, 0.08));
}
.cmd-footer kbd {
  padding: 0.125rem 0.375rem;
  background: var(--bg-input, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--border, rgba(255, 255, 255, 0.08));
  border-radius: 4px;
  font-family: inherit;
  font-size: 0.7rem;
}
```

### Step 6: 在 Layout 挂载 CommandPalette

Read `web/src/components/Layout.tsx` first, then:

1. Add imports:
```typescript
import { CommandPalette } from './CommandPalette';
import { useCommandPalette } from '../store/command-palette';
```

2. In the Layout function body (top), add:
```typescript
const toggleCommandPalette = useCommandPalette((s) => s.toggle);
```

3. In the return JSX, add CommandPalette at the top level (inside the outermost Layout div):
```tsx
<CommandPalette />
```

4. Also add a trigger button somewhere visible (top toolbar or sidebar footer):
```tsx
<button className="cmd-trigger" onClick={toggleCommandPalette} aria-label="打开命令面板">
  <kbd>⌘K</kbd>
  <span>搜索/跳转</span>
</button>
```

### Step 7: Add cmd-trigger CSS

Append to `web/src/components/Layout.module.css`:
```css
.cmd-trigger {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  margin: 0.5rem;
  background: var(--bg-input, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--border, rgba(255, 255, 255, 0.08));
  border-radius: 6px;
  color: var(--text-tertiary, #888);
  cursor: pointer;
  font-size: 0.8rem;
  transition: background-color 120ms ease;
}
.cmd-trigger:hover {
  background-color: var(--bg-hover, rgba(255, 255, 255, 0.08));
  color: var(--text-secondary, #aaa);
}
.cmd-trigger kbd {
  padding: 0.125rem 0.375rem;
  background: var(--bg-elevated, rgba(255, 255, 255, 0.06));
  border-radius: 3px;
  font-size: 0.7rem;
}
```

### Step 8: 运行所有测试

```bash
cd /home/ubuntu/panmira-H1/web && pnpm test 2>&1 | tail -15
```
Expected: 13 tests PASS (4 Sidebar + 3 store + 6 CommandPalette)

### Step 9: Build 验证

```bash
cd /home/ubuntu/panmira-H1/web && pnpm build 2>&1 | tail -20
```
Expected: build 成功

### Step 10: Commit

```bash
cd /home/ubuntu/panmira-H1
git add web/src/store/command-palette.ts web/src/store/__tests__/ web/src/components/CommandPalette.tsx web/src/components/CommandPalette.module.css web/src/components/__tests__/CommandPalette.test.tsx web/src/components/Layout.tsx web/src/components/Layout.module.css
git commit -m "feat(plan-H1.2): ⌘K 命令面板 (跳转 + 搜索 + 键盘导航)"
```

---

## Task 3: 部署 + 验证 + handoff (H1.3)

### Step 1: 最终 build

```bash
cd /home/ubuntu/panmira-H1/web && pnpm build 2>&1 | tail -10
```
Expected: dist/web-staging/ 已生成

### Step 2: 验证 dist 输出

```bash
ls -la /home/ubuntu/panmira-H1/dist/web-staging/ | head -10
```
Expected: index.html + assets/

### Step 3: Merge 到 fix/memory-system-2026-06-27

```bash
cd /home/ubuntu/panmira-H1
git log --oneline -5
cd /home/ubuntu/panmira
git checkout fix/memory-system-2026-06-27
git merge --no-ff feat/plan-H1-ia-refactor -m "merge: plan-H1 前端 IA 重构 + ⌘K 命令面板"
```

### Step 4: pm2 reload(安全起见)

```bash
cd /home/ubuntu/panmira
pm2 reload panmira 2>&1 | tail -5
pm2 status panmira 2>&1 | grep panmira
```
Expected: status online

### Step 5: e2e 验证 web

```bash
curl -sS -m 5 -o /dev/null -w 'web/:   HTTP %{http_code} %{size_download}b in %{time_total}s\n' https://deepx.fun/web/
curl -sS -m 5 -o /dev/null -w 'web/app: HTTP %{http_code} %{size_download}b in %{time_total}s\n' https://deepx.fun/web/app
curl -sS -m 5 https://deepx.fun/web/ | head -3
```
Expected: HTTP 200, index.html 含 `<div id="root">`

### Step 6: 写 handoff

Create `/home/ubuntu/panmira/.claude/handoff-2026-07-06-panmira-plan-H1.md`:
```markdown
# Plan H1 · 前端 IA 重构 + ⌘K 命令面板 · Handoff(2026-07-06)

## 当前任务
panmira-web IA 重构(spec § 14 12 流程页)+ ⌘K 命令面板 部署完成

## 已完成
- [x] H1.0 worktree + plan 文档
- [x] H1.1 路由重构 + 侧栏分组(4 组:工作台/资源/配置/管理)
- [x] H1.2 ⌘K 命令面板(跳转 + 搜索 + 键盘导航)
- [x] H1.3 部署 + 验证 + handoff

## 关键变更
- `web/src/App.tsx`:路由前缀 `/app/*`,保留 `/admin` 兼容重定向
- `web/src/components/Sidebar.tsx`(新):数据驱动侧栏
- `web/src/components/CommandPalette.tsx`(新):全局 ⌘K
- `web/src/store/command-palette.ts`(新):zustand slice
- `web/src/routes.ts`(新):侧栏分组数据
- `web/vitest.config.ts`(新):前端测试基线

## 测试
- 13 tests pass (4 Sidebar + 3 store + 6 CommandPalette)

## 部署
- branch: fix/memory-system-2026-06-27
- HEAD: <填实际 hash>
- pm2: online
- deepx.fun/web/ HTTP 200

## 关键文件
- Plan: `docs/superpowers/plans/2026-07-06-panmira-plan-H1.md`
- Sidebar: `web/src/components/Sidebar.tsx`
- CommandPalette: `web/src/components/CommandPalette.tsx`
- Routes: `web/src/routes.ts`

## 下一步
- Plan H2: Dashboard + 模型池 + KB 树(3 流程页实装)
```

### Step 7: Commit handoff

```bash
cd /home/ubuntu/panmira
git add .claude/handoff-2026-07-06-panmira-plan-H1.md
git commit -m "docs(handoff): plan-H1 前端 IA 重构 + ⌘K 命令面板 部署完成"
```

---

## 验收

- [ ] 13 tests pass
- [ ] vite build 成功
- [ ] deepx.fun/web/ HTTP 200
- [ ] deepx.fun/web/app HTTP 200 (SPA fallback)
- [ ] /admin/* 仍重定向(向后兼容)
- [ ] ⌘K / Ctrl+K 打开命令面板
- [ ] 4 组侧栏正确显示
- [ ] 命令面板可搜索 + 键盘导航

## 下一步(Plan H2)

H2 选 3 个流程页实装,候选:
- Dashboard 总览(资源卡片 + 趋势图)
- 模型池(LLM/Embedding CRUD + 测试 + fallback)
- 数智底座(KB 树 + 上传 + 检索测试)
