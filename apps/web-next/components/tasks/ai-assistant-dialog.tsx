// R20 (2026-07-09): AI 任务编排助手 — 浮动面板版(不遮罩,看得到画布变化)。
// R21 (2026-07-09): 生成过程展示
//   - 生成中:分阶段动画(理解任务 → 拆解 → 选员工 → 连线 → 整理)
//   - 生成后:展示 AI 思考(explanation + 每节点 reason)
//   让用户看到 AI 怎么"想",而不只是一个 spinner。

"use client";

import * as React from "react";
import {
  Loader2,
  Sparkles,
  Wand2,
  X,
  GripVertical,
  CheckCircle2,
  RotateCcw,
  Trash2,
  Brain,
} from "lucide-react";

import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";

/** 节点最小结构(从 ai-generate 返回的 React Flow node 格式)。 */
interface AiGeneratedNode {
  id?: string;
  data?: {
    kind?: string;
    label?: string;
    refId?: string;
    reason?: string;
  };
}

/** Shape emitted by POST /api/v2/admin/pipelines/ai-generate. */
interface AiGenerateResponse {
  success?: boolean;
  nodes?: AiGeneratedNode[];
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
  /** 用户点"清空画布"时调用(由父组件实现)。 */
  onClearCanvas?: () => void;
}

const EXAMPLES = [
  "客户在飞书咨询产品,客服bot先回答常见问题,复杂问题转销售bot跟进,高意向时人工审批报价",
  "新线索进来,先查知识库匹配方案,生成报价单,人工审批后发邮件给客户",
  "每日定时抓取竞品价格,数据分析bot对比,异常时通知真人,真人确认后调整我方报价",
];

const MIN_LEN = 5;
const MAX_LEN = 2000;
const PANEL_W = 384;
const PANEL_H = 620;

/** 生成时的阶段文案 — 不是真流,是前端定时器推进,让用户看到 AI "在思考什么"。 */
const STAGES = [
  { emoji: "🧠", label: "理解任务目标" },
  { emoji: "📋", label: "拆解执行步骤" },
  { emoji: "🤖", label: "选择数字员工" },
  { emoji: "🔗", label: "生成节点连线" },
  { emoji: "✨", label: "整理编排结构" },
] as const;

const STAGE_INTERVAL_MS = 1500;

