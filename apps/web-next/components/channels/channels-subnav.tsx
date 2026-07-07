"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Cpu,
  Wrench,
  Plug,
  Cable,
  KeyRound,
  GitBranch,
  type LucideIcon,
} from "lucide-react";

interface SubnavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  hint?: string;
}

const ITEMS: SubnavItem[] = [
  { href: "/channels/llm", label: "LLM", icon: Cpu, hint: "provider" },
  { href: "/channels/skills", label: "Skills", icon: Wrench, hint: "sandbox" },
  { href: "/channels/mcp", label: "MCP", icon: Plug, hint: "stdio · http · sse" },
  {
    href: "/channels/endpoints",
    label: "Endpoints",
    icon: Cable,
    hint: "in / out",
  },
  {
    href: "/channels/oauth",
    label: "OAuth",
    icon: KeyRound,
    hint: "双向",
  },
  {
    href: "/channels/routing",
    label: "Routing",
    icon: GitBranch,
    hint: "fallback chain",
  },
];

/**
 * ChannelsSubnav — dense-config top tab strip used inside the Channels IA.
 * Sits below the global topbar so the user sees the module's inner taxonomy
 * (LLM / Skills / MCP / Endpoints / OAuth / Routing) without losing context.
 */
export function ChannelsSubnav({
  description,
}: {
  description?: string;
}) {
  const pathname = usePathname() ?? "";
  const active = ITEMS.find((i) => pathname.startsWith(i.href))?.href;

  return (
    <div className="border-b border-border bg-background/60 backdrop-blur-sm">
      <div className="flex items-end justify-between gap-6 px-6 pt-4">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-mono">
              /channels
            </span>
            {description && (
              <>
                <span className="text-muted-foreground/40">·</span>
                <span className="text-xs text-muted-foreground truncate">
                  {description}
                </span>
              </>
            )}
          </div>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">
            资源频道
          </h1>
        </div>
        <div className="hidden lg:flex items-center gap-1.5 pb-2">
          {ITEMS.map((i) => {
            const isActive = active === i.href;
            const Icon = i.icon;
            return (
              <Link
                key={i.href}
                href={i.href}
                className={cn(
                  "group relative flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                  isActive
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted",
                )}
              >
                <Icon className="size-3.5" />
                <span>{i.label}</span>
                {i.hint && (
                  <span
                    className={cn(
                      "hidden xl:inline-block font-mono text-[10px] tracking-wide",
                      isActive
                        ? "text-background/70"
                        : "text-muted-foreground/60",
                    )}
                  >
                    {i.hint}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>
      {/* mobile fallback row */}
      <div className="lg:hidden flex gap-1 overflow-x-auto px-6 pb-2">
        {ITEMS.map((i) => {
          const isActive = active === i.href;
          const Icon = i.icon;
          return (
            <Link
              key={i.href}
              href={i.href}
              className={cn(
                "shrink-0 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium",
                isActive
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              <Icon className="size-3" />
              {i.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}