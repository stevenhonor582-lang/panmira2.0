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
  ScrollText,
  Settings,
  Activity,
  AlertTriangle,
  FileSearch,
  DollarSign,
  KeyRound,
  ShieldCheck,
  Mic,
  Brain,
  FolderOpen,
  Workflow,
  type LucideIcon,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: "工作台",
    items: [
      { label: "总览 Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { label: "Agent", href: "/agents", icon: Bot, badge: "MVP" },
    ],
  },
  {
    title: "资源池",
    items: [
      { label: "模型池", href: "/models", icon: Cpu },
      { label: "数智底座 KB", href: "/knowledge", icon: Database },
      { label: "Skill / MCP", href: "/resources", icon: Wrench },
    ],
  },
  {
    title: "监控",
    items: [
      { label: "实时状态", href: "/status", icon: Activity },
      { label: "预警中心", href: "/alerts", icon: AlertTriangle },
      { label: "异常诊断", href: "/diagnose", icon: FileSearch },
    ],
  },
  {
    title: "运营",
    items: [
      { label: "Channel", href: "/channels", icon: Plug },
      { label: "资源报表", href: "/reports", icon: ScrollText },
      { label: "成本分析", href: "/cost", icon: DollarSign },
      { label: "审计日志", href: "/audit", icon: ShieldCheck },
    ],
  },
  {
    title: "权限",
    items: [
      { label: "OAuth Client", href: "/oauth-clients", icon: KeyRound },
      { label: "Permissions", href: "/permissions", icon: ShieldCheck },
    ],
  },
  {
    title: "系统",
    items: [
      { label: "Bots", href: "/settings/bots", icon: Bot },
      { label: "Projects", href: "/settings/projects", icon: FolderOpen },
      { label: "Coordinator", href: "/settings/coordinator", icon: Workflow },
      { label: "Chain Editor", href: "/settings/chain-editor", icon: Activity },
      { label: "Memory", href: "/memory", icon: Brain },
      { label: "Voice", href: "/voice", icon: Mic },
      { label: "设置", href: "/settings", icon: Settings },
    ],
  },
];

export const NAV_LABEL_MAP: Record<string, string> = Object.fromEntries(
  NAV_GROUPS.flatMap((g) => g.items.map((i) => [i.href, i.label])),
);

export const NAV_GROUP_MAP: Record<string, string> = Object.fromEntries(
  NAV_GROUPS.flatMap((g) => g.items.map((i) => [i.href, g.title])),
);

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-60 shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground flex flex-col h-full">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-sidebar-border">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <div className="size-8 rounded-md bg-primary text-primary-foreground grid place-items-center font-semibold text-sm shadow-sm">
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

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto py-3">
        {NAV_GROUPS.map((group) => (
          <div key={group.title} className="mb-3">
            <div className="px-4 mb-1 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              {group.title}
            </div>
            <ul className="flex flex-col gap-0.5 px-2">
              {group.items.map((item) => {
                const active =
                  pathname === item.href || pathname?.startsWith(item.href + "/");
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "relative flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                        active
                          ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                          : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                      )}
                    >
                      {active && (
                        <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-primary" />
                      )}
                      <Icon className="size-4 shrink-0" />
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.badge && (
                        <span className="text-[10px] uppercase tracking-wider rounded bg-primary/15 text-primary px-1.5 py-0.5 font-medium">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Status card */}
      <div className="m-2 p-2.5 rounded-md border border-sidebar-border bg-sidebar-accent/30">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="size-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]" />
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            System Online
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground leading-tight">
          数智资源管理 SaaS · v0.1
        </p>
      </div>
    </aside>
  );
}
