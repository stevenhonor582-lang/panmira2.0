export function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function relTime(ts: number): string {
  const d = Date.now() - ts;
  const m = Math.floor(d / 60_000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d`;
  return new Date(ts).toLocaleDateString();
}

export function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const min = Math.floor(s / 60);
  if (min < 60) return `${min}m ${s % 60}s`;
  const hr = Math.floor(min / 60);
  return `${hr}h ${min % 60}m`;
}

export const AVATAR_COLORS = [
  '#00d68f', '#00b4d8', '#22c55e', '#14b8a6', '#06b6d4',
  '#10b981', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899',
];

export const GRADIENT_PAIRS = [
  ['#00d68f', '#00b876'],
  ['#00c9a7', '#00a88a'],
  ['#00b4d8', '#0096c7'],
  ['#22c55e', '#16a34a'],
  ['#14b8a6', '#0d9488'],
  ['#00d68f', '#059669'],
  ['#10b981', '#00d68f'],
  ['#06b6d4', '#0891b2'],
  ['#00c9a7', '#14b8a6'],
  ['#22c55e', '#00d68f'],
];
