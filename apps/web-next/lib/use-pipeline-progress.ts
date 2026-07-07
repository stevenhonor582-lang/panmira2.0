"use client";

/**
 * L7: WebSocket subscription for pipeline_progress events.
 *
 * Connects to /ws and listens for messages with type='pipeline_progress'.
 * Filters by pipelineId so multiple pipelines can coexist.
 *
 * Falls back gracefully: if WS is unavailable, returns initial state with wsConnected=false.
 * The component can then optionally show a "polling fallback" message.
 */
import { useEffect, useRef, useState } from "react";

export interface PipelineProgressState {
  /** Current run id we're tracking (null = no active run) */
  runId: string | null;
  status: "pending" | "running" | "completed" | "failed" | "timeout" | "cancelled" | null;
  currentNodeId: string | null;
  completedNodes: number;
  totalNodes: number;
  progress: number; // 0-100
  error: string | null;
  /** ISO timestamp of last update */
  lastUpdate: string | null;
}

export interface UsePipelineProgressResult {
  state: PipelineProgressState;
  wsConnected: boolean;
}

const INITIAL: PipelineProgressState = {
  runId: null,
  status: null,
  currentNodeId: null,
  completedNodes: 0,
  totalNodes: 0,
  progress: 0,
  error: null,
  lastUpdate: null,
};

function deriveWsUrl(): string | null {
  if (typeof window === "undefined") return null;
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  // Pass JWT token via query string (WS server expects ?token=)
  const token = window.localStorage.getItem("panmira.token");
  const qs = token ? `?token=${encodeURIComponent(token)}` : "";
  return `${proto}//${window.location.host}/ws${qs}`;
}

export function usePipelineProgress(pipelineId: string): UsePipelineProgressResult {
  const [state, setState] = useState<PipelineProgressState>(INITIAL);
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const url = deriveWsUrl();
    if (!url) return;

    let cancelled = false;

    function connect() {
      if (cancelled) return;
      try {
        const ws = new WebSocket(url!);
        wsRef.current = ws;

        ws.onopen = () => setWsConnected(true);
        ws.onclose = () => {
          setWsConnected(false);
          // simple backoff reconnect
          if (!cancelled) {
            reconnectTimer.current = setTimeout(connect, 2000);
          }
        };
        ws.onerror = () => {
          // onclose will fire next; let it handle reconnect
        };
        ws.onmessage = (evt) => {
          try {
            const msg = JSON.parse(evt.data);
            if (msg?.type !== "pipeline_progress") return;
            if (msg.pipelineId !== pipelineId) return;
            setState({
              runId: msg.runId ?? null,
              status: msg.status ?? null,
              currentNodeId: msg.currentNodeId ?? null,
              completedNodes: Number(msg.completedNodes ?? 0),
              totalNodes: Number(msg.totalNodes ?? 0),
              progress: Math.max(0, Math.min(100, Number(msg.progress ?? 0))),
              error: msg.error ?? null,
              lastUpdate: msg.ts ?? new Date().toISOString(),
            });
          } catch {
            // ignore malformed messages
          }
        };
      } catch {
        setWsConnected(false);
      }
    }

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [pipelineId]);

  return { state, wsConnected };
}