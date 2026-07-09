// R20 (2026-07-09): AI 任务编排助手 — 浮动面板版(不遮罩,看得到画布变化)。
// User describes a task in natural language; the backend
// /api/v2/admin/pipelines/ai-generate endpoint calls the default LLM
// and returns React Flow nodes/edges. Panel floats right so the canvas
// stays visible — user watches nodes appear as AI generates.

"use client";

import * as React from "react";
import { Loader2, Sparkles, Wand2, X, GripVertical } from "lucide-react";

import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";

/** Shape emitted by POST /api/v2/admin/pipelines/ai-generate. */
interface AiGenerateResponse {
  success?: boolean;
  nodes?: unknown[];
  edges?: unknown[];
  explanation?: string;
  error?: string;
  message?: string;
}

interface AiAssistantDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Receives the generated graph (already in React Flow format). */
  onGenerate: (nodes: unknown[], edges: unknown[], explanation: string) => void;
}

const EXAMPLES = [
  "客户在飞书咨询产品,客服bot先回答常见问题,复杂问题转销售bot跟进,高意向时人工审批报价",
  "新线索进来,先查知识库匹配方案,生成报价单,人工审批后发邮件给客户",
  "每日定时抓取竞品价格,数据分析bot对比,异常时通知真人,真人确认后调整我方报价",
];

const MIN_LEN = 5;
const MAX_LEN = 2000;
const PANEL_W = 384;
const PANEL_H = 560;

export function AiAssistantDialog({ open, onOpenChange, onGenerate }: AiAssistantDialogProps) {
  const [description, setDescription] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [lastResult, setLastResult] = React.useState<string | null>(null);

  // 浮动位置(可拖动),默认右上角
  const [pos, setPos] = React.useState({ x: 0, y: 0 });
  const dragging = React.useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);

  // 初始化位置(右侧,首次打开)
  React.useEffect(() => {
    if (open && pos.x === 0 && pos.y === 0 && typeof window !== "undefined") {
      setPos({ x: window.innerWidth - PANEL_W - 16, y: 64 });
    }
  }, [open, pos]);

  // 拖动处理
  React.useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!dragging.current) return;
      const d = dragging.current;
      setPos({
        x: Math.max(8, Math.min(window.innerWidth - PANEL_W - 8, d.ox + (e.clientX - d.sx))),
        y: Math.max(8, Math.min(window.innerHeight - 120, d.oy + (e.clientY - d.sy))),
      });
    };
    const up = () => { dragging.current = null; };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, []);

  // Reset state each time the dialog opens.
  React.useEffect(() => {
    if (open) {
      setDescription("");
      setError(null);
      setLoading(false);
      setLastResult(null);
    }
  }, [open]);

  const generate = async () => {
    const text = description.trim();
    if (text.length < MIN_LEN) {
      setError("请详细描述任务目标(至少 5 个字)");
      return;
    }
    setLoading(true);
    setError(null);
    setLastResult(null);
    try {
      const r = await api<AiGenerateResponse>("/api/v2/admin/pipelines/ai-generate", {
        method: "POST",
        body: { description: text },
      });
      if (!r.success || !r.nodes) {
        throw new Error(r.error || r.message || "AI 生成失败");
      }
      onGenerate(r.nodes, r.edges || [], r.explanation || "");
      // 生成后保持面板开启 — 用户能看画布变化 + 重新生成。不自动关。
      setLastResult(`✓ 已生成 ${r.nodes.length} 节点 / ${(r.edges || []).length} 连线`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  // Close on Escape (unless generating).
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" && !loading) onOpenChange(false);
  };

  if (!open) return null;
  const tooShort = description.trim().length < MIN_LEN;

  return (
    // 浮动面板:不遮罩(fixed 定位,无 bg-black/50 overlay),用户看得到画布
    <div
      className="fixed z-40 flex flex-col rounded-xl bg-card/95 backdrop-blur ring-1 ring-foreground/10 shadow-2xl"
      style={{ left: pos.x, top: pos.y, width: PANEL_W, maxHeight: PANEL_H }}
      onKeyDown={onKeyDown}
    >
      {/* 标题栏(可拖动) */}
      <div
        onPointerDown={(e) => {
          dragging.current = { sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y };
        }}
        className="flex items-center gap-2 px-4 py-3 border-b cursor-move select-none"
      >
        <GripVertical className="size-4 text-muted-foreground/50" />
        <Wand2 className="size-4 text-violet-500" />
        <h2 className="text-sm font-semibold flex-1">AI 任务编排助手</h2>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          disabled={loading}
          className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          aria-label="关闭"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <p className="text-xs text-muted-foreground mb-2.5">
          描述任务目标 + 怎么做,AI 自动生成编排(画布实时可见),你再微调。
        </p>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value.slice(0, MAX_LEN))}
          placeholder="例如:客户咨询飞书消息进来,客服bot先回答,复杂问题转销售bot,高意向人工审批报价..."
          rows={4}
          disabled={loading}
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 resize-none"
        />
        <div className="text-[11px] text-muted-foreground mt-1 text-right">
          {description.length}/{MAX_LEN}
        </div>

        {/* 示例(可折叠,省空间) */}
        <details className="mt-2.5 group">
          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground list-none flex items-center gap-1">
            <span className="group-open:rotate-90 transition-transform">▸</span>
            💡 示例(点击填入)
          </summary>
          <div className="flex flex-col gap-1.5 mt-2">
            {EXAMPLES.map((ex, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setDescription(ex)}
                disabled={loading}
                className="text-left text-xs px-2.5 py-1.5 rounded-md bg-muted/50 hover:bg-muted text-muted-foreground transition-colors disabled:opacity-50"
              >
                {ex}
              </button>
            ))}
          </div>
        </details>

        {error && (
          <div className="mt-3 text-xs text-rose-600 bg-rose-50 dark:bg-rose-950/30 px-3 py-2 rounded-md break-words">
            {error}
          </div>
        )}

        {lastResult && !loading && (
          <div className="mt-3 text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 rounded-md">
            {lastResult} — 可在画布微调,或修改描述后重新生成。
          </div>
        )}
      </div>

      {/* 底部操作 */}
      <div className="flex justify-end gap-2 px-4 py-3 border-t bg-muted/10">
        <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={loading}>
          关闭
        </Button>
        <Button size="sm" onClick={generate} disabled={loading || tooShort}>
          {loading ? (
            <Loader2 className="size-3.5 animate-spin mr-1.5" />
          ) : (
            <Sparkles className="size-3.5 mr-1.5" />
          )}
          {loading ? "生成中..." : "生成编排"}
        </Button>
      </div>
    </div>
  );
}

export default AiAssistantDialog;
