"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import type { Agent } from "../_lib/data";

const HUE_BG: Record<string, string> = {
  amber: "from-amber-300/80 via-amber-200/40 to-amber-100/20 dark:from-amber-700/60 dark:via-amber-800/30",
  rose: "from-rose-300/80 via-rose-200/40 to-rose-100/20 dark:from-rose-700/60 dark:via-rose-800/30",
  teal: "from-teal-300/80 via-teal-200/40 to-teal-100/20 dark:from-teal-700/60 dark:via-teal-800/30",
  stone: "from-stone-300/80 via-stone-200/40 to-stone-100/20 dark:from-stone-700/60 dark:via-stone-800/30",
  indigo: "from-indigo-300/80 via-indigo-200/40 to-indigo-100/20 dark:from-indigo-700/60 dark:via-indigo-800/30",
  zinc: "from-zinc-300/80 via-zinc-200/40 to-zinc-100/20 dark:from-zinc-700/60 dark:via-zinc-800/30",
  lime: "from-lime-300/80 via-lime-200/40 to-lime-100/20 dark:from-lime-700/60 dark:via-lime-800/30",
  violet: "from-violet-300/80 via-violet-200/40 to-violet-100/20 dark:from-violet-700/60 dark:via-violet-800/30",
  emerald: "from-emerald-300/80 via-emerald-200/40 to-emerald-100/20 dark:from-emerald-700/60 dark:via-emerald-800/30",
  sky: "from-sky-300/80 via-sky-200/40 to-sky-100/20 dark:from-sky-700/60 dark:via-sky-800/30",
};

const HUE_RING: Record<string, string> = {
  amber: "ring-amber-500/40",
  rose: "ring-rose-500/40",
  teal: "ring-teal-500/40",
  stone: "ring-stone-500/40",
  indigo: "ring-indigo-500/40",
  zinc: "ring-zinc-500/40",
  lime: "ring-lime-500/40",
  violet: "ring-violet-500/40",
  emerald: "ring-emerald-500/40",
  sky: "ring-sky-500/40",
};

const HUE_TEXT: Record<string, string> = {
  amber: "text-amber-900 dark:text-amber-100",
  rose: "text-rose-900 dark:text-rose-100",
  teal: "text-teal-900 dark:text-teal-100",
  stone: "text-stone-900 dark:text-stone-100",
  indigo: "text-indigo-900 dark:text-indigo-100",
  zinc: "text-zinc-700 dark:text-zinc-200",
  lime: "text-lime-900 dark:text-lime-100",
  violet: "text-violet-900 dark:text-violet-100",
  emerald: "text-emerald-900 dark:text-emerald-100",
  sky: "text-sky-900 dark:text-sky-100",
};

export function AvatarMark({
  glyph,
  hue,
  size = "lg",
  className,
}: {
  glyph: string;
  hue: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const sizeCls =
    size === "sm"
      ? "size-8 text-base"
      : size === "md"
      ? "size-12 text-xl"
      : size === "xl"
      ? "size-24 text-5xl"
      : "size-16 text-2xl";
  return (
    <div
      className={cn(
        "relative inline-flex items-center justify-center rounded-2xl bg-gradient-to-br ring-1 font-semibold tracking-tight",
        sizeCls,
        HUE_BG[hue] ?? HUE_BG.amber,
        HUE_RING[hue] ?? HUE_RING.amber,
        HUE_TEXT[hue] ?? HUE_TEXT.amber,
        className,
      )}
    >
      <span aria-hidden className="select-none">
        {glyph}
      </span>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-2xl [background:radial-gradient(120%_60%_at_20%_0%,rgba(255,255,255,0.55),transparent_55%)]"
      />
    </div>
  );
}

// R55-D 4.5: D6 决策 — 状态色填内部不描边(区别于部门色描边)
//   待命:灰色 #9ca3af → bg-zinc-400 (Tailwind 默认就是这个)
//   工作中:绿色 #22c55e → bg-emerald-500 (在 runtimeTone 单独处理,带 animate-pulse)
//   暂停:橙色 #f97316 → bg-orange-500
//   弃用:红色 #ef4444 → bg-red-500
//   草稿:D6 未列 — 保留为内部编辑态(浅蓝),不在生产态 chip 显示
export function statusTone(status: Agent["status"]): {
  dot: string;
  label: string;
  /** chip 包装(label + dot 用),无 ring — 状态色只填内部 */
  chip: string;
  /** 卡片顶部细线 accent(可选) */
  accent: string;
} {
  if (status === "active") {
    // 待命(灰)— 不工作时显示
    return {
      dot: "bg-zinc-400",
      label: "待命",
      chip: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300",
      accent: "bg-zinc-500/30",
    };
  }
  if (status === "paused") {
    // 暂停(橙)
    return {
      dot: "bg-orange-500",
      label: "暂停",
      chip: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
      accent: "bg-orange-500/40",
    };
  }
  if (status === "draft") {
    // 草稿(内部编辑态,D6 未列,保留浅蓝)
    return {
      dot: "bg-sky-500",
      label: "草稿",
      chip: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
      accent: "bg-sky-500/40",
    };
  }
  // 弃用(红)
  return {
    dot: "bg-red-500",
    label: "弃用",
    chip: "bg-red-500/15 text-red-700 dark:text-red-300",
    accent: "bg-red-500/40",
  };
}
