"use client";
import * as React from "react";
import type { WizardForm } from "./form";
import { Dropdown } from "./dropdown";

const MODELS: { value: string; label: string; hint: string }[] = [
  { value: "claude-sonnet-4.6", label: "Claude Sonnet 4.6", hint: "200k ctx · 主力" },
  { value: "claude-opus-4.5",   label: "Claude Opus 4.5",   hint: "200k ctx · 深度推理" },
  { value: "claude-haiku-4.5",  label: "Claude Haiku 4.5",  hint: "200k ctx · 极速" },
  { value: "gpt-5",             label: "GPT-5",             hint: "256k ctx · 多模态" },
  { value: "gemini-2.5-pro",    label: "Gemini 2.5 Pro",    hint: "1M ctx · 长文档" },
];

export function Step2({ form, setForm }: { form: WizardForm; setForm: (v: WizardForm) => void }) {
  const set = <K extends keyof WizardForm>(k: K, v: WizardForm[K]) => setForm({ ...form, [k]: v });
  return (
    <div className="space-y-6">
      <Section title="LLM">
        <Dropdown
          value={form.model}
          onChange={(v) => set("model", v)}
          options={MODELS.map((m) => ({ value: m.value, label: m.label, hint: m.hint }))}
          placeholder="选一个 LLM"
        />
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="上下文窗口 · tokens">
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-[28px] font-semibold tabular-nums tracking-tight">
              {form.contextWindow.toLocaleString()}
            </span>
            <span className="font-mono text-[12px] text-foreground/45">tokens</span>
          </div>
          <input
            type="range"
            min={8000}
            max={1000000}
            step={8000}
            value={form.contextWindow}
            onChange={(e) => set("contextWindow", Number(e.target.value))}
            className="mt-3 w-full accent-foreground"
          />
          <div className="mt-1 flex justify-between text-[10.5px] font-mono text-foreground/40">
            <span>8k</span>
            <span>1M</span>
          </div>
        </Section>

        <Section title="Temperature · 创造性">
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-[28px] font-semibold tabular-nums tracking-tight">
              {form.temperature.toFixed(2)}
            </span>
            <span className="font-mono text-[12px] text-foreground/45">0 · 越确定 ; 1 · 越随机</span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={form.temperature}
            onChange={(e) => set("temperature", Number(e.target.value))}
            className="mt-3 w-full accent-foreground"
          />
          <div className="mt-3 flex flex-wrap gap-1.5">
            {[0, 0.2, 0.5, 0.8].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => set("temperature", t)}
                className={
                  "rounded-full px-2.5 py-1 text-[12px] font-mono ring-1 transition-all " +
                  (Math.abs(form.temperature - t) < 0.01
                    ? "bg-foreground text-background ring-foreground"
                    : "bg-background ring-border hover:ring-foreground/30")
                }
              >
                {t}
              </button>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-[12px] font-medium tracking-tight text-foreground/65">{title}</h3>
      <div className="rounded-2xl bg-card p-5 ring-1 ring-border">{children}</div>
    </section>
  );
}
