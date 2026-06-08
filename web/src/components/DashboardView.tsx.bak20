import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store';
import s from './DashboardView.module.css';

/* ---------- Types ---------- */

interface TokenOverview {
  totalTokens: number;
  todayTokens: number;
  totalTasks: number;
  avgTokensPerTask: number;
}

interface TokenTrendPoint {
  date: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
  total: number;
}

interface BotTokenRow {
  name: string;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
}

interface TokenTypeShare {
  label: string;
  value: number;
  color: string;
}

interface ActivityItem {
  id: string;
  type: string;
  botName: string;
  costUsd?: number;
  durationMs?: number;
  timestamp: number;
  prompt?: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  model?: string;
}

interface DashboardData {
  overview: TokenOverview;
  trend: TokenTrendPoint[];
  byBot: BotTokenRow[];
  typeShare: TokenTypeShare[];
  recentActivity: ActivityItem[];
}

/* ---------- Helpers ---------- */

function fmtTokens(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return String(v);
}

function fmtCost(v: number): string {
  if (v === 0) return '¥0.00';
  return v < 0.01 ? `¥${v.toFixed(4)}` : `¥${v.toFixed(2)}`;
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function relTime(ts: number, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const d = Date.now() - ts;
  const m = Math.floor(d / 60_000);
  if (m < 1) return t('dashboard.justNow');
  if (m < 60) return t('dashboard.minutesAgo', { count: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t('dashboard.hoursAgo', { count: h });
  const days = Math.floor(h / 24);
  return t('dashboard.daysAgo', { count: days });
}

/* ---------- API Fetch ---------- */

async function fetchJSON(url: string, token: string | null): Promise<any> {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url, { headers });
  if (!res.ok) return null;
  return res.json();
}

async function fetchDashboardData(token: string | null): Promise<DashboardData> {
  const [teamStatus, activityResp] = await Promise.all([
    fetchJSON('/api/team/status', token),
    fetchJSON('/api/activity/events?limit=200', token),
  ]);

  const allEvents: ActivityItem[] = Array.isArray(activityResp)
    ? activityResp
    : activityResp?.events || [];
  const events: ActivityItem[] = allEvents.filter(
    (e: ActivityItem) => e.type === 'task_completed' || e.type === 'task_failed',
  );

  const now = Date.now();
  const DAY = 86_400_000;
  const todayStart = new Date().setHours(0, 0, 0, 0);

  const summaryInput = teamStatus?.summary?.totalInputTokens || 0;
  const summaryOutput = teamStatus?.summary?.totalOutputTokens || 0;
  const summaryCacheRead = teamStatus?.summary?.totalCacheReadTokens || 0;
  const summaryCacheCreation = teamStatus?.summary?.totalCacheCreationTokens || 0;
  const totalTokens = summaryInput + summaryOutput + summaryCacheRead + summaryCacheCreation;
  const totalTasks = teamStatus?.summary?.totalTasks || 0;

  const byBot: BotTokenRow[] = [];
  if (Array.isArray(teamStatus?.bots)) {
    for (const bot of teamStatus.bots) {
      const st = bot.stats || {};
      const input = st.totalInputTokens || 0;
      const output = st.totalOutputTokens || 0;
      const cacheRead = st.totalCacheReadTokens || 0;
      const cacheCreation = st.totalCacheCreationTokens || 0;
      const botTotal = input + output + cacheRead + cacheCreation;
      if (botTotal > 0) {
        byBot.push({
          name: bot.name || bot.botName,
          totalTokens: botTotal,
          inputTokens: input,
          outputTokens: output,
        });
      }
    }
  }
  byBot.sort((a, b) => b.totalTokens - a.totalTokens);

  const completedEvents = events.filter(
    (e: ActivityItem) => e.type === 'task_completed',
  );
  const todayTokens = completedEvents
    .filter((e: ActivityItem) => e.timestamp >= todayStart)
    .reduce((sum: number, e: ActivityItem) => {
      return sum + (e.inputTokens || 0) + (e.outputTokens || 0) +
        (e.cacheReadTokens || 0) + (e.cacheCreationTokens || 0);
    }, 0);

  const trend: TokenTrendPoint[] = [];
  for (let i = 13; i >= 0; i--) {
    const dayStartNorm = new Date(now - i * DAY).setHours(0, 0, 0, 0);
    const dayEnd = dayStartNorm + DAY;
    const d = new Date(dayStartNorm);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const dayEvents = completedEvents.filter(
      (e: ActivityItem) => e.timestamp >= dayStartNorm && e.timestamp < dayEnd,
    );
    const input = dayEvents.reduce((s: number, e: ActivityItem) => s + (e.inputTokens || 0), 0);
    const output = dayEvents.reduce((s: number, e: ActivityItem) => s + (e.outputTokens || 0), 0);
    const cacheRead = dayEvents.reduce((s: number, e: ActivityItem) => s + (e.cacheReadTokens || 0), 0);
    const cacheCreation = dayEvents.reduce((s: number, e: ActivityItem) => s + (e.cacheCreationTokens || 0), 0);
    trend.push({
      date: `${mm}/${dd}`,
      input,
      output,
      cacheRead,
      cacheCreation,
      total: input + output + cacheRead + cacheCreation,
    });
  }

  const typeShare: TokenTypeShare[] = [
    { label: 'Input', value: summaryInput, color: '#60a5fa' },
    { label: 'Output', value: summaryOutput, color: '#34d399' },
    { label: 'Cache Read', value: summaryCacheRead, color: '#fbbf24' },
    { label: 'Cache Creation', value: summaryCacheCreation, color: '#f87171' },
  ].filter((t) => t.value > 0);

  return {
    overview: {
      totalTokens,
      todayTokens,
      totalTasks,
      avgTokensPerTask: totalTasks > 0 ? Math.round(totalTokens / totalTasks) : 0,
    },
    trend,
    byBot,
    typeShare,
    recentActivity: events.slice(0, 15),
  };
}

/* ---------- Sub-components ---------- */

function OverviewCards({ data }: { data: TokenOverview }) {
  const { t } = useTranslation();
  const cards = [
    { title: t('dashboard.totalTokens'), value: fmtTokens(data.totalTokens), unit: 'tokens' },
    { title: t('dashboard.todayTokens'), value: fmtTokens(data.todayTokens), unit: 'tokens' },
    { title: t('dashboard.totalTasks'), value: String(data.totalTasks), unit: 'tasks' },
    { title: t('dashboard.avgTokensPerTask'), value: fmtTokens(data.avgTokensPerTask), unit: 'tokens' },
  ];

  return (
    <div className={s.cardsGrid}>
      {cards.map((c) => (
        <div key={c.title} className={s.card}>
          <div className={s.cardTitle}>{c.title}</div>
          <div className={s.cardValue}>
            {c.value}
            <span className={s.cardUnit}>{c.unit}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function TrendChart({ points }: { points: TokenTrendPoint[] }) {
  const W = 600;
  const H = 200;
  const PAD_L = 52;
  const PAD_R = 12;
  const PAD_T = 8;
  const PAD_B = 28;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;

  const maxVal = Math.max(...points.map((p) => p.total), 100);
  const yMax = Math.ceil(maxVal * 1.15);

  const toX = (i: number) => PAD_L + (i / Math.max(points.length - 1, 1)) * plotW;
  const toY = (v: number) => PAD_T + plotH - (v / yMax) * plotH;

  const coords = points.map((p, i) => {
    const output = p.output;
    const input = output + p.input;
    const cacheRead = input + p.cacheRead;
    const cacheCreation = cacheRead + p.cacheCreation;
    return { x: toX(i), output, input, cacheRead, cacheCreation };
  });

  const makeArea = (topKey: 'output' | 'input' | 'cacheRead' | 'cacheCreation', bottomKey: 'output' | 'input' | 'cacheRead' | 'cacheCreation' | null) => {
    if (coords.length === 0) return '';
    const top = coords.map((c) => `${c.x},${toY(c[topKey])}`).join(' L');
    const bottom = bottomKey
      ? coords.map((c) => `${c.x},${toY(c[bottomKey])}`).reverse().join(' L')
      : `${coords[coords.length - 1].x},${PAD_T + plotH} L${coords[0].x},${PAD_T + plotH}`;
    return `M${top} L${bottom} Z`;
  };

  const yTicks = 4;
  const yLabels = Array.from({ length: yTicks + 1 }, (_, i) => {
    const val = (yMax / yTicks) * i;
    return { val, y: toY(val) };
  });

  const xLabels = points.filter((_, i) => i % 2 === 0 || points.length <= 7);

  return (
    <svg className={s.trendSvg} viewBox={`0 0 ${W} ${H}`}>
      <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={PAD_T + plotH} stroke="var(--glass-border)" />
      <line x1={PAD_L} y1={PAD_T + plotH} x2={W - PAD_R} y2={PAD_T + plotH} stroke="var(--glass-border)" />
      {yLabels.map((l) => (
        <g key={l.val}>
          <line x1={PAD_L} y1={l.y} x2={W - PAD_R} y2={l.y} stroke="var(--glass-border)" strokeDasharray="2 4" />
          <text x={PAD_L - 6} y={l.y + 4} textAnchor="end" fill="var(--text-2)" fontSize="10" fontFamily="var(--font-mono)">
            {fmtTokens(l.val)}
          </text>
        </g>
      ))}
      {xLabels.map((p) => {
        const idx = points.indexOf(p);
        const cx = toX(idx);
        return (
          <text key={p.date} x={cx} y={H - 4} textAnchor="middle" fill="var(--text-2)" fontSize="10" fontFamily="var(--font-mono)">
            {p.date}
          </text>
        );
      })}
      {coords.length > 1 && <path d={makeArea('cacheCreation', 'cacheRead')} fill="rgba(248,113,113,0.4)" />}
      {coords.length > 1 && <path d={makeArea('cacheRead', 'input')} fill="rgba(251,191,36,0.4)" />}
      {coords.length > 1 && <path d={makeArea('input', 'output')} fill="rgba(96,165,250,0.4)" />}
      {coords.length > 1 && <path d={makeArea('output', null)} fill="rgba(52,211,153,0.4)" />}
    </svg>
  );
}

function BreakdownChart({ items }: { items: BotTokenRow[] }) {
  const { t } = useTranslation();
  if (items.length === 0) return <div className={s.emptyText}>{t('dashboard.noData')}</div>;
  const maxTokens = Math.max(...items.map((i) => i.totalTokens), 1);
  return (
    <div>
      {items.map((item) => {
        const pct = (item.totalTokens / maxTokens) * 100;
        return (
          <div key={item.name} className={s.barRow}>
            <span className={s.barLabel}>{item.name}</span>
            <div className={s.barTrack}>
              <div className={s.barFill} style={{ width: `${pct}%` }} />
            </div>
            <span className={s.barValue}>{fmtTokens(item.totalTokens)}</span>
          </div>
        );
      })}
    </div>
  );
}

function TypePie({ shares }: { shares: TokenTypeShare[] }) {
  const { t } = useTranslation();
  if (shares.length === 0) return <div className={s.emptyText}>{t('dashboard.noData')}</div>;
  const total = shares.reduce((s, t) => s + t.value, 0);
  const CX = 60;
  const CY = 60;
  const R = 50;

  let cumulativeAngle = -90;
  const slices = shares.map((share) => {
    const angle = (share.value / total) * 360;
    const startAngle = cumulativeAngle;
    cumulativeAngle += angle;

    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (cumulativeAngle * Math.PI) / 180;
    const x1 = CX + R * Math.cos(startRad);
    const y1 = CY + R * Math.sin(startRad);
    const x2 = CX + R * Math.cos(endRad);
    const y2 = CY + R * Math.sin(endRad);
    const largeArc = angle > 180 ? 1 : 0;

    return {
      ...share,
      pct: ((share.value / total) * 100).toFixed(1),
      path: `M${CX},${CY} L${x1},${y1} A${R},${R} 0 ${largeArc} 1 ${x2},${y2} Z`,
    };
  });

  return (
    <div className={s.pieContainer}>
      <svg viewBox="0 0 120 120" className={s.pieSvg}>
        {slices.map((s) => (
          <path key={s.label} d={s.path} fill={s.color} stroke="var(--surface-1)" strokeWidth="1" />
        ))}
      </svg>
      <div className={s.pieLegend}>
        {shares.map((share) => (
          <div key={share.label} className={s.legendRow}>
            <span className={s.legendDot} style={{ background: share.color }} />
            <span className={s.legendLabel}>{share.label}</span>
            <span className={s.legendValue}>{fmtTokens(share.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActivityTypeIcon({ type }: { type: string }) {
  if (type === 'task_completed') return <span className={s.actIcon} data-type="ok">&#10003;</span>;
  if (type === 'task_failed') return <span className={s.actIcon} data-type="err">&#10007;</span>;
  return <span className={s.actIcon} data-type="run">&#9654;</span>;
}

/* ---------- Main Component ---------- */

export function DashboardView() {
  const { t } = useTranslation();
  const token = useStore(s => s.token);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const d = await fetchDashboardData(token);
      setData(d);
    } catch {
      setError(t('dashboard.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div className={s.root}>
        <div className={s.loading}>
          <span className={s.spinner} />
          {t('dashboard.loading')}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={s.root}>
        <div className={s.errorBox}>{error}</div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className={s.root}>
      <div className={s.header}>
        <div>
          <h1 className={s.title}>{t('dashboard.title')}</h1>
          <p className={s.subtitle}>{t('dashboard.subtitle')}</p>
        </div>
        <button className={s.refreshBtn} onClick={loadData} title={t('dashboard.refresh')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
          </svg>
        </button>
      </div>

      <OverviewCards data={data.overview} />

      <div className={s.chartContainer}>
        <div className={s.sectionTitle}>{t('dashboard.dailyTrend')}</div>
        <TrendChart points={data.trend} />
        <div className={s.trendLegend}>
          <span className={s.legendItem}><span className={s.legendDot} style={{ background: '#34d399' }} />Output</span>
          <span className={s.legendItem}><span className={s.legendDot} style={{ background: '#60a5fa' }} />Input</span>
          <span className={s.legendItem}><span className={s.legendDot} style={{ background: '#fbbf24' }} />Cache Read</span>
          <span className={s.legendItem}><span className={s.legendDot} style={{ background: '#f87171' }} />Cache Creation</span>
        </div>
      </div>

      <div className={s.breakdownGrid}>
        <div className={s.breakdownPanel}>
          <div className={s.sectionTitle}>{t('dashboard.botBreakdown')}</div>
          <BreakdownChart items={data.byBot} />
        </div>
        <div className={s.breakdownPanel}>
          <div className={s.sectionTitle}>{t('dashboard.tokenTypeShare')}</div>
          <TypePie shares={data.typeShare} />
        </div>
      </div>

      <div className={s.chartContainer}>
        <div className={s.sectionTitle}>{t('dashboard.recentTasks')}</div>
        {data.recentActivity.length === 0 ? (
          <div className={s.emptyText}>{t('dashboard.noActivity')}</div>
        ) : (
          <div className={s.activityList}>
            {data.recentActivity.map((item) => {
              const totalTk = (item.inputTokens || 0) + (item.outputTokens || 0) +
                (item.cacheReadTokens || 0) + (item.cacheCreationTokens || 0);
              return (
                <div key={item.id} className={s.actRow}>
                  <ActivityTypeIcon type={item.type} />
                  <div className={s.actContent}>
                    <span className={s.actBot}>{item.botName}</span>
                    {item.prompt && (
                      <span className={s.actPrompt}>{item.prompt.slice(0, 50)}</span>
                    )}
                  </div>
                  <div className={s.actMeta}>
                    {totalTk > 0 && (
                      <span className={s.actTokens}>{fmtTokens(totalTk)} tokens</span>
                    )}
                    {item.costUsd != null && item.costUsd > 0 && (
                      <span className={s.actCost}>{fmtCost(item.costUsd)}</span>
                    )}
                    {item.durationMs != null && (
                      <span className={s.actDur}>{fmtDuration(item.durationMs)}</span>
                    )}
                    <span className={s.actTime}>{relTime(item.timestamp, t)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
