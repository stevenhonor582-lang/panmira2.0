import { useMemo } from 'react';
import type { ActivityEvent } from '../../types';
import { formatDuration } from '../../utils/helpers';
import s from './ActivityTimeline.module.css';

function formatTime(ts: number | string): string {
  const n = typeof ts === 'string' ? Number(ts) : ts;
  if (!n || isNaN(n)) return '—';
  const d = new Date(n);
  if (isNaN(d.getTime())) return '—';
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const time = `${hh}:${mm}`;
  if (isToday) return `今天 ${time}`;
  return `${d.getMonth() + 1}月${d.getDate()}日 ${time}`;
}

function EventIcon({ type }: { type: ActivityEvent['type'] }) {
  if (type === 'task_completed') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    );
  }
  if (type === 'task_failed') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-error, #ef4444)" strokeWidth="2.5" strokeLinecap="round">
        <path d="M18 6L6 18M6 6l12 12" />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

interface Props {
  events: ActivityEvent[];
  botFilter?: string;
}

export function ActivityTimeline({ events, botFilter }: Props) {
  const safeEvents = Array.isArray(events) ? events : [];
  const filtered = useMemo(() => {
    if (!botFilter) return safeEvents;
    return safeEvents.filter((e) => e.botName === botFilter);
  }, [safeEvents, botFilter]);

  if (filtered.length === 0) {
    return (
      <div className={s.empty}>
        <span className={s.emptyText}>暂无活动记录</span>
      </div>
    );
  }

  return (
    <div className={s.timeline}>
      {filtered.map((event) => (
        <div key={event.id} className={`${s.event} ${s[event.type]}`}>
          <div className={s.iconCol}>
            <EventIcon type={event.type} />
            <div className={s.line} />
          </div>
          <div className={s.content}>
            <div className={s.header}>
              <span className={s.botName}>{event.botName}</span>
              <span className={s.time}>{formatTime(event.timestamp)}</span>
            </div>
            {event.prompt && (
              <div className={s.prompt}>{event.prompt.slice(0, 100)}</div>
            )}
            <div className={s.meta}>
              {event.durationMs != null && (
                <span className={s.metaItem}>{formatDuration(event.durationMs)}</span>
              )}
              {event.errorMessage && (
                <span className={`${s.metaItem} ${s.errorMsg}`}>
                  {event.errorMessage.slice(0, 60)}
                </span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
