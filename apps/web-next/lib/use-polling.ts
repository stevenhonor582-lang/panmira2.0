"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export interface UsePollingOptions<T> {
  /** 拉取函数 */
  fetcher: () => Promise<T>;
  /** 间隔 ms,默认 60000 */
  intervalMs?: number;
  /** 暂停标志(切到其他 tab / 路由) */
  enabled?: boolean;
  /** 错误回调 */
  onError?: (err: unknown) => void;
}

export interface UsePollingResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  /** 上次拉取时间戳(ms) */
  lastFetched: number | null;
  /** 手动刷新 */
  refresh: () => void;
  /** 距下次拉取的秒数 */
  nextIn: number;
}

/**
 * 通用轮询 hook
 *  - 自动间隔拉取
 *  - 切到其他 tab 自动暂停(节省资源)
 *  - 手动 refresh
 *  - 显示倒计时
 */
export function usePolling<T>({
  fetcher,
  intervalMs = 60000,
  enabled = true,
  onError,
}: UsePollingOptions<T>): UsePollingResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [lastFetched, setLastFetched] = useState<number | null>(null);
  const [nextIn, setNextIn] = useState(Math.floor(intervalMs / 1000));
  const fetcherRef = useRef(fetcher);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isVisibleRef = useRef(true);

  // 更新 fetcher ref(避免 stale closure)
  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetcherRef.current();
      setData(result);
      setError(null);
      setLastFetched(Date.now());
      setNextIn(Math.floor(intervalMs / 1000));
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      onError?.(err);
    } finally {
      setLoading(false);
    }
  }, [intervalMs, onError]);

  // 页面可见性监听
  useEffect(() => {
    const handle = () => {
      isVisibleRef.current = document.visibilityState === "visible";
    };
    document.addEventListener("visibilitychange", handle);
    handle();
    return () => document.removeEventListener("visibilitychange", handle);
  }, []);

  // 主轮询循环
  useEffect(() => {
    if (!enabled) return;
    // 立即拉一次
    refresh();
    // 每 intervalMs 拉
    timerRef.current = setInterval(() => {
      if (isVisibleRef.current) refresh();
    }, intervalMs);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [enabled, intervalMs, refresh]);

  // 倒计时(每秒更新)
  useEffect(() => {
    tickRef.current = setInterval(() => {
      setNextIn((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  return { data, loading, error, lastFetched, refresh, nextIn };
}
