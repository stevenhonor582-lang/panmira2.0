"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

export interface WizardStep {
  id: number;
  label: string;
  hint: string;
}

export const STEPS: WizardStep[] = [
  { id: 1, label: "基本信息", hint: "name · avatar · template" },
  { id: 2, label: "大脑模型", hint: "LLM · context · temperature" },
  { id: 3, label: "人格定义", hint: "prompt · 预设人格" },
  { id: 4, label: "能力装载", hint: "skills · MCP · tools" },
  { id: 5, label: "知识注入", hint: "KB · folders" },
  { id: 6, label: "协作配置", hint: "权限 · workspace" },
  { id: 7, label: "测试 & 上线", hint: "sandbox · 上线" },
];

export function StepRail({
  current,
  onJump,
}: {
  current: number;
  onJump: (s: number) => void;
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
              <span className={cn(
                "block text-[13.5px] font-medium",
                here ? "text-foreground" : "text-foreground/75",
              )}>
                {s.label}
              </span>
              <span className="block truncate text-[10.5px] font-mono uppercase tracking-[0.18em] text-foreground/40">
                {s.hint}
              </span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}
