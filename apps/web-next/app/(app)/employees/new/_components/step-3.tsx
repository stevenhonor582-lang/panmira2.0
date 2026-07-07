"use client";
import * as React from "react";
import type { WizardForm } from "./form";
import { PERSONALITY_PRESETS } from "../../_lib/data";

export function Step3({ form, setForm }: { form: WizardForm; setForm: (v: WizardForm) => void }) {
  const set = <K extends keyof WizardForm>(k: K, v: WizardForm[K]) => setForm({ ...form, [k]: v });

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-3 text-[12px] font-medium tracking-tight text-foreground/65">
          预设人格 · 点选即填
        </h3>
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {PERSONALITY_PRESETS.map((p) => {
            const active = form.personaPreset === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  set("personaPreset", p.id);
                  set("systemPrompt", (form.systemPrompt ? form.systemPrompt + "\n\n" : "") + p.body);
                }}
                className={
                  "rounded-2xl bg-card p-4 text-left ring-1 transition-all " +
                  (active ? "ring-foreground shadow-md" : "ring-border hover:ring-foreground/40")
                }
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[14.5px] font-semibold tracking-tight">{p.label}</span>
                  <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-foreground/45">
                    {p.tag}
                  </span>
                </div>
                <p className="mt-1.5 text-[12px] leading-relaxed text-foreground/65">{p.summary}</p>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="text-[12px] font-medium tracking-tight text-foreground/65">
            System Prompt · 系统提示词
          </h3>
          <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-foreground/40">
            {form.systemPrompt.length} 字
          </span>
        </div>
        <textarea
          value={form.systemPrompt}
          onChange={(e) => set("systemPrompt", e.target.value)}
          rows={11}
          placeholder="在此写这位 bot 的灵魂。先识别它是谁,再说它能做什么,最后列出硬约束。"
          className="w-full resize-none rounded-2xl bg-card p-5 font-mono text-[13px] leading-relaxed ring-1 ring-border focus:outline-none focus:ring-foreground/40"
        />
        <p className="mt-2 text-[11px] text-foreground/45 font-mono">
          建议长度 80–300 字 · 控制在人脑一次能读完的体量
        </p>
      </section>
    </div>
  );
}
