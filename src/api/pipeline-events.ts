/**
 * L7: Pipeline progress broadcast via WebSocket
 *
 * pipeline-routes 异步触发 pipeline 后,通过这里把节点进度推给所有 WS 客户端。
 * 客户端订阅 type='pipeline_progress' 消息,可以实时看到节点切换 / 完成 / 失败。
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
  /** ISO timestamp */
  ts: string;
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
