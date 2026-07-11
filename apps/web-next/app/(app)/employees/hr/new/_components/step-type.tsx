"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { HR_CATEGORIES, type HrFormState, type HrCategoryId } from "./hr-form";

/**
 * R55 块3 · Step 1 类型
 * ----------------------------------------------------------------
 * 岗位名称(不是"员工名称")+ 4 类岗位类型(每类明确定义 + 适用场景)。
 */
export function StepType({
  form,
  patch,
}: {
  form: HrFormState;
  patch: (p: Partial<HrFormState>) => void;
}) {
  return (
    <div className="space-y-8">
      {/* 岗位名称 */}
      <div className="space-y-2">
        <label htmlFor="hr-name" className="block text-[13px] font-medium text-foreground/80">
          岗位名称 <span className="text-rose-500">*</span>
        </label>
        <input
          id="hr-name"
          data-testid="hr-name"
          value={form.name}
          onChange={(e) => patch({ name: e.target.value })}
          placeholder="例:跨境售前文案 / 视觉设计师 / 运维值守"
          className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-[14px] outline-none transition-colors focus:border-foreground/40"
        />
        <p className="text-[12px] text-foreground/45">
          岗位是"配方"(说明书),不是具体的人 —— 招聘时才由数字员工实例填动态属性。
        </p>
      </div>

      {/* 岗位类型 */}
      <div className="space-y-3">
        <div className="text-[13px] font-medium text-foreground/80">
          岗位类型 <span className="text-rose-500">*</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {HR_CATEGORIES.map((c) => {
            const active = form.category === c.id;
            return (
              <button
                key={c.id}
                type="button"
                data-testid={`hr-cat-${c.id}`}
                onClick={() => patch({ category: c.id as HrCategoryId })}
                className={cn(
                  "flex flex-col gap-2 rounded-2xl border p-4 text-left transition-all",
                  active
                    ? "border-foreground bg-foreground/[0.04] shadow-sm"
                    : "border-border hover:border-foreground/30 hover:bg-foreground/[0.02]",
                )}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "grid size-8 place-items-center rounded-lg text-[15px] font-semibold",
                      active ? "bg-foreground text-background" : "bg-muted text-foreground/70",
                    )}
                  >
                    {c.glyph}
                  </span>
                  <span className="text-[14px] font-semibold">{c.label}</span>
                </div>
                <p className="text-[12.5px] leading-relaxed text-foreground/60">{c.definition}</p>
                <div className="flex flex-wrap gap-1.5">
                  {c.scenes.map((s) => (
                    <span
                      key={s}
                      className="rounded-full bg-muted px-2 py-0.5 text-[10.5px] text-foreground/55"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
