import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCommandPalette } from '../store/command-palette';
import { SIDEBAR_GROUPS } from '../routes';
import s from './CommandPalette.module.css';

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
  const open = useCommandPalette((st) => st.open);
  const setOpen = useCommandPalette((st) => st.setOpen);
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
    <div className={s.cmdOverlay} onClick={() => setOpen(false)}>
      <div
        role="dialog"
        aria-label="命令面板"
        className={s.cmdDialog}
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
          className={s.cmdInput}
          aria-label="搜索"
        />
        <ul className={s.cmdList}>
          {filtered.length === 0 && (
            <li className={s.cmdEmpty}>无匹配项</li>
          )}
          {filtered.map((item, idx) => (
            <li
              key={item.to}
              className={idx === selectedIdx ? `${s.cmdItem} ${s.cmdItemSelected}` : s.cmdItem}
              onClick={() => handleItemClick(item)}
              onMouseEnter={() => setSelectedIdx(idx)}
            >
              <span className={s.cmdGroup}>{item.group}</span>
              <span className={s.cmdLabel}>{item.label}</span>
            </li>
          ))}
        </ul>
        <div className={s.cmdFooter}>
          <kbd>↑↓</kbd> 选择 <kbd>↵</kbd> 打开 <kbd>Esc</kbd> 关闭
        </div>
      </div>
    </div>
  );
}
