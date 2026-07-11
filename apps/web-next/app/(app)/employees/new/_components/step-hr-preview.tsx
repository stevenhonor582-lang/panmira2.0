"use client";

import * as React from "react";
import Link from "next/link";
import { AvatarMark, statusTone } from "../../../employees/_components/avatar-mark";
import { Briefcase, Sparkles, BookOpen, Box, Brush, PenLine, Wrench, Layers, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const CATEGORY_LABEL: Record<string, { label: string; Icon: typeof Brush; tone: string }> = {
  art:        { label: "绘画", Icon: Brush,    tone: "bg-rose-500/10  text-rose-700  dark:text-rose-300  ring-rose-500/25" },
  copy:       { label: "文案", Icon: PenLine,  tone: "bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-amber-500/25" },
  ops:        { label: "运维", Icon: Wrench,   tone: "bg-teal-500/10  text-teal-700  dark:text-teal-300  ring-teal-500/25" },
  general:    { label: "通用", Icon: Layers,   tone: "bg-zinc-500/10  text-zinc-700  dark:text-zinc-300  ring-zinc-500/30" },
  custom:     { label: "其它", Icon: Layers,   tone: "bg-zinc-500/10  text-zinc-700  dark:text-zinc-300  ring-zinc-500/30" },
};

const TEMPLATE_TYPE_LABEL: Record<string, string> = {
  system: "系统预设",
  custom: "用户自定义",
  builtin: "内置",
};

export interface HrPreviewData {
  id: string;
  displayName: string;
  name: string;
  persona: string;
  systemPrompt: string;
  ironLaws: string[];
  category: string;
  templateType: string;
  role: string;
  glyph: string;
  hue: string;
  status: "active" | "paused" | "deprecated" | "draft";
}

export function StepHrPreview({ hr }: { hr: HrPreviewData | null }) {
  if (!hr) {
    return (
      <div className="rounded-2xl bg-rose-500/[0.04] p-5 ring-1 ring-rose-500/30">
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-rose-700 dark:text-rose-300" />
          <div>
            <div className="text-[14px] font-semibold text-rose-700 dark:text-rose-300">
              没有选岗位
            </div>
            <p className="mt-1 text-[12.5px] text-foreground/65">
              招聘必须先选一个岗位。请回到
              <Link href="/employees/hr" className="ml-1 font-medium text-foreground/85 underline">
                HR 库
              </Link>
              选一个。
            </p>
          </div>
        </div>
      </div>
    );
  }

  const cat = CATEGORY_LABEL[hr.category] ?? CATEGORY_LABEL.general;
  const t = statusTone(hr.status);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-muted/30 p-5 ring-1 ring-border">
        <div className="flex items-baseline justify-between gap-3">
          <div className="text-[10.5px] font-mono uppercase tracking-[0.18em] text-foreground/45">
            已选岗位 · HR
          </div>
          <Link
            href={`/employees/hr/${hr.id}`}
            className="text-[10.5px] font-mono uppercase tracking-[0.18em] text-foreground/55 hover:text-foreground"
          >
            查看详情 →
          </Link>
        </div>
        <div className="mt-4 flex items-start gap-4">
          <AvatarMark glyph={hr.glyph} hue={hr.hue} size="lg" />
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2 text-[10.5px] font-mono uppercase tracking-[0.18em] text-foreground/55">
              <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 ring-1", cat.tone)}>
                <cat.Icon className="size-2.5" />
                {cat.label}
              </span>
              <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5", t.chip)}>
                <span className={cn("size-1.5 rounded-full", t.dot)} />
                {t.label}
              </span>
              <span>·</span>
              <span>{TEMPLATE_TYPE_LABEL[hr.templateType] ?? hr.templateType}</span>
              <span>·</span>
              <span>{hr.role}</span>
            </div>
            <h3 className="mt-2 text-2xl font-semibold tracking-tighter">
              {hr.displayName || hr.name}
            </h3>
            <p className="mt-2 text-[13.5px] leading-relaxed text-foreground/75">
              {hr.persona || <span className="text-foreground/40">暂无人格描述</span>}
            </p>
          </div>
          <div className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-[10.5px] font-medium text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/30">
            <CheckCircle2 className="size-3" /> 已确认
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="系统提示词 · system_prompt" hint="完整人设 · 招聘后此岗位的实例都遵循">
          <pre className="whitespace-pre-wrap font-mono text-[12.5px] leading-relaxed text-foreground/85 max-h-48 overflow-y-auto">
{hr.systemPrompt || "未设定"}
          </pre>
        </Card>

        <Card title="铁律 · iron_laws" hint="每条都是硬约束 · 实例也继承">
          <ul className="space-y-1.5 max-h-48 overflow-y-auto">
            {(hr.ironLaws ?? []).length === 0 && (
              <li className="text-[12.5px] text-foreground/40 italic">未设定</li>
            )}
            {(hr.ironLaws ?? []).map((law, i) => (
              <li key={i} className="flex items-start gap-2 text-[13px] leading-relaxed">
                <span className="mt-1 inline-block size-1.5 shrink-0 rounded-full bg-rose-500" />
                <span>{law}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="rounded-2xl bg-amber-500/[0.04] p-4 ring-1 ring-amber-500/30">
        <div className="flex items-baseline gap-2 text-[10.5px] font-mono uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">
          <Sparkles className="size-3" /> 下一步 · 填动态字段
        </div>
        <p className="mt-1 text-[12.5px] text-foreground/65">
          Step 2 起开始填这个员工怎么工作:名字 / 头像 / 模型 / 上下文 / 温度 / 技能 / MCP / 知识库 / 入口 / 记忆 / 可见性。
        </p>
      </div>

      <div className="rounded-2xl bg-muted/30 p-4 text-[11.5px] text-foreground/55 ring-1 ring-border">
        <div className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-foreground/45">
          注意 · R52 起改名
        </div>
        <ul className="mt-2 space-y-1">
          <li>· 岗位的 静态字段(人设/系统提示词/铁律/分类/角色) — 在这里确认,不可改</li>
          <li>· 员工的 动态字段(名字/头像/模型/技能/记忆/入口) — Step 2 起填</li>
          <li>· 想换岗位?点"查看详情 →" 或回到 <Link href="/employees/hr" className="text-foreground underline">HR 库</Link></li>
        </ul>
      </div>
    </div>
  );
}

function Card({
  title, hint, children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-card p-5 ring-1 ring-border">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[10.5px] font-mono uppercase tracking-[0.18em] text-foreground/55">
          {title}
        </h3>
        {hint && <span className="text-[10px] text-foreground/35">{hint}</span>}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}
