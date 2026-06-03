import { useState, useMemo } from 'react';
import type { BotStatus, AgentMetadata } from '../../store';
import { hash, AVATAR_COLORS as COLORS } from '../../utils/helpers';
import s from './TeamTreePanel.module.css';

/* ── Icons ── */

function IconSearch() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function IconChevron({ open }: { open: boolean }) {
  return (
    <svg
      width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round"
      style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 150ms ease' }}
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

/* ── Status dot ── */

function StatusDot({ status, size = 8 }: { status: 'idle' | 'busy' | 'error'; size?: number }) {
  const cls = status === 'busy' ? s.dotBusy : status === 'error' ? s.dotError : s.dotIdle;
  return <span className={`${s.statusDot} ${cls}`} style={{ width: size, height: size }} />;
}

/* ── Mini avatar ── */

function MiniAvatar({ name, size = 24 }: { name: string; size?: number }) {
  const color = COLORS[hash(name) % COLORS.length];
  return (
    <div className={s.miniAvatar} style={{ width: size, height: size, background: `${color}18`, color }}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

/* ── Props ── */

interface TeamTreePanelProps {
  bots: BotStatus[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
}

export function TeamTreePanel({ bots, selectedKey, onSelect }: TeamTreePanelProps) {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(bots.map((b) => b.name)));

  const totalAgents = useMemo(() => bots.reduce((sum, b) => sum + 1 + (b.agents?.length || 0), 0), [bots]);
  const totalCost = useMemo(() => bots.reduce((sum, b) => sum + b.stats.totalCostUsd, 0), [bots]);

  const filteredBots = useMemo(() => {
    if (!search.trim()) return bots;
    const q = search.toLowerCase();
    return bots.filter((b) => {
      if (b.name.toLowerCase().includes(q)) return true;
      if (b.description?.toLowerCase().includes(q)) return true;
      if (b.agents?.some((a) => a.name.toLowerCase().includes(q))) return true;
      return false;
    });
  }, [bots, search]);

  const toggleExpand = (name: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  return (
    <div className={s.panel}>
      {/* Header */}
      <div className={s.header}>
        <span className={s.headerLabel}>智能体</span>
        <span className={s.headerCount}>{totalAgents}</span>
      </div>

      {/* Search */}
      <div className={s.searchWrap}>
        <span className={s.searchIcon}><IconSearch /></span>
        <input
          className={s.searchInput}
          placeholder="搜索智能体..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Tree */}
      <div className={s.tree}>
        {filteredBots.map((bot) => {
          const isExpanded = expanded.has(bot.name);
          const hasAgents = bot.agents && bot.agents.length > 0;
          const isSelected = selectedKey === bot.name;

          return (
            <div key={bot.name} className={s.botGroup}>
              {/* Bot lead row */}
              <div
                className={`${s.treeItem} ${isSelected ? s.treeItemActive : ''}`}
                onClick={() => onSelect(bot.name)}
              >
                {hasAgents ? (
                  <button
                    className={s.chevronBtn}
                    onClick={(e) => { e.stopPropagation(); toggleExpand(bot.name); }}
                  >
                    <IconChevron open={isExpanded} />
                  </button>
                ) : (
                  <span className={s.chevronSpacer} />
                )}
                <MiniAvatar name={bot.name} />
                <span className={s.itemName}>{bot.name}</span>
                <StatusDot status={bot.status} />
              </div>

              {/* Sub-agents */}
              {hasAgents && isExpanded && (
                <div className={s.subAgents}>
                  {bot.agents!.map((agent: AgentMetadata) => {
                    const agentKey = `${bot.name}/${agent.name}`;
                    const isAgentSelected = selectedKey === agentKey;
                    return (
                      <div
                        key={agentKey}
                        className={`${s.treeItem} ${s.subItem} ${isAgentSelected ? s.treeItemActive : ''}`}
                        onClick={() => onSelect(agentKey)}
                      >
                        <span className={s.chevronSpacer} />
                        <span className={s.subDot} />
                        <span className={s.itemName}>{agent.name}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {filteredBots.length === 0 && (
          <div className={s.emptyTree}>未找到匹配 "{search}" 的智能体</div>
        )}
      </div>

      {/* Footer */}
      <div className={s.footer}>
        <span>{totalAgents} 智能体</span>
        <span className={s.footerDivider} />
        <span>¥{totalCost.toFixed(2)}</span>
      </div>
    </div>
  );
}
