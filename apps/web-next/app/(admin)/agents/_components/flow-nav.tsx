"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FlowStep {
  label: string;
  href: string;
}

interface Props {
  /** 当前步骤(用于高亮) */
  current?: string;
  /** 所有步骤顺序,至少 2 项 */
  steps: FlowStep[];
  className?: string;
}

/**
 * Phase 3 流程引导: 在 Agent / Pipeline / Blueprint 相关页顶部,
 * 用面包条方式给出 "上一步 / 下一步",让用户理解三者关系。
 */
export function FlowNav({ current, steps, className }: Props) {
  const idx = steps.findIndex((s) => s.href === current);
  const prev = idx > 0 ? steps[idx - 1] : null;
  const next = idx >= 0 && idx < steps.length - 1 ? steps[idx + 1] : null;

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-md border border-dashed border-border bg-muted/20 px-3 py-2 text-xs",
        className,
      )}
    >
      <div className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto">
        {steps.map((s, i) => (
          <div key={s.href} className="flex items-center gap-1 shrink-0">
            <Link
              href={s.href}
              className={cn(
                "px-2 py-0.5 rounded hover:bg-accent transition-colors",
                s.href === current
                  ? "bg-primary/15 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s.label}
            </Link>
            {i < steps.length - 1 && (
              <span className="text-muted-foreground/60">›</span>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {prev && (
          <Link
            href={prev.href}
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="size-3.5" />
            {prev.label}
          </Link>
        )}
        {next && (
          <Link
            href={next.href}
            className="inline-flex items-center gap-1 text-primary hover:underline ml-2"
          >
            {next.label}
            <ChevronRight className="size-3.5" />
          </Link>
        )}
      </div>
    </div>
  );
}
