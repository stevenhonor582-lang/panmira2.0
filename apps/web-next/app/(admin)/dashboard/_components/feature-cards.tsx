"use client";

import Link from "next/link";
import { ArrowUpRight, Bot, Cpu, Database, Plug, type LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export interface FeatureCardSpec {
  key: "agents" | "llm" | "kb" | "channels";
  label: string;
  desc: string;
  href: string;
  icon: LucideIcon;
  bg: string;
  fg: string;
  ring: string;
}

export const FEATURE_CARDS: FeatureCardSpec[] = [
  { key: "agents",   label: "Agent 数",     desc: "业务 Agent 模板",   href: "/agents",    icon: Bot,      bg: "bg-primary/10",     fg: "text-primary",     ring: "hover:ring-primary/30" },
  { key: "llm",      label: "大语言模型",   desc: "LLM Provider 池",   href: "/models",    icon: Cpu,      bg: "bg-blue-500/10",    fg: "text-blue-500",    ring: "hover:ring-blue-500/30" },
  { key: "kb",       label: "数字底座资源", desc: "KB + Memory + Skill", href: "/knowledge", icon: Database, bg: "bg-emerald-500/10", fg: "text-emerald-500", ring: "hover:ring-emerald-500/30" },
  { key: "channels", label: "接入系统",     desc: "IM/Channel/外部",   href: "/channels",  icon: Plug,     bg: "bg-violet-500/10",  fg: "text-violet-500",  ring: "hover:ring-violet-500/30" },
];

interface Props {
  loading: boolean;
  values: Record<FeatureCardSpec["key"], number>;
}

export function FeatureCards({ loading, values }: Props) {
  return (
    <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {FEATURE_CARDS.map((card) => {
        const Icon = card.icon;
        const v = values[card.key];
        return (
          <Link
            key={card.key}
            href={card.href}
            className={`group relative rounded-lg border border-border bg-card p-4 transition-all hover:shadow-md hover:-translate-y-0.5 ring-1 ring-transparent ${card.ring}`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className={`size-9 rounded-md ${card.bg} ${card.fg} grid place-items-center`}>
                <Icon className="size-4" />
              </div>
              <ArrowUpRight className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
              {card.label}
            </p>
            {loading ? (
              <Skeleton className="h-7 w-14 mt-1" />
            ) : (
              <p className="text-2xl font-semibold tracking-tight tabular-nums mt-0.5">
                {v}
              </p>
            )}
            <p className="text-[11px] text-muted-foreground mt-1">{card.desc}</p>
          </Link>
        );
      })}
    </section>
  );
}
