"use client";

import * as React from "react";
import Link from "next/link";
import {
  fetchTemplates,
  fetchAgents,
  type Agent,
} from "../../_lib/data";
import { HrCard, type HrCardData } from "./hr-card";
import {
  Plus, Briefcase, Lock, Sparkles, Search, X,
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

export function HrLibrary() {
  const [mounted, setMounted] = React.useState(false);
  const [custom, setCustom] = React.useState<Agent[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [usageMap, setUsageMap] = React.useState<Record<string, number>>({});
  // R55-A 1.2: 检索 — 按岗位名称 / 岗位描述过滤两个 section
  const [query, setQuery] = React.useState("");

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

  const customCards = custom.map((a) => mapAgentToHrCard(a, usageMap[a.id] ?? 0));

  // R55-B 2.2: 区分系统 seed vs 个人创建 — created_by IS NOT NULL 即个人创建
  // 系统 seed 是 R52/R53 批量导入的(created_by = NULL), 个人创建走 "新建岗位" / "提炼为数字HR"
  const systemSeedCards = custom.filter((a) => {
    const raw = (a.raw ?? {}) as Record<string, unknown>;
    return raw.created_by == null;
  }).map((a) => mapAgentToHrCard(a, usageMap[a.id] ?? 0));

  const personalCards = custom.filter((a) => {
    const raw = (a.raw ?? {}) as Record<string, unknown>;
    return raw.created_by != null;
  }).map((a) => mapAgentToHrCard(a, usageMap[a.id] ?? 0));

  // R55-A 1.2: 命中判断 — 岗位名称 / 显示名 / 角色 / 描述 / 人格 任一包含 query(不区分大小写)
  const matches = (hr: HrCardData, q: string): boolean => {
    if (!q) return true;
    const needle = q.toLowerCase();
    return (
      hr.name.toLowerCase().includes(needle) ||
      hr.displayName.toLowerCase().includes(needle) ||
      hr.role.toLowerCase().includes(needle) ||
      hr.description.toLowerCase().includes(needle) ||
      hr.persona.toLowerCase().includes(needle)
    );
  };
  const trimmedQuery = query.trim();
  const filteredSystemSeed = systemSeedCards.filter((hr) => matches(hr, trimmedQuery));
  const filteredPersonal = personalCards.filter((hr) => matches(hr, trimmedQuery));
  const totalMatched = filteredSystemSeed.length + filteredPersonal.length;

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

      {/* R55-A 1.2: HR 库检索条 — 按岗位名称 / 岗位描述过滤两个 section */}
      <div
        className="rounded-2xl border border-border bg-card/60 backdrop-blur-sm p-3"
        data-testid="hr-search-bar"
      >
        <div className="flex items-center gap-3">
          <div className="flex flex-1 items-center gap-2 rounded-xl bg-background/80 px-3 py-2 ring-1 ring-border">
            <Search className="size-3.5 text-foreground/40" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="按岗位名称 / 岗位描述 检索"
              aria-label="检索岗位"
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-foreground/35 focus:outline-none"
              data-testid="hr-search-input"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                aria-label="清除检索"
                className="rounded-md p-0.5 text-foreground/40 hover:bg-foreground/5"
                data-testid="hr-search-clear"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-baseline gap-1 rounded-xl bg-background/80 px-3 py-1.5 ring-1 ring-border">
            <span className="text-[10.5px] font-mono uppercase tracking-[0.18em] text-foreground/35">命中</span>
            <span className="font-mono text-sm tabular-nums text-foreground">
              {totalMatched.toString().padStart(2, "0")}
            </span>
            <span className="text-[10.5px] font-mono text-foreground/35">
              / {(systemSeedCards.length + personalCards.length).toString().padStart(2, "0")}
            </span>
          </div>
        </div>
      </div>

      <section className="space-y-5">
        <div className="flex items-baseline justify-between gap-4 border-b border-border pb-3">
          <div>
            <div className="flex items-center gap-2 text-[10.5px] font-mono uppercase tracking-[0.22em] text-foreground/45">
              <Lock className="size-3" /> 系统岗位
            </div>
            <h2 className="mt-1 text-xl font-semibold tracking-tight">
              R52/R53 内置岗位 · {loading ? "…" : filteredSystemSeed.length} 个
            </h2>
            <p className="mt-1 text-[12.5px] text-foreground/55">
              19 个部门 · 266 个岗位 · 系统 seed (created_by = NULL)
            </p>
          </div>
        </div>

        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-56 rounded-3xl bg-muted/30 animate-pulse" />
            ))}
          </div>
        ) : filteredSystemSeed.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-border py-16 text-center">
            <Briefcase className="size-5 text-foreground/40" />
            <p className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-foreground/40">
              {systemSeedCards.length === 0 ? "暂无系统岗位" : "检索无匹配岗位"}
            </p>
            <p className="text-[13px] text-foreground/55 max-w-[40ch]">
              {systemSeedCards.length === 0
                ? "系统在导入岗位数据,请稍后再来。"
                : "试试清空检索,或换个关键词。"}
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
            {filteredSystemSeed.map((hr, i) => (
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
      <section className="space-y-5" data-testid="hr-personal-section">
        <div className="flex items-baseline justify-between gap-4 border-b border-border pb-3">
          <div>
            <div className="flex items-center gap-2 text-[10.5px] font-mono uppercase tracking-[0.22em] text-foreground/45">
              <Briefcase className="size-3" /> 个人创建的岗位
            </div>
            <h2 className="mt-1 text-xl font-semibold tracking-tight">
              我自己创建的岗位 · {loading ? "…" : filteredPersonal.length} 个
            </h2>
            <p className="mt-1 text-[12.5px] text-foreground/55">
              从员工详情页"提炼为数字HR"或直接"新建岗位"得到 · 只显示当前用户创建的
            </p>
          </div>
        </div>

        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="h-56 rounded-3xl bg-muted/30 animate-pulse" />
            ))}
          </div>
        ) : filteredPersonal.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-border py-12 text-center">
            <Briefcase className="size-5 text-foreground/40" />
            <p className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-foreground/40">
              暂无个人创建的岗位
            </p>
            <p className="text-[13px] text-foreground/55 max-w-[44ch]">
              你创建的岗位会出现在这里。可以从员工详情页"提炼为数字HR"生成,或者直接新建一个空白岗位。
            </p>
            <Link
              href="/employees/new?type=template"
              className="mt-3 inline-flex items-center gap-2 rounded-full bg-foreground px-4 py-2 text-[12.5px] font-medium text-background"
            >
              <Plus className="size-3.5" /> 新建岗位
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredPersonal.map((hr, i) => (
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
