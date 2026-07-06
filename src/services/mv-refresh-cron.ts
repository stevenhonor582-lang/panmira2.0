/**
 * Plan D MV 物化视图定时刷新
 * 每 N 分钟调 refresh_daily_usage() SQL 函数
 * 启动时立即 refresh 一次 (避免重启后长时间无数据)
 */
import { pool } from '../db/index.js';

let currentTimer: NodeJS.Timeout | null = null;
let isRefreshing = false;

async function refreshOnce(): Promise<void> {
  if (isRefreshing) return;
  isRefreshing = true;
  try {
    await pool.query('SELECT refresh_daily_usage()');
  } catch (err) {
    console.error('[mv-refresh-cron] refresh failed', (err as Error).message);
  } finally {
    isRefreshing = false;
  }
}

export function startMvRefreshCron(intervalMs?: number): NodeJS.Timeout {
  const envMs = process.env.MV_REFRESH_MS ? Number(process.env.MV_REFRESH_MS) : 0;
  const ms = intervalMs ?? (envMs || 5 * 60 * 1000);
  // 立即 refresh 一次
  refreshOnce().catch(() => { /* swallow */ });
  const timer = setInterval(() => {
    refreshOnce().catch(() => { /* swallow */ });
  }, ms);
  // 不阻止进程退出
  if (typeof timer.unref === 'function') timer.unref();
  currentTimer = timer;
  console.log(`[mv-refresh-cron] started, interval=${ms}ms`);
  return timer;
}

export function stopMvRefreshCron(timer?: NodeJS.Timeout): void {
  const t = timer || currentTimer;
  if (t) {
    clearInterval(t);
    if (t === currentTimer) currentTimer = null;
  }
}

export { refreshOnce };
