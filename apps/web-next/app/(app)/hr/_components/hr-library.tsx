"use client";

import * as React from "react";
import Link from "next/link";
import {
  fetchTemplates,
  fetchAgents,
  TEMPLATE_PRESETS,
  type Agent,
} from "../../employees/_lib/data";
import { HrCard, type HrCardData } from "./hr-card";
import {
  Plus, Briefcase, Lock, Sparkles,
} from "lucide-react";

function mapAgentToHrCard(a: Agent, usage: number): HrCardData {
  const raw = (a.raw ?? {}) as Record<string, unknown>;
  return {
    id: a.id,
    name: a.name,
    displayName: a.displayName || a.name,
    persona: a.persona,
    description: a.description,
    glyph: a.glyph,
    hue: a.hue,
    status: a.status,
    category: typeof raw.category === "string" ? raw.category : "general",
    role: a.role,
    ironLaws: a.ironLaws ?? [],
    skills: a.skills ?? [],
    tools: a.tools ?? [],
    usageCount: usage,
  };
}

function presetToHrCard(p: typeof TEMPLATE_PRESETS[number]): HrCardData {
  const role = String(p.role);
  const category =
    role === "full-stack-engineer" || role === "engineering" ? "engineering" :
    role === "copywriting-secretary" ? "copy" :
    role === "ops-engineer" ? "ops" :
    role === "customer-support" ? "support" :
    role === "research-analyst" ? "research" :
    "general";
  return {
    id: p.id,
    name: p.id,
    displayName: p.title,
    persona: p.persona,
    description: p.persona,
    glyph: p.glyph,
    hue: p.hue,
    status: "active",
    category,
    role: p.role,
    ironLaws: [],
    skills: [],
    tools: [],
    usageCount: 0,
  };
}

export function HrLibrary() {
  const [mounted, setMounted] = React.useState(false);
  const [custom, setCustom] = React.useState<Agent[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [usageMap, setUsageMap] = React.useState<Record<string, number>>({});

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [list, instances] = await Promise.all([
          fetchTemplates(),
          fetchAgents({ filter: "instance" }),
        ]);
        if (!alive) return;
        setCustom(list);
        const u: Record<string, number> = {};
        for (const inst of instances) {
          const sid = inst.templateSource;
          if (sid) u[sid] = (u[sid] ?? 0) + 1;
        }
        setUsageMap(u);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  React.useEffect(() => {
    const t = setTimeout(() => setMounted(true), 30);
    return () => clearTimeout(t);
  }, []);

  const systemPresets = TEMPLATE_PRESETS.map(presetToHrCard);
  const customCards = custom.map((a) => mapAgentToHrCard(a, usageMap[a.id] ?? 0));

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-6 border-b border-border pb-7">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-[10.5px] font-mono uppercase tracking-[0.22em] text-foreground/45">
            <span className="inline-block size-1.5 rounded-full bg-foreground/40" />
            数字HR · 岗位库
          </div>
          <h1 className="text-5xl font-semibold tracking-tighter leading-[1.02] max-w-[14ch]">
            招人之前,先选岗位
          </h1>
          <p className="max-w-[60ch] text-[15px] leading-relaxed text-foreground/65">
            岗位(HR)是静态配方 — 决定一个数字员工是什么样的人:人格 / 系统提示词 / 风格 / 铁律 / 分类 / 角色。
            具体的怎么工作(模型 / 技能 / MCP / 知识库 / 入口 / 记忆 / 频道)在招聘时再填。
          </p>
        </div>
        <Link
          href="/employees/new?type=template"
          className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-[13px] font-medium text-background hover:opacity-90"
          data-testid="hr-new"
        >
          <Plus className="size-4" /> 新建岗位
        </Link>
      </header>

      <section className="space-y-5">
        <div className="flex items-baseline justify-between gap-4 border-b border-border pb-3">
          <div>
            <div className="flex items-center gap-2 text-[10.5px] font-mono uppercase tracking-[0.22em] text-foreground/45">
              <Sparkles className="size-3" /> 系统原生岗位
            </div>
            <h2 className="mt-1 text-xl font-semibold tracking-tight">
              5 大类开箱即用 · {systemPresets.length} 个
            </h2>
            <p className="mt-1 text-[12.5px] text-foreground/55">
              内置岗位模板,直接点"招聘"即可招到员工 — 个性化在招聘时再调。
            </p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {systemPresets.map((hr, i) => (
            <div
              key={hr.id}
              className={
                "transition-all duration-500 ease-out " +
                (mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4")
              }
              style={{ transitionDelay: mounted ? `${i * 50}ms` : "0ms" }}
            >
              <HrCard hr={hr} index={i} />
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-5">
        <div className="flex items-baseline justify-between gap-4 border-b border-border pb-3">
          <div>
            <div className="flex items-center gap-2 text-[10.5px] font-mono uppercase tracking-[0.22em] text-foreground/45">
              <Lock className="size-3" /> 自定义岗位
            </div>
            <h2 className="mt-1 text-xl font-semibold tracking-tight">
              自己定义的岗位 · {loading ? "…" : customCards.length} 个
            </h2>
            <p className="mt-1 text-[12.5px] text-foreground/55">
              从实例"提炼为数字HR"或直接"新建岗位"得到 · 每张卡显示被多少实例在用。
            </p>
          </div>
        </div>

        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-56 rounded-3xl bg-muted/30 animate-pulse" />
            ))}
          </div>
        ) : customCards.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-border py-16 text-center">
            <Briefcase className="size-5 text-foreground/40" />
            <p className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-foreground/40">
              暂无自定义岗位
            </p>
            <p className="text-[13px] text-foreground/55 max-w-[40ch]">
              可以在员工详情页"提炼为数字HR"生成岗位,或者直接新建一个空白岗位。
            </p>
            <div className="mt-3 flex items-center gap-2">
              <Link
                href="/employees/new?type=template"
                className="inline-flex items-center gap-2 rounded-full bg-foreground px-4 py-2 text-[12.5px] font-medium text-background"
              >
                <Plus className="size-3.5" /> 新建岗位
              </Link>
              <Link
                href="/employees"
                className="inline-flex items-center gap-2 rounded-full bg-muted px-4 py-2 text-[12.5px] font-medium text-foreground/70 hover:bg-muted/70"
              >
                去员工库提炼
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {customCards.map((hr, i) => (
              <div
                key={hr.id}
                className={
                  "transition-all duration-500 ease-out " +
                  (mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4")
                }
                style={{ transitionDelay: mounted ? `${i * 50}ms` : "0ms" }}
              >
                <HrCard hr={hr} index={i} />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
