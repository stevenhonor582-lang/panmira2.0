"use client";

import * as React from "react";
import Link from "next/link";
import { useAgent, useAgents, findAgent, type Agent } from "../../_lib/data";
import { AvatarMark, statusTone } from "../../_components/avatar-mark";
import { ArrowLeft, User2, GitBranch, Hash } from "lucide-react";

export function AgentHeader({ id }: { id: string }) {
  const { agent, loading: agentLoading } = useAgent(id);
  if (agentLoading) return <div className="h-48 rounded-2xl bg-muted/40 animate-pulse" />;
  if (!agent) {
    return (
      <div className="rounded-3xl border border-dashed border-border p-12 text-center">
        <p className="text-[15px] text-foreground/65">这个 bot 不存在,或者已被删除。</p>
        <Link href="/employees" className="mt-3 inline-block text-sm text-foreground underline">回到员工库</Link>
      </div>
    );
  }
  const t = statusTone(agent.status);

  return (
    <header className="relative overflow-hidden rounded-3xl bg-card p-8 ring-1 ring-border">
      <div
        aria-hidden
        className={`pointer-events-none absolute -top-20 -right-12 size-80 rounded-full blur-3xl opacity-40 bg-gradient-to-br ${hueGradient(agent.hue)}`}
      />
      <Link
        href="/employees"
        className="inline-flex items-center gap-1.5 text-[12px] font-mono uppercase tracking-[0.18em] text-foreground/45 hover:text-foreground"
      >
        <ArrowLeft className="size-3" /> 回到员工库
      </Link>

      <div className="relative mt-6 flex flex-col gap-6 md:flex-row md:items-end">
        <AvatarMark glyph={agent.glyph} hue={agent.hue} size="xl" />
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono uppercase tracking-[0.18em] text-foreground/55">
            <span className="inline-flex items-center gap-1.5">
              <span className={`size-1.5 rounded-full ${t.dot}`} />
              {t.label}
            </span>
            <span>·</span>
            <span>{agent.role}</span>
            <span>·</span>
            <span>v{agent.version}</span>
            <span>·</span>
            <span className="text-foreground/45">{agent.complexity}</span>
          </div>
          <h1 className="mt-2 text-5xl font-semibold tracking-tighter leading-[1.02]">
            {agent.displayName}
          </h1>
          <p className="mt-3 max-w-[58ch] text-[15px] leading-relaxed text-foreground/75">
            {agent.persona}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 text-right">
          <Stat label="今日任务" value={agent.tasksToday} />
          <span className="text-[11.5px] font-mono text-foreground/45">
            主理 · {agent.ownerName}
          </span>
        </div>
      </div>

      <div className="relative mt-7 flex flex-wrap gap-5 border-t border-border pt-4 text-[12px] font-mono text-foreground/55">
        <span className="inline-flex items-center gap-1.5">
          <User2 className="size-3" /> {agent.ownerName}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <GitBranch className="size-3" /> {agent.templateSource ? "派生" : "原创"}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Hash className="size-3" /> {agent.id.slice(0, 8)}…
        </span>
        <span className="ml-auto text-foreground/35">created {new Date(agent.createdAt).toLocaleDateString("zh-CN")}</span>
      </div>
    </header>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-muted/30 px-4 py-2.5 ring-1 ring-border">
      <div className="text-[10.5px] font-mono uppercase tracking-[0.18em] text-foreground/45">{label}</div>
      <div className="mt-0.5 font-mono text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function hueGradient(hue: string) {
  const map: Record<string, string> = {
    amber: "from-amber-300 to-rose-200",
    rose: "from-rose-300 to-pink-200",
    teal: "from-teal-300 to-sky-200",
    stone: "from-stone-300 to-zinc-200",
    indigo: "from-indigo-300 to-violet-200",
    lime: "from-lime-300 to-emerald-200",
    violet: "from-violet-300 to-indigo-200",
    zinc: "from-zinc-300 to-stone-200",
  };
  return map[hue] ?? map.amber;
}
