"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import { HR_STEPS, type HrStepKey } from "./hr-form";

/**
 * R55 块3 · 左侧 stepper(3 步)+ 顶部进度条。
 * 简约岗位模板专属样式 —— 不复用数字员工向导的 stepper。
 */
export function HrStepper({
  current,
  onJump,
  reachable,
}: {
  current: HrStepKey;
  onJump: (key: HrStepKey) => void;
  reachable: (key: HrStepKey) => boolean;
}) {
  const currentIdx = HR_STEPS.findIndex((s) => s.key === current);
  const progress = ((currentIdx + 1) / HR_STEPS.length) * 100;

  return (
    <div className="space-y-6">
      {/* 顶部进度条 */}
      <div
        className="h-1 w-full overflow-hidden rounded-full bg-muted"
        data-testid="hr-wizard-progress"
      >
        <div
          className="h-full rounded-full bg-foreground transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      <ol className="space-y-1" data-testid="hr-wizard-stepper">
        {HR_STEPS.map((s, i) => {
          const done = i < currentIdx;
          const active = s.key === current;
          const canJump = reachable(s.key);
          return (
            <li key={s.key}>
              <button
                type="button"
                disabled={!canJump}
                onClick={() => canJump && onJump(s.key)}
                data-testid={`hr-step-${s.key}`}
                className={cn(
                  "group flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors",
                  active ? "bg-foreground/[0.06]" : "hover:bg-foreground/[0.03]",
                  !canJump && "cursor-not-allowed opacity-45",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold transition-colors",
                    done && "bg-foreground text-background",
                    active && "border-2 border-foreground text-foreground",
                    !done && !active && "border border-border text-foreground/50",
                  )}
                >
                  {done ? <Check className="size-3.5" /> : i + 1}
                </span>
                <span className="flex flex-col">
                  <span
                    className={cn(
                      "text-[13.5px] font-medium leading-tight",
                      active ? "text-foreground" : "text-foreground/70",
                    )}
                  >
                    {s.label}
                  </span>
                  <span className="mt-0.5 text-[11.5px] leading-snug text-foreground/45">
                    {s.hint}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
