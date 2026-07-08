"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  ShieldCheck,
  Mic,
  Sliders,
  type LucideIcon,
} from "lucide-react";

interface SubnavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  hint?: string;
}

const ITEMS: SubnavItem[] = [
  { href: "/settings/permissions", label: "权限", icon: ShieldCheck, hint: "RBAC" },
  { href: "/settings/voice", label: "语音", icon: Mic, hint: "TTS" },
  { href: "/settings/advanced", label: "高级", icon: Sliders, hint: "内部开关" },
];

/**
 * SettingsSubnav — dense-config top tab strip used inside the Settings IA.
 *
 * Sits below the global topbar so the user always sees the Settings taxonomy
 * (Permissions / Voice / Advanced) without losing context. Mirrors the
 * ChannelsSubnav style: mono caps eyebrow + Geist headline + horizontal links.
 */
export function SettingsSubnav({ description }: { description?: string }) {
  const pathname = usePathname() ?? "";

  return (
    <div className="border-b border-border bg-background/60 backdrop-blur-sm">
      <div className="flex items-end justify-between gap-6 px-6 pt-4">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-mono">
              /settings
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
            系统设置
          </h1>
        </div>
        <nav className="flex items-center gap-1 pb-1.5 overflow-x-auto">
          {ITEMS.map((item) => {
            const Icon = item.icon;
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 h-8 rounded-md text-sm whitespace-nowrap transition-colors",
                  active
                    ? "bg-muted text-foreground font-medium ring-1 ring-border"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
                )}
              >
                <Icon className="size-3.5" />
                <span>{item.label}</span>
                {item.hint && (
                  <span className="text-[10px] font-mono uppercase tracking-wide text-muted-foreground/70">
                    · {item.hint}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}