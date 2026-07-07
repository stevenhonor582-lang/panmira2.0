"use client";

/**
 * L7: Pipeline progress bar component.
 *
 * Renders a thin progress bar at the top of a pipeline detail page.
 * Subscribes to /ws for real-time progress updates.
 *
 * States:
 *  - No active run: shows nothing (or a faint "ready" line if showIdle)
 *  - Pending/Running: progress bar + node counter + current node label
 *  - Completed: green check + duration (auto-hides after 3s)
 *  - Failed: red bar + error message
 */
import { usePipelineProgress } from "@/lib/use-pipeline-progress";
import { useEffect, useState } from "react";

interface PipelineProgressProps {
  pipelineId: string;
  showIdle?: boolean;
}

const STATUS_COLOR: Record<string, string> = {
  pending: "bg-yellow-500",
  running: "bg-blue-500",
  completed: "bg-green-500",
  failed: "bg-red-500",
  timeout: "bg-orange-500",
  cancelled: "bg-gray-500",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "排队中",
  running: "执行中",
  completed: "已完成",
  failed: "失败",
  timeout: "超时",
  cancelled: "已取消",
};

export function PipelineProgress({ pipelineId, showIdle = false }: PipelineProgressProps) {
  const { state, wsConnected } = usePipelineProgress(pipelineId);
  const [hideCompleted, setHideCompleted] = useState(false);

  // Auto-hide 3s after completion
  useEffect(() => {
    if (state.status === "completed") {
      const t = setTimeout(() => setHideCompleted(true), 3000);
      return () => clearTimeout(t);
    }
    setHideCompleted(false);
    return undefined;
  }, [state.status, state.lastUpdate]);

  if (!state.status) {
    if (!showIdle) return null;
    return (
      <div className="text-xs text-muted-foreground flex items-center gap-2">
        <span className="inline-block w-2 h-2 rounded-full bg-gray-300" />
        待执行
        {!wsConnected && <span className="text-orange-500">(WS 未连接)</span>}
      </div>
    );
  }

  if (hideCompleted && state.status === "completed") return null;

  const color = STATUS_COLOR[state.status] ?? "bg-gray-500";
  const label = STATUS_LABEL[state.status] ?? state.status;

  return (
    <div className="w-full space-y-1" data-testid="pipeline-progress">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <span className="font-medium">{label}</span>
          {state.totalNodes > 0 && (
            <span className="text-muted-foreground">
              {state.completedNodes}/{state.totalNodes} 节点
            </span>
          )}
          {state.currentNodeId && state.status === "running" && (
            <span className="text-blue-600 font-mono">{state.currentNodeId}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono">{state.progress}%</span>
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              wsConnected ? "bg-green-500" : "bg-orange-500"
            }`}
            title={wsConnected ? "WebSocket 已连接" : "WebSocket 未连接"}
          />
        </div>
      </div>
      <div className="w-full h-2 bg-gray-200 rounded overflow-hidden">
        <div
          className={`h-full ${color} transition-all duration-300`}
          style={{ width: `${state.progress}%` }}
        />
      </div>
      {state.error && state.status === "failed" && (
        <div className="text-xs text-red-600 font-mono mt-1">{state.error}</div>
      )}
    </div>
  );
}