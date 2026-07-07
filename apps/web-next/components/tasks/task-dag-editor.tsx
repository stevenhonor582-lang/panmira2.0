// Stub for TaskDagEditor - tldraw-based DAG editor,待 P3.x 接入
"use client";

import { Construction } from "lucide-react";

interface Props {
  pipelineId?: string;
  initialValue?: unknown;
  onChange?: (value: unknown) => void;
  readOnly?: boolean;
}

/**
 * P3.x 待接入:tldraw + 自定义 node-shapes 实现可视化 DAG 编辑。
 * 当前给一个 placeholder,避免 pages 编译失败。
 */
export function TaskDagEditor({ readOnly }: Props) {
  return (
    <div className="h-[640px] grid place-items-center border border-dashed border-border rounded-xl bg-muted/20 text-sm text-muted-foreground gap-3">
      <Construction className="size-6 opacity-50" />
      <div>
        <div className="font-medium">DAG 编辑器</div>
        <div className="text-xs mt-1">
          {readOnly ? "只读视图待接入" : "可视化编排待 P3.x 接入"}
        </div>
      </div>
    </div>
  );
}

export default TaskDagEditor;
