"use client";
import * as React from "react";
import Link from "next/link";
import { TEMPLATE_PRESETS, AGENTS } from "../../_lib/data";
import { AvatarMark } from "../../_components/avatar-mark";
import { ArrowUpRight, Plus, Lock, Globe2 } from "lucide-react";

const MINE = AGENTS.filter((a) => a.ownerName === "史德飞" && a.templateSource === null);

export function TemplatesBoard() {
  const [tab, setTab] = React.useState<"mine" | "public">("mine");
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    const t = setTimeout(() => setMounted(true), 30);
    return () => clearTimeout(t);
  }, []);

  const totalMine = MINE.length;
  const totalPublic = TEMPLATE_PRESETS.length;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-6 border-b border-border pb-7">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-[10.5px] font-mono uppercase tracking-[0.22em] text-foreground/45">
            <span className="inline-block size-1.5 rounded-full bg-foreground/40" />
            模板库 · Templates
          </div>
          <h1 className="text-5xl font-semibold tracking-tighter leading-[1.02] max-w-[14ch]">
            从模板起手,或自己造一个
          </h1>
          <p className="max-w-[55ch] text-[15px] leading-relaxed text-foreground/65">
            我自己建的 <span className="font-mono text-foreground/90">{totalMine}</span> 个是从史德飞在生产中跑了至少一周的 bot 抽出来的。
            公开的 <span className="font-mono text-foreground/90">{totalPublic}</span> 个是按角色分的入门款。
          </p>
        </div>
        <Link
          href="/employees/new"
          className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-[13px] font-medium text-background hover:opacity-90"
        >
          <Plus className="size-4" /> 从空白起
        </Link>
      </header>

      <div className="flex items-center gap-1 self-start">
        {[
          { id: "mine", label: "我自己建的", count: totalMine },
          { id: "public", label: "公开模板", count: totalPublic },
        ].map((t) => {
          const on = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id as "mine" | "public")}
              className={
                "inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-medium ring-1 transition-all " +
                (on ? "bg-foreground text-background ring-foreground" : "bg-card text-foreground/65 ring-border hover:ring-foreground/40")
              }
            >
              {t.id === "mine" ? <Lock className="size-3.5" /> : <Globe2 className="size-3.5" />}
              {t.label}
              <span className="font-mono text-[11px] opacity-60">{t.count}</span>
            </button>
          );
        })}
      </div>

      {tab === "mine" ? <MineGrid mounted={mounted} /> : <PublicGrid mounted={mounted} />}
    </div>
  );
}

function MineGrid({ mounted }: { mounted: boolean }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {MINE.map((a, i) => (
        <div
          key={a.id}
          className={
            "transition-all duration-500 ease-out " +
            (mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4")
          }
          style={{ transitionDelay: mounted ? `${i * 60}ms` : "0ms" }}
        >
          <Link
            href={`/employees/new?template=from-${a.id}`}
            className="group relative flex h-full flex-col overflow-hidden rounded-3xl bg-card p-6 ring-1 ring-border transition-shadow hover:shadow-[0_24px_60px_-30px_rgba(0,0,0,0.18)]"
          >
            <div
              aria-hidden
              className={`pointer-events-none absolute -top-12 -right-10 size-44 rounded-full blur-3xl opacity-40 bg-gradient-to-br ${hueToGrad(a.hue)}`}
            />
            <div className="relative flex items-start justify-between">
              <AvatarMark glyph={a.glyph} hue={a.hue} size="md" />
              <ArrowUpRight className="size-4 text-foreground/40 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </div>
            <div className="relative mt-6 flex flex-col gap-2">
              <div className="flex items-baseline gap-2">
                <h3 className="text-xl font-semibold tracking-tight">{a.displayName}</h3>
                <span className="font-mono text-[11px] text-foreground/40">v{a.version}</span>
              </div>
              <p className="line-clamp-3 text-[13.5px] leading-relaxed text-foreground/75">{a.persona}</p>
            </div>
            <div className="relative mt-auto flex items-center justify-between pt-6 text-[11px] font-mono text-foreground/45">
              <span>{a.role}</span>
              <span>{a.tasksToday} tasks/d</span>
            </div>
          </Link>
        </div>
      ))}
    </div>
  );
}

function PublicGrid({ mounted }: { mounted: boolean }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {TEMPLATE_PRESETS.map((t, i) => (
        <div
          key={t.id}
          className={
            "transition-all duration-500 ease-out " +
            (mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4")
          }
          style={{ transitionDelay: mounted ? `${i * 60}ms` : "0ms" }}
        >
          <Link
            href={`/employees/new?template=${t.id}`}
            className="group relative flex h-full flex-col overflow-hidden rounded-3xl bg-card p-5 ring-1 ring-border transition-all hover:ring-foreground/40"
          >
            <div
              aria-hidden
              className={`pointer-events-none absolute inset-0 opacity-70 bg-gradient-to-br ${hueToGrad(t.hue)}`}
            />
            <div className="relative flex items-start justify-between">
              <AvatarMark glyph={t.glyph} hue={t.hue} size="md" />
              <ArrowUpRight className="size-4 text-foreground/40 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </div>
            <div className="relative mt-5 flex flex-col gap-1.5">
              <h3 className="text-[16px] font-semibold tracking-tight">{t.title}</h3>
              <p className="line-clamp-2 text-[12px] leading-relaxed text-foreground/65">{t.persona}</p>
            </div>
            <div className="relative mt-5 flex items-center gap-1.5 text-[10.5px] font-mono uppercase tracking-[0.18em] text-foreground/45">
              <span>{t.complexity}</span>
              <span>·</span>
              <span>{t.role}</span>
            </div>
          </Link>
        </div>
      ))}
    </div>
  );
}

function hueToGrad(hue: string): string {
  const m: Record<string, string> = {
    amber: "from-amber-300/55 via-amber-100/40 to-transparent",
    rose: "from-rose-300/55 via-rose-100/40 to-transparent",
    teal: "from-teal-300/55 via-teal-100/40 to-transparent",
    sky: "from-sky-300/55 via-sky-100/40 to-transparent",
    indigo: "from-indigo-300/55 via-indigo-100/40 to-transparent",
    stone: "from-stone-300/55 via-stone-100/40 to-transparent",
    emerald: "from-emerald-300/55 via-emerald-100/40 to-transparent",
    violet: "from-violet-300/55 via-violet-100/40 to-transparent",
    lime: "from-lime-300/55 via-lime-100/40 to-transparent",
  };
  return m[hue] ?? "from-muted/40 to-transparent";
}
