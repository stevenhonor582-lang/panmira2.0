"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { AvatarMark, statusTone } from "../../employees/_components/avatar-mark";
import {
  Briefcase, Brush, PenLine, Wrench, Box, Layers, Sparkles, BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const CATEGORY_PRESETS: Record<string, { label: string; Icon: typeof Brush; tone: string }> = {
  art:        { label: "绘画", Icon: Brush,    tone: "bg-rose-500/10  text-rose-700  dark:text-rose-300  ring-rose-500/25" },
  copy:       { label: "文案", Icon: PenLine,  tone: "bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-amber-500/25" },
  writing:    { label: "文案", Icon: PenLine,  tone: "bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-amber-500/25" },
  ops:        { label: "运维", Icon: Wrench,   tone: "bg-teal-500/10  text-teal-700  dark:text-teal-300  ring-teal-500/25" },
  engineering:{ label: "工程", Icon: Box,      tone: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 ring-indigo-500/25" },
  support:    { label: "客服", Icon: Brush,    tone: "bg-sky-500/10   text-sky-700   dark:text-sky-300   ring-sky-500/25" },
  research:   { label: "调研", Icon: BookOpen, tone: "bg-violet-500/10 text-violet-700 dark:text-violet-300 ring-violet-500/25" },
  general:    { label: "通用", Icon: Layers,   tone: "bg-zinc-500/10  text-zinc-700  dark:text-zinc-300  ring-zinc-500/30" },
  custom:     { label: "其它", Icon: Layers,   tone: "bg-zinc-500/10  text-zinc-700  dark:text-zinc-300  ring-zinc-500/30" },
};

function categoryPreset(rawCategory: unknown): { key: string; label: string; Icon: typeof Brush; tone: string } {
  const key = typeof rawCategory === "string" && rawCategory.length > 0 ? rawCategory : "general";
  const preset = CATEGORY_PRESETS[key] ?? CATEGORY_PRESETS.general;
  return { key, label: preset.label, Icon: preset.Icon, tone: preset.tone };
}

const HUE_GRAD: Record<string, string> = {
  amber: "from-amber-300 to-rose-200",
  rose: "from-rose-300 to-pink-200",
  teal: "from-teal-300 to-sky-200",
  stone: "from-stone-300 to-zinc-200",
  indigo: "from-indigo-300 to-violet-200",
  lime: "from-lime-300 to-emerald-200",
  violet: "from-violet-300 to-indigo-200",
  zinc: "from-zinc-300 to-stone-200",
  sky: "from-sky-300 to-blue-200",
  emerald: "from-emerald-300 to-teal-200",
};

export interface HrCardData {
  id: string;
  name: string;
  displayName: string;
  persona: string;
  description: string;
  glyph: string;
  hue: string;
  status: "active" | "paused" | "deprecated" | "draft";
  category: string;
  role: string;
  ironLaws: string[];
  skills: string[];
  tools: string[];
  usageCount: number;
}

export function HrCard({ hr }: { hr: HrCardData; index?: number }) {
  const t = statusTone(hr.status);
  const cat = categoryPreset(hr.category);
  return (
    <div
      className="group relative flex h-full flex-col overflow-hidden rounded-3xl bg-card p-6 ring-1 ring-border transition-all hover:ring-foreground/40 hover:shadow-[0_24px_60px_-30px_rgba(0,0,0,0.18)]"
      data-testid={`hr-card-${hr.id.slice(0, 8)}`}
    >
      <div
        aria-hidden
        className={`pointer-events-none absolute -top-12 -right-10 size-44 rounded-full blur-3xl opacity-40 bg-gradient-to-br ${HUE_GRAD[hr.hue] ?? HUE_GRAD.amber}`}
      />
      <div className="relative flex items-start justify-between gap-3">
        <AvatarMark glyph={hr.glyph} hue={hr.hue} size="md" />
        <div className="flex flex-col items-end gap-1.5">
          <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-[0.18em] ring-1", cat.tone)}>
            <cat.Icon className="size-2.5" />
            {cat.label}
          </span>
          <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-[0.18em]", t.chip)}>
            <span className={cn("size-1.5 rounded-full", t.dot)} />
            {t.label}
          </span>
        </div>
      </div>
      <div className="relative mt-5 flex flex-col gap-1.5 min-h-[80px]">
        <Link href={`/hr/${hr.id}`} className="group/link">
          <h3 className="text-xl font-semibold tracking-tight group-hover/link:underline">
            {hr.displayName || hr.name || "未命名岗位"}
          </h3>
        </Link>
        <p className="line-clamp-3 text-[13px] leading-relaxed text-foreground/65">
          {hr.persona || hr.description || <span className="text-foreground/40">暂无描述</span>}
        </p>
      </div>
      {(hr.ironLaws.length > 0 || hr.skills.length > 0 || hr.tools.length > 0) && (
        <div className="relative mt-3 flex flex-wrap gap-1.5 text-[10.5px] font-mono text-foreground/55">
          {hr.ironLaws.length > 0 && (
            <span className="rounded bg-rose-500/10 px-1.5 py-0.5 text-rose-700 dark:text-rose-300 ring-1 ring-rose-500/15">
              {hr.ironLaws.length} 铁律
            </span>
          )}
          {hr.skills.length > 0 && (
            <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-700 dark:text-amber-300 ring-1 ring-amber-500/15">
              {hr.skills.length} 技能
            </span>
          )}
          {hr.tools.length > 0 && (
            <span className="rounded bg-sky-500/10 px-1.5 py-0.5 text-sky-700 dark:text-sky-300 ring-1 ring-sky-500/15">
              {hr.tools.length} 工具
            </span>
          )}
        </div>
      )}
      <div className="relative mt-auto flex items-center justify-between gap-3 pt-5">
        <div className="flex items-center gap-2 text-[11px] font-mono text-foreground/55">
          <Briefcase className="size-3" />
          <span className="tabular-nums">
            <strong className="font-semibold text-foreground/80">{hr.usageCount}</strong> 实例在用
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Link href={`/hr/${hr.id}`}>
            <Button size="sm" variant="outline" className="gap-1 text-[12px]">
              查看
            </Button>
          </Link>
          <Link href={`/employees/new?hrId=${encodeURIComponent(hr.id)}`}>
            <Button size="sm" className="gap-1 text-[12px]" data-testid={`hr-recruit-${hr.id.slice(0, 8)}`}>
              <Sparkles className="size-3.5" /> 招聘
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
