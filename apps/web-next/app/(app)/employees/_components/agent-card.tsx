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

  const avatarSize =
    size === "feature" || size === "tall"
      ? "xl"
      : size === "compact"
      ? "sm"
      : "md";

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

      <div className="relative flex h-full w-full flex-col p-6">
        <div className="flex items-start justify-between gap-3">
          <AvatarMark glyph={agent.glyph} hue={agent.hue} size={avatarSize} />
          <div className="flex items-center gap-1.5 text-[10.5px] font-mono uppercase tracking-[0.18em] text-foreground/60">
            <span className={cn("size-1.5 rounded-full", t.dot)} />
            {t.label}
            {agent.isTemplate && (
              <span className="ml-1 rounded bg-foreground/10 px-1.5 py-0.5 text-[9.5px] tracking-[0.18em] text-foreground/70">
                TPL
              </span>
            )}
          </div>
        </div>

        <div className="mt-auto flex flex-col gap-3">
          <div>
            <div className="flex items-baseline gap-2">
              <h3 className={cn("font-semibold tracking-tight leading-tight", size === "feature" ? "text-3xl" : size === "tall" ? "text-2xl" : "text-xl")}>
                {agent.displayName || agent.name}
              </h3>
              <span className="text-xs font-mono text-foreground/40">v{agent.version}</span>
            </div>
            <p className="mt-1 text-xs text-foreground/55 font-mono">{roleLabel} · {agent.complexity}</p>
          </div>

          <p className={cn(
            "text-foreground/75 leading-relaxed",
            size === "feature"
              ? "text-base line-clamp-5"
              : size === "wide"
              ? "text-sm line-clamp-3"
              : size === "compact"
              ? "text-xs line-clamp-2"
              : "text-sm line-clamp-3",
          )}>
            {agent.persona || agent.description || <span className="text-foreground/40">暂无人格定义</span>}
          </p>

          {size !== "compact" && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-foreground/55 font-mono">
              <span>{agent.model}</span>
              <span>·</span>
              <span>{(agent.contextWindow / 1000).toFixed(0)}k ctx</span>
              {agent.workingDir && (
                <>
                  <span>·</span>
                  <span title={agent.workingDir}>📁 {agent.workingDir.split("/").pop()}</span>
                </>
              )}
            </div>
          )}

          <div className="flex items-center justify-between text-[11px] text-foreground/45 font-mono">
            <span>主理 · {agent.ownerName}</span>
            <span className={cn("transition-opacity", hover ? "opacity-100" : "opacity-0")}>
              查看详情 →
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
