"use client";
import * as React from "react";
import type { WizardForm } from "./form";
import { PickerCard } from "./picker-card";

const GLYPHS = ["新", "工", "文", "运", "客", "研", "守", "得", "墨", "玄", "不", "销", "服"];
const HUES = ["amber", "rose", "teal", "sky", "indigo", "stone", "emerald", "violet", "lime"];

// Local starter templates — these only seed name + glyph + persona.
// Real capability / model wiring happens in steps 2-6 with live data.
const STARTERS = [
  { id: "blank",        title: "空白起步",   glyph: "新", hue: "amber", persona: "完全自定义,不预填任何字段。" },
  { id: "fullstack",    title: "全栈工程师", glyph: "工", hue: "amber", persona: "独立、完整的项目开发者。不传递任务,端到端交付。" },
  { id: "copy",         title: "文案秘书",   glyph: "文", hue: "rose",  persona: "老板分身 · 方案专家 · 文档管家 · PPT 大师。" },
  { id: "ops",          title: "运维部署",   glyph: "运", hue: "teal",  persona: "运维部署 · 24x7 · 变更可回滚,失败先停手。" },
  { id: "cs",           title: "客服一线",   glyph: "客", hue: "sky",   persona: "客户一线对话窗口。情绪先行,问题升级同步。" },
  { id: "research",     title: "调研分析",   glyph: "研", hue: "indigo",persona: "深度调研 · 多源交叉 · 所有结论附来源。" },
  { id: "sales",        title: "一线销售",   glyph: "销", hue: "emerald", persona: "客户痛点识别 · 信号推进 · 不杜撰数据。" },
] as const;

export function Step1({ form, setForm }: { form: WizardForm; setForm: (v: WizardForm) => void }) {
  const set = <K extends keyof WizardForm>(k: K, v: WizardForm[K]) => setForm({ ...form, [k]: v });

  return (
    <div className="space-y-7">
      <section>
        <Label>员工名字</Label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="例:不盈 / 墨言 / 守静 / 销售助手-A"
          className="mt-2 w-full rounded-2xl bg-background px-5 py-4 text-[28px] font-semibold tracking-tight ring-1 ring-border placeholder:text-foreground/30 focus:outline-none focus:ring-foreground/40"
        />
      </section>

      <section>
        <Label>一句话描述 · 干什么用的</Label>
        <input
          type="text"
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder="例:工业品跨境售前咨询,客户问答 + 报价初判"
          className="mt-2 w-full rounded-xl bg-background px-4 py-3 text-[14px] ring-1 ring-border placeholder:text-foreground/30 focus:outline-none focus:ring-foreground/40"
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
          <Label>起点 · 选一个预填</Label>
          <p className="mt-1 mb-3 text-[12px] text-foreground/55">
            点选后名字/头像/人格会被预填,后续步骤仍可继续改。
          </p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {STARTERS.map((t) => (
              <PickerCard
                key={t.id}
                active={form.templateId === t.id}
                onClick={() => {
                  set("templateId", t.id);
                  if (t.id === "blank") return;
                  set("glyph", t.glyph);
                  set("hue", t.hue);
                  set("persona", t.persona);
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
