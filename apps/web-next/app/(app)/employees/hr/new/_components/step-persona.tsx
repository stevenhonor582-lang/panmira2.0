"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { HrFormState } from "./hr-form";
import { PERSONALITY_PRESETS } from "../../../_lib/data";

/**
 * R55 块3 · Step 2 人格定义(唯一核心必填)
 * ----------------------------------------------------------------
 * persona(必填)+ systemPrompt(可选)+ ironLaws(可选,逐条)。
 * 不含技能/记忆/协作/模型等任何动态字段。
 */
export function StepPersona({
  form,
  patch,
}: {
  form: HrFormState;
  patch: (p: Partial<HrFormState>) => void;
}) {
  const [lawDraft, setLawDraft] = React.useState("");

  function addLaw() {
    const v = lawDraft.trim();
    if (!v) return;
    patch({ ironLaws: [...form.ironLaws, v] });
    setLawDraft("");
  }
  function removeLaw(i: number) {
    patch({ ironLaws: form.ironLaws.filter((_, idx) => idx !== i) });
  }

  return (
    <div className="space-y-8">
      {/* persona 唯一核心必填 */}
      <div className="space-y-2">
        <label htmlFor="hr-persona" className="block text-[13px] font-medium text-foreground/80">
          岗位人格 <span className="text-rose-500">*</span>
          <span className="ml-2 text-[11px] font-normal text-foreground/45">唯一核心必填 —— 决定这个岗位是什么样的人</span>
        </label>
        <textarea
          id="hr-persona"
          data-testid="hr-persona"
          value={form.persona}
          onChange={(e) => patch({ persona: e.target.value })}
          rows={4}
          placeholder="例:精准军师。说人话,直接给方案,不重复用户问题;文档三行说清楚不写五行。"
          className="w-full resize-y rounded-xl border border-border bg-background px-4 py-3 text-[14px] leading-relaxed outline-none transition-colors focus:border-foreground/40"
        />
        <div className="flex flex-wrap gap-1.5">
          {PERSONALITY_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => patch({ persona: p.body })}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11.5px] transition-colors",
                "border-border text-foreground/60 hover:border-foreground/40 hover:text-foreground",
              )}
              title={p.summary}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* systemPrompt 可选 */}
      <div className="space-y-2">
        <label htmlFor="hr-system-prompt" className="block text-[13px] font-medium text-foreground/80">
          系统提示词 <span className="text-[11px] font-normal text-foreground/45">(可选)</span>
        </label>
        <textarea
          id="hr-system-prompt"
          data-testid="hr-system-prompt"
          value={form.systemPrompt}
          onChange={(e) => patch({ systemPrompt: e.target.value })}
          rows={3}
          placeholder="更完整的岗位系统提示词(可留空,由人格自动派生)。"
          className="w-full resize-y rounded-xl border border-border bg-background px-4 py-3 text-[13.5px] leading-relaxed outline-none transition-colors focus:border-foreground/40"
        />
      </div>

      {/* ironLaws 可选 */}
      <div className="space-y-2">
        <div className="text-[13px] font-medium text-foreground/80">
          铁律 <span className="text-[11px] font-normal text-foreground/45">(可选,逐条添加)</span>
        </div>
        <div className="flex gap-2">
          <input
            data-testid="hr-iron-law-input"
            value={lawDraft}
            onChange={(e) => setLawDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addLaw();
              }
            }}
            placeholder="例:所有数据必须有出处,不杜撰"
            className="flex-1 rounded-xl border border-border bg-background px-4 py-2 text-[13.5px] outline-none focus:border-foreground/40"
          />
          <button
            type="button"
            onClick={addLaw}
            data-testid="hr-iron-law-add"
            className="rounded-xl bg-muted px-4 py-2 text-[13px] font-medium text-foreground/70 hover:bg-muted/70"
          >
            添加
          </button>
        </div>
        {form.ironLaws.length > 0 && (
          <ul className="space-y-1.5 pt-1">
            {form.ironLaws.map((law, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-1.5 text-[12.5px]"
              >
                <span className="text-foreground/75">
                  <span className="mr-2 font-mono text-foreground/40">{i + 1}</span>
                  {law}
                </span>
                <button
                  type="button"
                  onClick={() => removeLaw(i)}
                  className="text-[11px] text-foreground/40 hover:text-rose-500"
                >
                  删除
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
