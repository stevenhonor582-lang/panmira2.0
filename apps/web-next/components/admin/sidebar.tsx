"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Bot,
  Database,
  Cpu,
  Wrench,
  Plug,
  MessageSquare,
  ScrollText,
  Settings,
  type LucideIcon,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
}

const NAV: NavItem[] = [
  { label: "总览 Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Agent", href: "/agents", icon: Bot, badge: "MVP" },
  { label: "模型池", href: "/models", icon: Cpu },
  { label: "数智底座 KB", href: "/knowledge", icon: Database },
  { label: "Skill / MCP", href: "/resources", icon: Wrench },
  { label: "Channel", href: "/channels", icon: Plug },
  { label: "报表", href: "/reports", icon: ScrollText },
  { label: "设置", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-60 shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground flex flex-col h-full">
      <div className="px-4 py-4 border-b border-sidebar-border">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="size-7 rounded-md bg-primary text-primary-foreground grid place-items-center font-semibold text-sm">
            P
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight">Panmira</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Admin Console
            </div>
          </div>
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto p-2">
        <ul className="flex flex-col gap-0.5">
          {NAV.map((item) => {
            const active =
              pathname === item.href || pathname?.startsWith(item.href + "/");
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.badge && (
                    <span className="text-[10px] uppercase tracking-wider rounded bg-primary/15 text-primary px-1.5 py-0.5">
                      {item.badge}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="px-4 py-3 border-t border-sidebar-border text-[11px] text-muted-foreground">
        数智资源管理 SaaS · v0.1
      </div>
    </aside>
  );
}
