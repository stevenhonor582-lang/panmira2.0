"use client";
import * as React from "react";
import Link from "next/link";
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

  const applyStarter = (t: { id: string; glyph: string; hue: string; persona: string; title: string }) => {
    set("templateId", t.id);
    if (t.id === "blank") return;
    set("glyph", t.glyph);
    set("hue", t.hue);
    set("persona", t.persona);
    if (!form.name) set("name", t.title);
  };

  return (
    <div className="space-y-7">
      {/* R17-3: 起点选择 — 用户反馈"新建起点选模板,然后去配置" */}
      <section className="rounded-2xl bg-muted/30 p-5 ring-1 ring-border">
        <div className="flex items-baseline justify-between gap-3">
          <Label>起点 · 选一个</Label>
          <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-foreground/45">
            选了之后,后续字段会自动预填(仍可改)
          </span>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <StartPointCard
            active={form.templateId === "blank"}
            onClick={() => applyStarter(STARTERS[0])}
            badge="从空白"
            title="空白起步"
            desc="完全自定义,不预填任何字段"
            glyph="新"
            hue="amber"
          />
          <StartPointCard
            active={form.templateId !== "blank" && form.templateId !== "" && form.templateId !== "clone"}
            onClick={() => {
              // 默认选 fullstack 作为模板代表(用户可继续选其他)
              if (form.templateId === "blank" || !form.templateId) applyStarter(STARTERS[1]);
            }}
            badge="从模板"
            title="模板预填"
            desc="选个角色模板,自动填名字/头像/人格"
            glyph="工"
            hue="indigo"
          />
          <Link href="/employees" className="block">
            <StartPointCard
              active={false}
              onClick={() => undefined}
              badge="复制现有"
              title="复制现有员工"
              desc="前往员工库找一个 agent 派生(深拷贝)"
              glyph="复"
              hue="teal"
              isLink
            />
          </Link>
        </div>
      </section>

      {/* 模板选择器 — 仅在选了"从模板"起点时展开 */}
      {form.templateId !== "blank" && form.templateId !== "" && form.templateId !== "clone" && (
        <section>
          <Label>选个具体模板 · 7 个角色</Label>
          <p className="mt-1 mb-3 text-[12px] text-foreground/55">
            点选后名字/头像/人格会被预填,后续步骤仍可继续改。
          </p>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {STARTERS.filter((t) => t.id !== "blank").map((t) => (
              <PickerCard
                key={t.id}
                active={form.templateId === t.id}
                onClick={() => applyStarter(t)}
                glyph={t.glyph}
                hue={t.hue}
                title={t.title}
                subtitle={t.persona}
              />
            ))}
          </div>
        </section>
      )}

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
      </section>
    </div>
  );
}

// R17-3 起点选择大卡片 — 三选一视觉
function StartPointCard({
  active,
  onClick,
  badge,
  title,
  desc,
  glyph,
  hue,
  isLink,
}: {
  active: boolean;
  onClick: () => void;
  badge: string;
  title: string;
  desc: string;
  glyph: string;
  hue: string;
  isLink?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "group flex items-start gap-3 rounded-xl p-3.5 text-left ring-1 transition-all " +
        (active
          ? "bg-foreground/[0.04] ring-foreground/40 shadow-sm"
          : "bg-background ring-border hover:ring-foreground/30 hover:bg-muted/40")
      }
      data-testid={`startpoint-${badge}`}
    >
      <span className={"mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-[14px] font-semibold bg-" + hue + "-100 dark:bg-" + hue + "-900/40 text-" + hue + "-700 dark:text-" + hue + "-300"}>
        {glyph}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground/45">{badge}</span>
          {isLink && <span className="font-mono text-[10px] text-foreground/35">↗</span>}
        </div>
        <div className="mt-0.5 text-[13px] font-semibold text-foreground/85">{title}</div>
        <div className="mt-0.5 text-[11.5px] leading-snug text-foreground/60">{desc}</div>
      </div>
    </button>
  );
}

function Label({ children, inline }: { children: React.ReactNode; inline?: boolean }) {
  return inline ? (
    <span className="text-[10.5px] font-mono uppercase tracking-[0.18em] text-foreground/45">{children}</span>
  ) : (
    <h3 className="text-[12px] font-medium tracking-tight text-foreground/65">{children}</h3>
  );
}
