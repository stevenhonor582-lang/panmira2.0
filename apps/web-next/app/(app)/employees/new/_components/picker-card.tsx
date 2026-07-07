"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

export function PickerCard({
  active,
  onClick,
  glyph,
  hue,
  title,
  subtitle,
}: {
  active: boolean;
  onClick: () => void;
  glyph: string;
  hue: string;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex w-full items-start gap-3 overflow-hidden rounded-2xl bg-card p-4 text-left ring-1 transition-all",
        active ? "ring-foreground shadow-md" : "ring-border hover:ring-foreground/40",
      )}
    >
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 opacity-50 bg-gradient-to-br",
          hueBg(hue),
        )}
      />
      <div
        className={cn(
          "relative inline-flex size-12 shrink-0 items-center justify-center rounded-xl font-semibold text-lg ring-1",
          ringMap(hue),
          textMap(hue),
          hueFill(hue),
        )}
      >
        {glyph}
      </div>
      <div className="relative flex-1">
        <div className="text-[14.5px] font-semibold tracking-tight">{title}</div>
        <p className="mt-1 text-[12px] leading-relaxed text-foreground/65">{subtitle}</p>
      </div>
      {active && (
        <span className="absolute right-3 top-3 inline-flex size-5 items-center justify-center rounded-full bg-foreground text-background">
          <Check className="size-3" />
        </span>
      )}
    </button>
  );
}

function hueBg(hue: string): string {
  const m: Record<string, string> = {
    amber: "from-amber-200/60 to-transparent",
    rose: "from-rose-200/60 to-transparent",
    teal: "from-teal-200/60 to-transparent",
    sky: "from-sky-200/60 to-transparent",
    indigo: "from-indigo-200/60 to-transparent",
    stone: "from-stone-200/60 to-transparent",
    emerald: "from-emerald-200/60 to-transparent",
    violet: "from-violet-200/60 to-transparent",
    lime: "from-lime-200/60 to-transparent",
  };
  return m[hue] ?? "from-muted/40 to-transparent";
}

function ringMap(hue: string) {
  const m: Record<string, string> = {
    amber: "ring-amber-500/40",
    rose: "ring-rose-500/40",
    teal: "ring-teal-500/40",
    sky: "ring-sky-500/40",
    indigo: "ring-indigo-500/40",
    stone: "ring-stone-500/40",
    emerald: "ring-emerald-500/40",
    violet: "ring-violet-500/40",
    lime: "ring-lime-500/40",
  };
  return m[hue] ?? "ring-border";
}

function textMap(hue: string) {
  const m: Record<string, string> = {
    amber: "text-amber-900 dark:text-amber-100",
    rose: "text-rose-900 dark:text-rose-100",
    teal: "text-teal-900 dark:text-teal-100",
    sky: "text-sky-900 dark:text-sky-100",
    indigo: "text-indigo-900 dark:text-indigo-100",
    stone: "text-stone-900 dark:text-stone-100",
    emerald: "text-emerald-900 dark:text-emerald-100",
    violet: "text-violet-900 dark:text-violet-100",
    lime: "text-lime-900 dark:text-lime-100",
  };
  return m[hue] ?? "text-foreground";
}

function hueFill(hue: string) {
  const m: Record<string, string> = {
    amber: "bg-amber-300/70 dark:bg-amber-700/50",
    rose: "bg-rose-300/70 dark:bg-rose-700/50",
    teal: "bg-teal-300/70 dark:bg-teal-700/50",
    sky: "bg-sky-300/70 dark:bg-sky-700/50",
    indigo: "bg-indigo-300/70 dark:bg-indigo-700/50",
    stone: "bg-stone-300/70 dark:bg-stone-700/50",
    emerald: "bg-emerald-300/70 dark:bg-emerald-700/50",
    violet: "bg-violet-300/70 dark:bg-violet-700/50",
    lime: "bg-lime-300/70 dark:bg-lime-700/50",
  };
  return m[hue] ?? "bg-muted";
}
