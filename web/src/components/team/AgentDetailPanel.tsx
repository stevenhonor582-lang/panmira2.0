import { useMemo, useState, useEffect, useCallback } from 'react';
import type { BotStatus, AgentMetadata } from '../../store';
import { useStore } from '../../store';
import { ActivityTimeline } from './ActivityTimeline';
import { hash, formatDuration, AVATAR_COLORS as COLORS } from '../../utils/helpers';
import s from './AgentDetailPanel.module.css';

/* ── Icons ── */

function IconChat() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  );
}

function IconClock() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

/* ── Props ── */

interface AgentDetailPanelProps {
  bot: BotStatus;
  agentKey: string;
  activeTab: 'activity' | 'stats' | 'info' | 'sessions';
  onTabChange: (tab: 'activity' | 'stats' | 'info' | 'sessions') => void;
  onOpenChat: (botName: string) => void;
}

export function AgentDetailPanel({ bot, agentKey, activeTab, onTabChange, onOpenChat }: AgentDetailPanelProps) {
  // Determine if this is a sub-agent
  const isSubAgent = agentKey.includes('/');
  const subAgentName = isSubAgent ? agentKey.split('/')[1] : null;
  const subAgent: AgentMetadata | undefined = isSubAgent
    ? bot.agents?.find((a) => a.name === subAgentName)
    : undefined;

  const displayName = isSubAgent ? (subAgent?.name || subAgentName || agentKey) : bot.name;
  const description = isSubAgent ? subAgent?.description : bot.description;
  const color = COLORS[hash(displayName) % COLORS.length];

  const successRate = useMemo(() => {
    if (bot.stats.totalTasks === 0) return 0;
    return Math.round((bot.stats.completedTasks / bot.stats.totalTasks) * 100);
  }, [bot.stats]);

  return (
    <div className={s.panel}>
      {/* Header */}
      <div className={s.header}>
        <div className={s.avatarLarge} style={{ background: `${color}18`, color }}>
          {displayName.charAt(0).toUpperCase()}
        </div>
        <div className={s.headerInfo}>
          <div className={s.nameRow}>
            <h2 className={s.name}>{displayName}</h2>
            <span className={`${s.statusBadge} ${s[`status-${bot.status}`]}`}>
              {bot.status === 'idle' ? '空闲' : bot.status === 'busy' ? '忙碌' : '错误'}
            </span>
          </div>
          {isSubAgent && (
            <div className={s.parentLabel}>
              隶属于 <strong>{bot.name}</strong>
            </div>
          )}
          {!isSubAgent && (
            <div className={s.metaRow}>
              <span className={s.platform}>{bot.platform}</span>
              {bot.specialties && bot.specialties.length > 0 && (
                <div className={s.tags}>
                  {bot.specialties.map((tag) => (
                    <span key={tag} className={s.tag}>{tag}</span>
                  ))}
                </div>
              )}
            </div>
          )}
          {description && <p className={s.description}>{description}</p>}
        </div>
        <button className={s.chatBtn} onClick={() => onOpenChat(bot.name)}>
          <IconChat />
          <span>对话</span>
        </button>
      </div>

      {/* Tabs */}
      <div className={s.tabs}>
        {(['activity', 'stats', 'sessions', 'info'] as const).map((tab) => (
          <button
            key={tab}
            className={`${s.tab} ${activeTab === tab ? s.tabActive : ''}`}
            onClick={() => onTabChange(tab)}
          >
            {tab === 'activity' ? '活动' : tab === 'stats' ? '统计' : tab === 'sessions' ? '会话' : '信息'}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className={s.content}>
        {activeTab === 'activity' && (
          <ActivityTab bot={bot} />
        )}

        {activeTab === 'stats' && (
          <div className={s.statsTab}>
            {/* 任务概览 */}
            <div className={s.statsSection}>
              <div className={s.statsSectionTitle}>任务概览</div>
              <div className={s.statsRow3}>
                <div className={`${s.statCard} ${s.statCardHighlight}`}>
                  <span className={s.statValue}>{bot.stats.totalTasks}</span>
                  <span className={s.statLabel}>总任务</span>
                </div>
                <div className={`${s.statCard} ${s.statCardSuccess}`}>
                  <span className={`${s.statValue} ${s.statGreen}`}>{bot.stats.completedTasks}</span>
                  <span className={s.statLabel}>已完成</span>
                </div>
                <div className={`${s.statCard} ${s.statCardFail}`}>
                  <span className={`${s.statValue} ${s.statRed}`}>{bot.stats.failedTasks}</span>
                  <span className={s.statLabel}>失败</span>
                </div>
              </div>
              {bot.stats.totalTasks > 0 && (
                <div className={s.progressSection}>
                  <div className={s.progressHeader}>
                    <span className={s.progressLabel}>成功率</span>
                    <span className={s.progressValue}>{successRate}%</span>
                  </div>
                  <div className={s.progressBar}>
                    <div className={s.progressFill} style={{ width: `${successRate}%` }} />
                  </div>
                </div>
              )}
            </div>

            {/* Token 消耗 */}
            <div className={s.statsSection}>
              <div className={s.statsSectionTitle}>Token 消耗</div>
              <div className={s.statCard}>
                <span className={s.statBigValue}>{((bot.stats.totalInputTokens || 0) + (bot.stats.totalOutputTokens || 0) + (bot.stats.totalCacheReadTokens || 0) + (bot.stats.totalCacheCreationTokens || 0)).toLocaleString()}</span>
                <span className={s.statLabel}>总 Token</span>
              </div>
              <div className={s.tokenBreakdown}>
                <div className={s.tokenRow}>
                  <span className={s.tokenDot} style={{ background: '#60a5fa' }} />
                  <span className={s.tokenName}>输入</span>
                  <span className={s.tokenBarWrap}>
                    <span className={s.tokenBar} style={{ width: `${Math.min(100, ((bot.stats.totalInputTokens || 0) / Math.max(bot.stats.totalInputTokens || 0 + bot.stats.totalOutputTokens || 0 + bot.stats.totalCacheReadTokens || 0 + bot.stats.totalCacheCreationTokens || 0, 1)) * 100)}%`, background: '#60a5fa' }} />
                  </span>
                  <span className={s.tokenNum}>{(bot.stats.totalInputTokens || 0).toLocaleString()}</span>
                </div>
                <div className={s.tokenRow}>
                  <span className={s.tokenDot} style={{ background: '#34d399' }} />
                  <span className={s.tokenName}>输出</span>
                  <span className={s.tokenBarWrap}>
                    <span className={s.tokenBar} style={{ width: `${Math.min(100, ((bot.stats.totalOutputTokens || 0) / Math.max(bot.stats.totalInputTokens || 0 + bot.stats.totalOutputTokens || 0 + bot.stats.totalCacheReadTokens || 0 + bot.stats.totalCacheCreationTokens || 0, 1)) * 100)}%`, background: '#34d399' }} />
                  </span>
                  <span className={s.tokenNum}>{(bot.stats.totalOutputTokens || 0).toLocaleString()}</span>
                </div>
                <div className={s.tokenRow}>
                  <span className={s.tokenDot} style={{ background: '#fbbf24' }} />
                  <span className={s.tokenName}>缓存读</span>
                  <span className={s.tokenBarWrap}>
                    <span className={s.tokenBar} style={{ width: `${Math.min(100, ((bot.stats.totalCacheReadTokens || 0) / Math.max(bot.stats.totalInputTokens || 0 + bot.stats.totalOutputTokens || 0 + bot.stats.totalCacheReadTokens || 0 + bot.stats.totalCacheCreationTokens || 0, 1)) * 100)}%`, background: '#fbbf24' }} />
                  </span>
                  <span className={s.tokenNum}>{(bot.stats.totalCacheReadTokens || 0).toLocaleString()}</span>
                </div>
                <div className={s.tokenRow}>
                  <span className={s.tokenDot} style={{ background: '#f87171' }} />
                  <span className={s.tokenName}>缓存写</span>
                  <span className={s.tokenBarWrap}>
                    <span className={s.tokenBar} style={{ width: `${Math.min(100, ((bot.stats.totalCacheCreationTokens || 0) / Math.max(bot.stats.totalInputTokens || 0 + bot.stats.totalOutputTokens || 0 + bot.stats.totalCacheReadTokens || 0 + bot.stats.totalCacheCreationTokens || 0, 1)) * 100)}%`, background: '#f87171' }} />
                  </span>
                  <span className={s.tokenNum}>{(bot.stats.totalCacheCreationTokens || 0).toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* 费用 */}
            <div className={s.statsSection}>
              <div className={s.statsSectionTitle}>费用</div>
              <div className={s.statCard}>
                <span className={s.statBigValue}>¥{bot.stats.totalCostUsd.toFixed(4)}</span>
                <span className={s.statLabel}>累计花费</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'sessions' && (
          <SessionsTab botName={bot.name} />
        )}

        {activeTab === 'info' && (
          <div className={s.infoTab}>
            {!isSubAgent && (
              <>
                <div className={s.infoRow}>
                  <span className={s.infoLabel}>工作目录</span>
                  <code className={s.infoCode}>{bot.workingDirectory}</code>
                </div>
                <div className={s.infoRow}>
                  <span className={s.infoLabel}>平台</span>
                  <span className={s.infoValue}>{bot.platform}</span>
                </div>
              </>
            )}

            {isSubAgent && subAgent && (
              <>
                {subAgent.model && (
                  <div className={s.infoRow}>
                    <span className={s.infoLabel}>模型</span>
                    <span className={s.infoValue}>{subAgent.model}</span>
                  </div>
                )}
                {subAgent.tools && (
                  <div className={s.infoRow}>
                    <span className={s.infoLabel}>工具</span>
                    <div className={s.toolsList}>
                      {subAgent.tools.split(',').map((t) => (
                        <span key={t.trim()} className={s.toolTag}>{t.trim()}</span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {!isSubAgent && bot.agents && bot.agents.length > 0 && (
              <div className={s.subAgentSection}>
                <span className={s.infoLabel}>子智能体 ({bot.agents.length})</span>
                <div className={s.subAgentList}>
                  {bot.agents.map((agent) => (
                    <div key={agent.name} className={s.subAgentItem}>
                      <span className={s.subAgentDot} />
                      <div className={s.subAgentInfo}>
                        <span className={s.subAgentName}>{agent.name}</span>
                        {agent.description && (
                          <span className={s.subAgentDesc}>{agent.description}</span>
                        )}
                      </div>
                      {agent.model && <span className={s.subAgentModel}>{agent.model}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Activity Tab with active task + timeline ── */

function ActivityTab({ bot }: { bot: BotStatus }) {
  const token = useStore((s) => s.token);
  const globalEvents = useStore((s) => s.activityEvents);
  const [botEvents, setBotEvents] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/activity/events?limit=50&botName=${encodeURIComponent(bot.name)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => { setBotEvents(data.events || []); setLoading(false); })
      .catch(() => { setBotEvents([]); setLoading(false); });
  }, [bot.name, token]);

  const events = botEvents !== null ? botEvents : globalEvents;

  return (
    <div className={s.activityTab}>
      {bot.status === 'busy' && bot.currentTask && (
        <div className={s.activeTask}>
          <div className={s.taskHeader}>
            <span className={s.taskPulse} />
            <span className={s.taskLabel}>执行中</span>
          </div>
          <div className={s.taskMeta}>
            <span className={s.taskMetaItem}>
              <IconClock />
              {formatDuration(bot.currentTask.durationMs)}
            </span>
            <span className={s.taskMetaItem}>
              会话: <code>{(bot.currentTask.chatId || '').slice(0, 12)}...</code>
            </span>
          </div>
        </div>
      )}
      {loading ? (
        <span style={{ color: 'var(--text-3)' }}>加载中...</span>
      ) : (
        <ActivityTimeline events={events} botFilter={bot.name} />
      )}
    </div>
  );
}

/* ── Sessions Tab ── */

interface SessionInfo {
  id: string;
  platform: string;
  chatId: string;
  title: string;
  updatedAt: number | string;
  createdAt: number | string;
}

interface SessionMessage {
  role: string;
  text: string;
  timestamp: number;
}

function formatSessionTime(ts: number | string): string {
  const n = typeof ts === 'string' ? Number(ts) : ts;
  if (!n || isNaN(n)) return '—';
  const d = new Date(n);
  if (isNaN(d.getTime())) return '—';
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function SessionsTab({ botName }: { botName: string }) {
  const token = useStore((s) => s.token);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SessionMessage[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);

  useEffect(() => {
    setSelectedId(null);
    setMessages([]);
    setLoading(true);
    fetch(`/api/sessions?botName=${encodeURIComponent(botName)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => { setSessions(data.sessions || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [botName, token]);

  const loadMessages = useCallback((sessionId: string) => {
    setSelectedId(sessionId);
    setMsgLoading(true);
    fetch(`/api/sessions/${encodeURIComponent(sessionId)}/messages`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => { setMessages(data.messages || []); setMsgLoading(false); })
      .catch(() => { setMessages([]); setMsgLoading(false); });
  }, [token]);

  if (loading) return <div className={s.activityTab}><span style={{ color: 'var(--text-3)' }}>加载中...</span></div>;

  if (selectedId) {
    const session = sessions.find((s) => s.id === selectedId);
    return (
      <div className={s.activityTab}>
        <button className={`${s.tab} ${s.tabOutline}`} style={{ marginBottom: 12 }} onClick={() => setSelectedId(null)}>
          ← 返回会话列表
        </button>
        <div style={{ marginBottom: 8, fontSize: 13, color: 'var(--text-2)' }}>
          {session?.title || '(无标题)'} · {session?.platform} · {formatSessionTime(session?.updatedAt || 0)}
        </div>
        {msgLoading ? (
          <span style={{ color: 'var(--text-3)' }}>加载消息...</span>
        ) : messages.length === 0 ? (
          <span style={{ color: 'var(--text-3)' }}>暂无消息记录</span>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {messages.map((msg, i) => (
              <div key={i} style={{
                padding: '8px 12px',
                borderRadius: 8,
                background: msg.role === 'user'
                  ? 'rgba(99, 102, 241, 0.08)'
                  : 'var(--glass-bg, rgba(255,255,255,0.04))',
                border: '1px solid var(--glass-border, rgba(255,255,255,0.08))',
                fontSize: 13,
              }}>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>
                  {msg.role === 'user' ? '👤 用户' : '🤖 助手'} · {formatSessionTime(msg.timestamp)}
                </div>
                <div style={{ color: 'var(--text-1)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 200, overflow: 'auto' }}>
                  {(() => { const c = msg.text; if (typeof c === 'string') return c.slice(0, 1000); if (c != null) return JSON.stringify(c).slice(0, 500); return '(空)'; })()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (sessions.length === 0) {
    return <div className={s.activityTab}><span style={{ color: 'var(--text-3)' }}>暂无会话记录</span></div>;
  }

  return (
    <div className={s.activityTab}>
      {sessions.map((sess) => (
        <div
          key={sess.id}
          onClick={() => loadMessages(sess.id)}
          style={{
            padding: '10px 14px',
            borderRadius: 8,
            background: 'var(--glass-bg, rgba(255,255,255,0.04))',
            border: '1px solid var(--glass-border, rgba(255,255,255,0.08))',
            cursor: 'pointer',
            marginBottom: 8,
          }}
        >
          <div style={{ fontWeight: 500, fontSize: 14, color: 'var(--text-0, #fff)', marginBottom: 4 }}>
            {sess.title || '(无标题)'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
            {sess.platform || '—'} · {(sess.chatId || '').slice(0, 20)}... · {formatSessionTime(sess.updatedAt || 0)}
          </div>
        </div>
      ))}
    </div>
  );
}
