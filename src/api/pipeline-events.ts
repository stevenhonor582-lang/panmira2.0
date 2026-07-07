/**
 * L7: Pipeline progress broadcast via WebSocket
 *
 * pipeline-routes 异步触发 pipeline 后,通过这里把节点进度推给所有 WS 客户端。
 * 客户端订阅 type='pipeline_progress' 消息,可以实时看到节点切换 / 完成 / 失败。
 *
 * L10: 事件支持 bot 触发的会话上下文(botId / chatId / triggeredBy),
 *      让前端可以按 bot 或 chat 过滤进度。
 */
import type { WebSocketHandle } from '../web/ws-server.js';

let wsHandle: WebSocketHandle | undefined;

export function setPipelineWsHandle(handle: WebSocketHandle | undefined): void {
  wsHandle = handle;
}

export interface PipelineProgressEvent {
  type: 'pipeline_progress';
  runId: string;
  pipelineId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'timeout' | 'cancelled';
  currentNodeId: string | null;
  /** 已完成节点数 */
  completedNodes: number;
  /** 总节点数 */
  totalNodes: number;
  /** 0-100 整体进度百分比 */
  progress: number;
  /** 该 run 的最新错误(只在 failed 时有) */
  error?: string;
  // ---- L10: bot-triggered run 上下文 ----
  /** 触发该 run 的 bot 名称(Feishu bot / Telegram bot)。 */
  botId?: string;
  /** 触发该 run 的会话 ID(Feishu chatId / Telegram chatId)。 */
  chatId?: string;
  /** 触发来源,与 RunTrigger.triggeredBy 同义 */
  triggeredBy?: 'user' | 'bot' | 'cron' | 'event' | 'api';
  /** ISO timestamp */
  ts: string;
}

/**
 * 计算 nodeStates → { completedNodes, progress }。
 * 客户端可复用同一份实现,避免每个 caller 各算各的导致口径不一致。
 */
export function computeNodeProgress(
  nodeStates: Record<string, { status?: string } | undefined>,
  totalNodes: number,
): { completedNodes: number; progress: number } {
  if (totalNodes <= 0) return { completedNodes: 0, progress: 0 };
  let completedNodes = 0;
  for (const k in nodeStates) {
    const s = nodeStates[k]?.status;
    if (s === 'success' || s === 'failed' || s === 'skipped') completedNodes++;
  }
  const progress = Math.min(100, Math.round((completedNodes / totalNodes) * 100));
  return { completedNodes, progress };
}

/** Broadcast pipeline progress to all connected WS clients. WS 失败不影响 pipeline 执行。 */
export function broadcastPipelineProgress(ev: PipelineProgressEvent): void {
  if (!wsHandle) return;
  if (wsHandle.clientCount() === 0) return;
  try {
    wsHandle.broadcastAll(ev as unknown as Record<string, unknown>);
  } catch (e) {
    console.warn('[pipeline-events] broadcast failed:', (e as Error).message);
  }
}
