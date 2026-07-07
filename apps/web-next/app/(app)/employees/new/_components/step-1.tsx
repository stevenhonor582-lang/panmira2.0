"use client";
import * as React from "react";
import type { WizardForm } from "./form";
import { TEMPLATE_PRESETS } from "../../_lib/data";
import { PickerCard } from "./picker-card";

const GLYPHS = ["新", "工", "文", "运", "客", "研", "守", "得", "墨", "玄", "不"];
const HUES = ["amber", "rose", "teal", "sky", "indigo", "stone", "emerald", "violet", "lime"];

export function Step1({ form, setForm }: { form: WizardForm; setForm: (v: WizardForm) => void }) {
  const set = <K extends keyof WizardForm>(k: K, v: WizardForm[K]) => setForm({ ...form, [k]: v });

  return (
    <div className="space-y-7">
      <section>
        <Label>Bot 名字</Label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="例:不盈 / 墨言 / 守静"
          className="mt-2 w-full rounded-2xl bg-background px-5 py-4 text-[28px] font-semibold tracking-tight ring-1 ring-border placeholder:text-foreground/30 focus:outline-none focus:ring-foreground/40"
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <div>
          <Label>头像 · Glyph & Hue</Label>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {GLYPHS.map((g) => (
              <button
                key={g}
                onClick={() => set("glyph", g)}
                className={
                  "inline-flex size-11 items-center justify-center rounded-xl text-lg font-semibold ring-1 transition-all " +
                  (form.glyph === g ? "ring-foreground shadow-md" : "ring-border hover:ring-foreground/40")
                }
                style={{ background: "var(--background)" }}
              >
                {g}
              </button>
            ))}
          </div>
          <div className="mt-4">
            <Label inline>Hue</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {HUES.map((h) => (
                <button
                  key={h}
                  onClick={() => set("hue", h)}
                  className={
                    "size-8 rounded-full ring-2 transition-all " +
                    (form.hue === h ? "ring-foreground scale-110" : "ring-transparent hover:scale-105")
                  }
                  style={{ background: `var(--swatch-${h}, currentColor)` }}
                  aria-label={h}
                >
                  <span className={`block size-full rounded-full bg-${h}-400`} />
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <Label>模板库</Label>
          <p className="mt-1 mb-3 text-[12px] text-foreground/55">
            选个起点,后面所有步骤都会被预填,可继续改。
          </p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {TEMPLATE_PRESETS.map((t) => (
              <PickerCard
                key={t.id}
                active={form.templateId === t.id}
                onClick={() => {
                  set("templateId", t.id);
                  set("glyph", t.glyph);
                  set("hue", t.hue);
                  set("systemPrompt", t.persona);
                  if (!form.name) set("name", t.title);
                }}
                glyph={t.glyph}
                hue={t.hue}
                title={t.title}
                subtitle={t.persona}
              />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function Label({ children, inline }: { children: React.ReactNode; inline?: boolean }) {
  return inline ? (
    <span className="text-[10.5px] font-mono uppercase tracking-[0.18em] text-foreground/45">{children}</span>
  ) : (
    <h3 className="text-[12px] font-medium tracking-tight text-foreground/65">{children}</h3>
  );
}
