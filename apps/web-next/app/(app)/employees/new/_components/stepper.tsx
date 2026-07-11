"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

// R51-B2: wizard 步骤清晰分"必填 / 选填",并中文化所有 hint
// 必填: 名字 · 头像 · 一句话描述
// 必填: 回答风格 · 记忆容量 · 自动压缩
// 必填: 人设 · 系统提示词 · 铁律
// 选填: 能力装载(技能 / 外接能力 / 内部工具)
// 选填: 记忆注入(公共知识库 / 文件夹)
// 选填: 协作配置(可见性 / 入口绑定)
// 必填: 发布(提交)
export type WizardStep = {
  id: number;
  label: string;
  hint: string;
  required: boolean;
};

export const STEPS: WizardStep[] = [
  { id: 1, label: "基本信息",   hint: "名字 · 头像 · 一句话描述",        required: true  },
  { id: 2, label: "大脑模型",   hint: "回答风格 · 记忆容量 · 自动压缩",  required: true  },
  { id: 3, label: "人格定义",   hint: "人设 · 系统提示词 · 铁律",        required: true  },
  { id: 4, label: "能力装载",   hint: "技能 · 外接能力 · 内部工具",      required: false },
  { id: 5, label: "记忆注入",   hint: "公共知识库 · 文件夹",             required: false },
  { id: 6, label: "协作配置",   hint: "可见性 · 入口绑定",               required: false },
  { id: 7, label: "发布",       hint: "提交 · 失败原因",                 required: true  },
];

export function StepRail({
  current,
  onJump,
  labelOverride,
  hintOverride,
}: {
  current: number;
  onJump: (s: number) => void;
  labelOverride?: string;
  hintOverride?: string;
}) {
  return (
    <nav aria-label="wizard steps" className="space-y-1.5">
      {STEPS.map((s) => {
        const past = s.id < current;
        const here = s.id === current;
        const future = s.id > current;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onJump(s.id)}
            className={cn(
              "group flex w-full items-start gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors",
              here && "bg-card ring-1 ring-border",
              past && "hover:bg-muted/40",
              future && "opacity-60 hover:opacity-100",
            )}
            data-testid={`wizard-step-${s.id}`}
            data-step-required={s.required}
          >
            <span
              className={cn(
                "mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px] tabular-nums",
                past && "bg-foreground text-background",
                here && "ring-2 ring-foreground/50 bg-background text-foreground",
                future && "ring-1 ring-border text-foreground/40",
              )}
            >
              {past ? "✓" : s.id}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className={cn(
                  "block text-[13.5px] font-medium",
                  here ? "text-foreground" : "text-foreground/75",
                )}>
                  {s.label}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center rounded px-1 py-0.5 font-mono text-[9.5px] tracking-[0.12em]",
                    s.required
                      ? "bg-rose-500/10 text-rose-700 dark:text-rose-300"
                      : "bg-muted text-foreground/55",
                  )}
                >
                  {s.required ? "必填" : "选填"}
                </span>
              </span>
              <span className="block truncate text-[10.5px] text-foreground/55 mt-0.5">
                {here && hintOverride ? hintOverride : s.hint}
              </span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}
