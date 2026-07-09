"use client";

/**
 * L7: WebSocket subscription for pipeline_progress events.
 *
 * Connects to /ws and listens for messages with type='pipeline_progress'.
 * Filters by pipelineId so multiple pipelines can coexist.
 *
 * L10: Optional botId filter so an admin watching one bot's activity
 *      does not get flooded by events from other bots. State now also
 *      surfaces botId / chatId from the event so the UI can render the
 *      trigger context (e.g. "bot=feishu-main / chat=oc_xxx").
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
  /** L10: Bot that triggered this run (Feishu/Telegram bot name). null = not bot-triggered. */
  botId: string | null;
  /** L10: Chat / conversation ID where the run was triggered. */
  chatId: string | null;
  /**
   * R22: 每节点的最新执行状态(WS payload 直接推)。
   * 后端 emitPipelineProgress 在每步 onNodeUpdate 时把 merged nodeStates 一起广播,
   * 客户端 execution-log / shape-config 可以零额外 REST 直接显示 input/output。
   */
  nodeStates?: Record<string, NodeRunStateLike>;
}

/** 与后端 NodeState jsonb + node-run-details.ts NodeRunState 对齐。 */
export interface NodeRunStateLike {
  status?: string;
  input?: unknown;
  output?: unknown;
  error?: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  tokensUsed?: number;
  approval?: string;
  note?: string;
  decidedBy?: string;
}

export interface UsePipelineProgressOptions {
  /**
   * 若设置,只接受 botId 匹配的事件(过滤其他 bot 的进度)。
   * 不设置 = 不过滤。
   */
  botId?: string;
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
  botId: null,
  chatId: null,
  nodeStates: undefined,
};

function deriveWsUrl(): string | null {
  if (typeof window === "undefined") return null;
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  // Pass JWT token via query string (WS server expects ?token=)
  const token = window.localStorage.getItem("panmira.token");
  const qs = token ? `?token=${encodeURIComponent(token)}` : "";
  return `${proto}//${window.location.host}/ws${qs}`;
}

export function usePipelineProgress(
  pipelineId: string,
  opts?: UsePipelineProgressOptions,
): UsePipelineProgressResult {
  const botIdFilter = opts?.botId;
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
            // L10: 按 bot 过滤,空 botId 永远不匹配(避免 admin 视图混进全局事件)
            if (botIdFilter !== undefined) {
              const evBotId = (msg.botId ?? null) as string | null;
              if (evBotId !== botIdFilter) return;
            }
            setState({
              runId: msg.runId ?? null,
              status: msg.status ?? null,
              currentNodeId: msg.currentNodeId ?? null,
              completedNodes: Number(msg.completedNodes ?? 0),
              totalNodes: Number(msg.totalNodes ?? 0),
              progress: Math.max(0, Math.min(100, Number(msg.progress ?? 0))),
              error: msg.error ?? null,
              lastUpdate: msg.ts ?? new Date().toISOString(),
              botId: (msg.botId ?? null) as string | null,
              chatId: (msg.chatId ?? null) as string | null,
              // R22: 后端 R22 起把 merged nodeStates 一起广播(每节点 onNodeUpdate 时)。
              nodeStates:
                msg.nodeStates && typeof msg.nodeStates === "object"
                  ? (msg.nodeStates as Record<string, NodeRunStateLike>)
                  : undefined,
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
    // botIdFilter participates in identity so changes take effect on reconnect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipelineId, botIdFilter]);

  return { state, wsConnected };
}
