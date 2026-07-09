"use client";
import * as React from "react";
import type { WizardForm, PersonaPreset } from "./form";
import { Info, Plus, X } from "lucide-react";

export function Step3({
  form,
  setForm,
  presets,
}: {
  form: WizardForm;
  setForm: (v: WizardForm) => void;
  presets: PersonaPreset[];
}) {
  const set = <K extends keyof WizardForm>(k: K, v: WizardForm[K]) => setForm({ ...form, [k]: v });

  const applyPreset = (p: PersonaPreset) => {
    setForm({
      ...form,
      personaPreset: p.id,
      persona: p.summary,
      systemPrompt: p.body,
      // If user hasn't added any iron laws, prefill from preset.
      ironLaws: form.ironLaws.length === 0 && p.ironLaws ? p.ironLaws : form.ironLaws,
    });
  };

  const [newLaw, setNewLaw] = React.useState("");
  const addLaw = () => {
    const v = newLaw.trim();
    if (!v) return;
    set("ironLaws", [...form.ironLaws, v]);
    setNewLaw("");
  };
  const removeLaw = (i: number) => set("ironLaws", form.ironLaws.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-7">
      <div className="rounded-2xl bg-muted/40 p-4 text-[12px] leading-relaxed text-foreground/70 ring-1 ring-border">
        <div className="mb-1 font-mono text-[10.5px] uppercase tracking-[0.18em] text-foreground/45">
          人格 = 数字员工的"性格 + 行为准则"
        </div>
        <ul className="space-y-1 font-mono text-[11.5px]">
          <li><b className="text-foreground/85">persona</b> · 简短描述(60 字内) · 决定第一印象</li>
          <li><b className="text-foreground/85">系统提示词</b> · 完整提示词 · 决定具体行为</li>
          <li><b className="text-foreground/85">铁律</b> · 绝对不能违反的规则</li>
        </ul>
        <div className="mt-2 flex items-start gap-1.5 text-[11px] text-foreground/55">
          <Info className="mt-0.5 size-3 shrink-0" />
          <span>选一个预设可一键填三栏;之后所有字段都能继续手动改。</span>
        </div>
      </div>

      <section>
        <h3 className="mb-3 text-[12px] font-medium tracking-tight text-foreground/65">
          预设人格 · 点选即填
        </h3>
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {presets.map((p) => {
            const active = form.personaPreset === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p)}
                className={
                  "rounded-2xl bg-card p-4 text-left ring-1 transition-all " +
                  (active ? "ring-foreground shadow-md" : "ring-border hover:ring-foreground/40")
                }
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[14.5px] font-semibold tracking-tight">{p.label}</span>
                  {p.tag && (
                    <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-foreground/45">
                      {p.tag}
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-[12px] leading-relaxed text-foreground/70">{p.summary}</p>
                <p className="mt-2 text-[11px] text-foreground/55">
                  选这个会让人格变成:
                  <span className="ml-1 text-foreground/75">{p.body.slice(0, 36)}…</span>
                </p>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="text-[12px] font-medium tracking-tight text-foreground/65">
            Persona · 简短描述(60 字内)
          </h3>
          <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-foreground/40">
            {form.persona.length} / 60 字
          </span>
        </div>
        <input
          type="text"
          value={form.persona}
          maxLength={60}
          onChange={(e) => set("persona", e.target.value)}
          placeholder="例:工业品跨境售前顾问,情绪先行,数据有出处。"
          className="w-full rounded-2xl bg-card px-5 py-3.5 text-[14px] ring-1 ring-border focus:outline-none focus:ring-foreground/40"
        />
      </section>

      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="text-[12px] font-medium tracking-tight text-foreground/65">
            System Prompt · 完整系统提示词
          </h3>
          <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-foreground/40">
            {form.systemPrompt.length} 字
          </span>
        </div>
        <textarea
          value={form.systemPrompt}
          onChange={(e) => set("systemPrompt", e.target.value)}
          rows={8}
          placeholder="先识别它是谁,再说它能做什么,最后列出硬约束。"
          className="w-full resize-none rounded-2xl bg-card p-5 font-mono text-[13px] leading-relaxed ring-1 ring-border focus:outline-none focus:ring-foreground/40"
        />
        <p className="mt-2 text-[11px] text-foreground/45 font-mono">
          建议长度 80–300 字 · 控制在人脑一次能读完的体量
        </p>
      </section>

      <section>
        <h3 className="mb-3 text-[12px] font-medium tracking-tight text-foreground/65">
          Iron Laws · 铁律(绝对不能违反)
        </h3>
        {form.ironLaws.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-5 text-center text-[12.5px] text-foreground/55">
            还没设铁律。预设人格自带的铁律会在你应用预设时自动加入。
          </div>
        ) : (
          <ul className="space-y-1.5">
            {form.ironLaws.map((law, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-3 rounded-xl bg-card px-4 py-2.5 text-[13px] ring-1 ring-border"
              >
                <span className="flex items-center gap-2">
                  <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-rose-600 dark:text-rose-400">
                    LAW {String(i + 1).padStart(2, "0")}
                  </span>
                  <span>{law}</span>
                </span>
                <button
                  type="button"
                  onClick={() => removeLaw(i)}
                  className="rounded-md p-1 text-foreground/45 hover:bg-muted/40 hover:text-rose-600"
                  aria-label="删除"
                >
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex gap-2">
          <input
            type="text"
            value={newLaw}
            onChange={(e) => setNewLaw(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLaw(); } }}
            placeholder="例:不杜撰价格 / 不替客户决策"
            className="flex-1 rounded-xl bg-background px-3.5 py-2 text-[13px] ring-1 ring-border focus:outline-none focus:ring-foreground/40"
          />
          <button
            type="button"
            onClick={addLaw}
            className="inline-flex items-center gap-1.5 rounded-xl bg-foreground px-3.5 py-2 text-[12.5px] font-medium text-background hover:opacity-90"
          >
            <Plus className="size-3.5" /> 加铁律
          </button>
        </div>
      </section>
    </div>
  );
}
