// Generic fetch hook for IA v6 Channels module.
// Returns { data, loading, error, refresh }.
//
// If the endpoint returns 404 (no backend wiring), `data` is null
// and `error.code === "not_implemented"`. Pages render a graceful
// empty state in that case instead of crashing.

"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "";
function fullPath(p: string): string {
  if (!API_BASE) return p;
  if (p.startsWith("http")) return p;
  return API_BASE + p;
}

export interface FetchState<T> {
  data: T | null;
  loading: boolean;
  error: { code: string; message: string } | null;
  refresh: () => void;
}

export function useFetch<T = any>(url: string | null): FetchState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(!!url);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!url) {
      setData(null);
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    setError(null);
    api<any>(fullPath(url))
      .then((res) => {
        if (!alive) return;
        setData(res as T);
      })
      .catch((e: any) => {
        if (!alive) return;
        // 404 → "not_implemented" — backend hasn't wired this endpoint yet.
        const isNotImpl =
          e?.status === 404 ||
          e?.code === "not_found" ||
          String(e?.message ?? "").includes("404");
        setError(
          isNotImpl
            ? { code: "not_implemented", message: "后端未实装此端点" }
            : { code: "fetch_error", message: String(e?.message ?? e) },
        );
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [url, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, error, refresh };
}
