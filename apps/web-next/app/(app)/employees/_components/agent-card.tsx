"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { Agent } from "../_lib/data";
import { updateAgent } from "../_lib/data";
import { AvatarMark, statusTone } from "./avatar-mark";
import {
  MoreVertical, Pause, Play, Archive, FileText, Bot, Loader2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

const ROLE_LABEL: Record<string, string> = {
  "full-stack-engineer": "全栈工程",
  "copywriting-secretary": "文案秘书",
  "ops-engineer": "运维部署",
  general: "通用对话",
  "test-bot": "端到端测试",
  engineering: "工程(legacy)",
  "customer-support": "客服一线",
  "research-analyst": "调研分析",
};

// R17-3: 卡片统一尺寸 — 不再有 feature/tall/wide 区分
// 保留 AgentCardSize 类型仅为向后兼容,所有尺寸渲染相同内容
export type AgentCardSize = "feature" | "tall" | "wide" | "regular" | "compact";

export function AgentCard({
  agent,
  size = "regular",
  showManageActions = false,
  onChanged,
  isTemplateTab = false,
}: {
  agent: Agent;
  size?: AgentCardSize;
  showManageActions?: boolean;
  onChanged?: () => void;
  isTemplateTab?: boolean;
}) {
  // 静默忽略 size —— 所有卡片渲染相同布局(用户反馈:平级排列)
  const ref = React.useRef<HTMLAnchorElement>(null);
  const router = useRouter();
  const [hover, setHover] = React.useState(false);
  const [pos, setPos] = React.useState({ x: 50, y: 50 });
  const [acting, setActing] = React.useState(false);

  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const onMove = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (reduce) return;
    const r = e.currentTarget.getBoundingClientRect();
    setPos({
      x: ((e.clientX - r.left) / r.width) * 100,
      y: ((e.clientY - r.top) / r.height) * 100,
    });
  };

  const tiltX = reduce ? 0 : (pos.y - 50) * 0.05;
  const tiltY = reduce ? 0 : (50 - pos.x) * 0.05;

  const roleLabel = ROLE_LABEL[agent.role] ?? agent.role;
  const t = statusTone(agent.status);
  const avatarSize = "md"; // 统一中尺寸头像

  const onAction = async (e: React.MouseEvent, action: "pause" | "activate" | "deprecate" | "toTemplate" | "toInstance") => {
    e.preventDefault();
    e.stopPropagation();
    setActing(true);
    try {
      if (action === "pause") {
        await updateAgent(agent.id, { status: "paused", is_active: false });
      } else if (action === "activate") {
        await updateAgent(agent.id, { status: "active", is_active: true });
      } else if (action === "deprecate") {
        await updateAgent(agent.id, { status: "deprecated", is_active: false });
      } else if (action === "toTemplate") {
        await updateAgent(agent.id, { is_template: true });
      } else if (action === "toInstance") {
        await updateAgent(agent.id, { is_template: false });
      }
      onChanged?.();
    } catch (err) {
      console.error("[agent-card] action failed:", err);
    } finally {
      setActing(false);
    }
  };

  return (
    <Link
      ref={ref}
      href={`/employees/${agent.id}`}
      onMouseEnter={() => setHover(true)}
      onMouseMove={onMove}
      onMouseLeave={() => { setHover(false); setPos({ x: 50, y: 50 }); }}
      style={{
        transform: `perspective(900px) rotateX(${tiltX}deg) rotateY(${tiltY}deg)`,
        transformStyle: "preserve-3d",
      }}
      className={cn(
        "group relative block h-full w-full overflow-hidden rounded-3xl bg-card ring-1 ring-border transition-all duration-300 will-change-transform",
        "hover:shadow-[0_30px_60px_-30px_rgba(0,0,0,0.18)] hover:-translate-y-0.5",
      )}
    >
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 transition-opacity duration-500",
          "bg-gradient-to-br",
          hueBg(agent.hue),
        )}
      />
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 transition-opacity duration-300",
          hover ? "opacity-100" : "opacity-0",
        )}
        style={{
          background: `radial-gradient(180px circle at ${pos.x}% ${pos.y}%, rgba(255,255,255,0.55), transparent 60%)`,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0)_45%,rgba(0,0,0,0.18)_100%)]"
      />

      {showManageActions && (
        <div className="absolute right-3 top-3 z-10" onClick={(e) => e.preventDefault()}>
          <DropdownMenu>
            <DropdownMenuTrigger
              className="inline-flex items-center gap-1 rounded-lg bg-background/80 px-2 py-1 text-[11px] text-foreground/70 ring-1 ring-border backdrop-blur-sm hover:bg-background hover:text-foreground disabled:opacity-50"
              disabled={acting}
              data-testid={`agent-card-menu-${agent.id.slice(0, 8)}`}
            >
              {acting ? <Loader2 className="size-3 animate-spin" /> : <MoreVertical className="size-3" />}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {agent.status === "active" && (
                <DropdownMenuItem onClick={(e) => onAction(e, "pause")} data-testid="menu-pause">
                  <Pause className="size-4" /> 停用
                </DropdownMenuItem>
              )}
              {(agent.status === "paused" || agent.status === "deprecated") && (
                <DropdownMenuItem onClick={(e) => onAction(e, "activate")} data-testid="menu-activate">
                  <Play className="size-4" /> 启用
                </DropdownMenuItem>
              )}
              {agent.status !== "deprecated" && (
                <DropdownMenuItem onClick={(e) => onAction(e, "deprecate")}>
                  <Archive className="size-4" /> 标记弃用
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              {!isTemplateTab && agent.templateSource && (
                <div className="px-2 py-1.5 text-[10.5px] font-mono uppercase tracking-[0.18em] text-foreground/40">
                  派生自 {agent.templateSource.slice(0, 8)}…
                </div>
              )}
              {agent.isTemplate ? (
                <DropdownMenuItem onClick={(e) => onAction(e, "toInstance")}>
                  <Bot className="size-4" /> 转为实例
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={(e) => onAction(e, "toTemplate")}>
                  <FileText className="size-4" /> 转为模板
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* R25: 状态 accent 顶线(参照 person-card) — 暂停/弃用时显示 */}
      <div
        aria-hidden
        className={cn(
          "absolute left-0 top-0 h-0.5 w-full transition-opacity",
          agent.status === "active" ? "opacity-0" : "opacity-100",
          t.accent,
        )}
      />
      <div className="relative flex h-full w-full flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <AvatarMark glyph={agent.glyph} hue={agent.hue} size={avatarSize} />
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {/* R25: 状态 chip(参照真人卡片) */}
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-[0.18em]",
                t.chip,
              )}
            >
              <span className={cn("size-1.5 rounded-full", t.dot)} />
              {t.label}
            </span>
            {agent.isTemplate && (
              <span className="rounded bg-foreground/10 px-1.5 py-0.5 text-[9.5px] tracking-[0.18em] text-foreground/70">
                模板
              </span>
            )}
          </div>
        </div>

        <div className="mt-auto flex flex-col gap-2.5">
          <div>
            <div className="flex items-baseline gap-2">
              <h3 className="font-semibold tracking-tight leading-tight text-xl">
                {agent.displayName || agent.name}
              </h3>
              <span className="text-xs font-mono text-foreground/40">v{agent.version}</span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center rounded-md bg-foreground/[0.06] px-2 py-0.5 text-[10.5px] font-medium text-foreground/75 ring-1 ring-inset ring-foreground/10">
                {roleLabel}
              </span>
              <span className="text-[10.5px] font-mono text-foreground/45">{agent.complexity}</span>
            </div>
          </div>

          <p className="text-foreground/75 leading-relaxed text-[13px] line-clamp-3">
            {agent.persona || agent.description || <span className="text-foreground/40">暂无人格定义</span>}
          </p>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-foreground/55 font-mono">
            <span className="truncate">{agent.model}</span>
            <span className="text-foreground/30">·</span>
            <span>{(agent.contextWindow / 1000).toFixed(0)}k ctx</span>
            {agent.workingDir && (
              <>
                <span className="text-foreground/30">·</span>
                <span title={agent.workingDir} className="truncate">📁 {agent.workingDir.split("/").pop()}</span>
              </>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-foreground/[0.06] pt-2.5 text-[11px] text-foreground/50 font-mono">
            <span className="truncate" title={`主理人: ${agent.ownerName}`}>
              主理人 · {agent.ownerName}
            </span>
            <span className={cn("transition-opacity shrink-0", hover ? "opacity-100" : "opacity-0")}>
              详情 →
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function hueBg(hue: string): string {
  switch (hue) {
    case "amber":
      return "from-amber-200/55 via-amber-100/40 to-transparent dark:from-amber-900/40 dark:via-amber-900/10";
    case "rose":
      return "from-rose-200/55 via-rose-100/40 to-transparent dark:from-rose-900/40 dark:via-rose-900/10";
    case "teal":
      return "from-teal-200/55 via-teal-100/40 to-transparent dark:from-teal-900/40 dark:via-teal-900/10";
    case "stone":
      return "from-stone-300/55 via-stone-100/40 to-transparent dark:from-stone-800/40 dark:via-stone-800/10";
    case "indigo":
      return "from-indigo-300/55 via-indigo-100/40 to-transparent dark:from-indigo-900/40 dark:via-indigo-900/10";
    case "lime":
      return "from-lime-300/55 via-lime-100/40 to-transparent dark:from-lime-900/40 dark:via-lime-900/10";
    case "violet":
      return "from-violet-300/55 via-violet-100/40 to-transparent dark:from-violet-900/40 dark:via-violet-900/10";
    case "zinc":
    default:
      return "from-zinc-300/55 via-zinc-100/30 to-transparent dark:from-zinc-800/40 dark:via-zinc-800/10";
  }
}
