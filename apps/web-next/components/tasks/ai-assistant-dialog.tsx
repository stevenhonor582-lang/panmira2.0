// R20 (2026-07-09): AI 任务编排助手 modal.
// User describes a task in natural language; the backend
// /api/v2/admin/pipelines/ai-generate endpoint calls the default LLM
// (DeepSeek-V4 via callLlm) and returns React Flow nodes/edges. The user
// then fine-tunes the generated DAG on the canvas.
//
// node.data matches DagNodeMeta (types.ts): bot references use `refId`
// (the agents.id), which the ShapeConfigPanel agent picker resolves.

"use client";

import * as React from "react";
import { Loader2, Sparkles, Wand2 } from "lucide-react";

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

export function AiAssistantDialog({ open, onOpenChange, onGenerate }: AiAssistantDialogProps) {
  const [description, setDescription] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Reset state each time the dialog opens.
  React.useEffect(() => {
    if (open) {
      setDescription("");
      setError(null);
      setLoading(false);
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
    try {
      const r = await api<AiGenerateResponse>("/api/v2/admin/pipelines/ai-generate", {
        method: "POST",
        body: { description: text },
      });
      if (!r.success || !r.nodes) {
        throw new Error(r.error || r.message || "AI 生成失败");
      }
      onGenerate(r.nodes, r.edges || [], r.explanation || "");
      onOpenChange(false);
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
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 backdrop-blur-sm p-4"
      onKeyDown={onKeyDown}
    >
      <div className="w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 shadow-xl flex flex-col">
        <div className="flex items-center gap-2 px-5 py-4 border-b">
          <Wand2 className="size-5 text-violet-500" />
          <h2 className="text-base font-semibold">AI 任务编排助手</h2>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="text-sm text-muted-foreground mb-3">
            用自然语言描述你想做什么 + 怎么做,AI 自动生成编排,你再在画布上微调。
          </p>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, MAX_LEN))}
            placeholder="例如:客户咨询飞书消息进来,客服bot先回答,复杂问题转销售bot,高意向人工审批报价..."
            rows={5}
            disabled={loading}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 resize-none"
          />
          <div className="text-[11px] text-muted-foreground mt-1 text-right">
            {description.length}/{MAX_LEN}
          </div>

          <div className="mt-3">
            <div className="text-xs text-muted-foreground mb-1.5">💡 示例(点击填入):</div>
            <div className="flex flex-col gap-1.5">
              {EXAMPLES.map((ex, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setDescription(ex)}
                  disabled={loading}
                  className="text-left text-xs px-3 py-1.5 rounded-md bg-muted/50 hover:bg-muted text-muted-foreground transition-colors disabled:opacity-50"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="mt-3 text-sm text-rose-600 bg-rose-50 dark:bg-rose-950/30 px-3 py-2 rounded-md break-words">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t bg-muted/10">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            取消
          </Button>
          <Button onClick={generate} disabled={loading || tooShort}>
            {loading ? (
              <Loader2 className="size-4 animate-spin mr-1.5" />
            ) : (
              <Sparkles className="size-4 mr-1.5" />
            )}
            {loading ? "AI 生成中..." : "生成编排"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default AiAssistantDialog;