export function AiAssistantDialog({
  open,
  onOpenChange,
  onGenerate,
  onClearCanvas,
}: AiAssistantDialogProps) {
  const [description, setDescription] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [stage, setStage] = React.useState(0);
  /** 完整的最近一次生成结果 — 用于展示 explanation + 每节点 reason。 */
  const [lastGenerated, setLastGenerated] = React.useState<{
    explanation: string;
    nodes: AiGeneratedNode[];
    edgeCount: number;
  } | null>(null);

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
      setStage(0);
      setLastGenerated(null);
    }
  }, [open]);

  // 阶段推进定时器:生成中每 STAGE_INTERVAL_MS 推一格(最后一格停留)
  React.useEffect(() => {
    if (!loading) return;
    if (stage >= STAGES.length - 1) return;
    const t = setTimeout(() => setStage((s) => Math.min(STAGES.length - 1, s + 1)), STAGE_INTERVAL_MS);
    return () => clearTimeout(t);
  }, [loading, stage]);

  const generate = async () => {
    const text = description.trim();
    if (text.length < MIN_LEN) {
      setError("请详细描述任务目标(至少 5 个字)");
      return;
    }
    setLoading(true);
    setError(null);
    setLastGenerated(null);
    setStage(0);
    try {
      const r = await api<AiGenerateResponse>("/api/v2/admin/pipelines/ai-generate", {
        method: "POST",
        body: { description: text },
      });
      if (!r.success || !r.nodes) {
        throw new Error(r.error || r.message || "AI 生成失败");
      }
      onGenerate(r.nodes, r.edges || [], r.explanation || "");
      setLastGenerated({
        explanation: r.explanation || "",
        nodes: r.nodes,
        edgeCount: (r.edges || []).length,
      });
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

        {/* 生成中:阶段进度 */}
        {loading && <GenerationProgress stage={stage} />}

        {/* 生成完:展示 AI 思考 */}
        {!loading && lastGenerated && (
          <GenerationResult
            data={lastGenerated}
            onRegenerate={generate}
            onClearCanvas={onClearCanvas}
            disabledShort={tooShort}
          />
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
          {loading ? "生成中..." : lastGenerated ? "重新生成" : "生成编排"}
        </Button>
      </div>
    </div>
  );
}

// ── 子组件:生成中的阶段进度 ────────────────────────────────────────────────

function GenerationProgress({ stage }: { stage: number }) {
  const total = STAGES.length;
  const pct = Math.round(((stage + 1) / total) * 100);
  return (
    <div className="mt-3 rounded-md ring-1 ring-violet-200 bg-violet-50/50 dark:bg-violet-950/20 px-3 py-2.5 space-y-2">
      {/* 进度条 */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-violet-100 dark:bg-violet-900/40 overflow-hidden">
          <div
            className="h-full bg-violet-500 transition-all duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-[10px] text-violet-700 dark:text-violet-300 font-mono">
          {stage + 1}/{total}
        </span>
      </div>
      {/* 当前阶段 */}
      <div className="flex items-center gap-2 text-xs text-violet-900 dark:text-violet-100">
        <Brain className="size-3.5 animate-pulse" />
        <span className="font-medium">
          {STAGES[stage].emoji} {STAGES[stage].label}
          <AnimatedDots />
        </span>
      </div>
      {/* 历史阶段(已完成打勾) */}
      <ul className="space-y-0.5">
        {STAGES.map((s, i) => {
          const done = i < stage;
          const active = i === stage;
          return (
            <li
              key={i}
              className={`flex items-center gap-1.5 text-[11px] ${
                done
                  ? "text-emerald-700 dark:text-emerald-400"
                  : active
                    ? "text-violet-900 dark:text-violet-100"
                    : "text-muted-foreground/50"
              }`}
            >
              {done ? (
                <CheckCircle2 className="size-3" />
              ) : active ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <span className="size-3 inline-block" />
              )}
              <span>
                {s.emoji} {s.label}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** 三点动画 — 不用 CSS keyframes 的话用 React state 推进。 */
function AnimatedDots() {
  const [n, setN] = React.useState(0);
  React.useEffect(() => {
    const t = setInterval(() => setN((x) => (x + 1) % 4), 500);
    return () => clearInterval(t);
  }, []);
  return <span className="inline-block w-4 text-left">{".".repeat(n)}</span>;
}

// ── 子组件:生成完的思考展示 ────────────────────────────────────────────────

const KIND_EMOJI: Record<string, string> = {
  bot: "🤖",
  human: "👤",
  skill: "🔧",
  tool: "⚙️",
  conditional: "🔀",
  parallel: "⚡",
};

function GenerationResult({
  data,
  onRegenerate,
  onClearCanvas,
  disabledShort,
}: {
  data: { explanation: string; nodes: AiGeneratedNode[]; edgeCount: number };
  onRegenerate: () => void;
  onClearCanvas?: () => void;
  disabledShort: boolean;
}) {
  return (
    <div className="mt-3 space-y-2.5">
      {/* 完成条 */}
      <div className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 rounded-md">
        <CheckCircle2 className="size-3.5" />
        <span className="font-medium">
          生成完成 · {data.nodes.length} 节点 / {data.edgeCount} 连线
        </span>
      </div>

      {/* 任务理解 */}
      {data.explanation && (
        <div className="rounded-md ring-1 ring-foreground/10 bg-muted/20 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">
            🎯 任务理解
          </div>
          <p className="text-xs leading-relaxed text-foreground/90">
            {data.explanation}
          </p>
        </div>
      )}

      {/* 步骤拆解 */}
      <div className="rounded-md ring-1 ring-foreground/10 bg-muted/20 px-3 py-2">
        <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">
          📋 步骤拆解
        </div>
        <ol className="space-y-1.5">
          {data.nodes.map((n, i) => {
            const kind = n.data?.kind ?? "bot";
            const emoji = KIND_EMOJI[kind] ?? "·";
            return (
              <li key={n.id ?? i} className="flex items-start gap-2 text-xs">
                <span className="shrink-0 size-4 grid place-items-center rounded-full bg-foreground/5 text-[10px] font-mono text-muted-foreground mt-0.5">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <span>{emoji}</span>
                    <span className="font-mono text-[10px] px-1 rounded bg-foreground/5 text-muted-foreground">
                      {kind}
                    </span>
                    <span className="font-medium truncate">
                      {n.data?.label || n.id || `节点 ${i + 1}`}
                    </span>
                  </div>
                  {n.data?.reason && (
                    <p className="text-[11px] text-muted-foreground leading-snug mt-0.5 pl-5">
                      {n.data.reason}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {/* 提示 + 操作 */}
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <span>🔗 已在画布渲染,可拖拽微调</span>
      </div>
      <div className="flex gap-1.5">
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-[11px] flex-1"
          onClick={onRegenerate}
          disabled={disabledShort}
        >
          <RotateCcw className="size-3 mr-1" />
          重新生成
        </Button>
        {onClearCanvas && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px] flex-1 hover:text-rose-600 hover:ring-rose-200"
            onClick={onClearCanvas}
          >
            <Trash2 className="size-3 mr-1" />
            清空画布
          </Button>
        )}
      </div>
    </div>
  );
}

export default AiAssistantDialog;
