"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  ChevronRight,
  LayoutDashboard,
  Users,
  Wallet,
  Stethoscope,
  Sparkles,
  ScrollText,
  Bot,
  Library,
  Workflow,
  LayoutTemplate,
  Database,
  Brain,
  BookOpen,
  FileSearch,
  MessageSquareWarning,
  ListChecks,
  Plus,
  ClipboardList,
  CalendarClock,
  Cpu,
  Wrench,
  Cable,
  Plug,
  KeyRound,
  GitBranch,
  type LucideIcon,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

interface NavGroup {
  /** Module ID, used as key + href prefix. */
  module: string;
  title: string;
  /** Default landing page when user clicks the module title. */
  defaultHref: string;
  icon: LucideIcon;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    module: "overview",
    title: "公司综阅",
    defaultHref: "/overview/dashboard",
    icon: LayoutDashboard,
    items: [
      { label: "仪表盘", href: "/overview/dashboard", icon: LayoutDashboard },
      { label: "组织部", href: "/overview/people", icon: Users },
      { label: "财务", href: "/overview/billing", icon: Wallet },
      { label: "诊断", href: "/overview/diagnosis", icon: Stethoscope },
      { label: "日志", href: "/overview/logs", icon: ScrollText },
    ],
  },
  {
    module: "employees",
    title: "数字员工",
    defaultHref: "/employees",
    icon: Bot,
    items: [
      { label: "员工库", href: "/employees", icon: Library },
      { label: "员工详情", href: "/employees/[id]", icon: Users },
      { label: "新建向导", href: "/employees/new", icon: Plus },
      { label: "模板", href: "/employees/templates", icon: LayoutTemplate },
    ],
  },
  {
    module: "foundation",
    title: "记忆沉淀",
    defaultHref: "/foundation/memory/l1",
    icon: Database,
    items: [
      { label: "短期记忆 · L1", href: "/foundation/memory/l1", icon: Brain },
      { label: "长期记忆 · L2", href: "/foundation/memory/l2", icon: Brain },
      { label: "永久记忆 · L3", href: "/foundation/memory/l3", icon: Brain },
      { label: "知识库", href: "/foundation/knowledge", icon: BookOpen },
      { label: "抽取", href: "/foundation/extraction", icon: FileSearch },
      { label: "反馈", href: "/foundation/feedback", icon: MessageSquareWarning },
    ],
  },
  {
    module: "tasks",
    title: "任务协作",
    defaultHref: "/tasks",
    icon: ClipboardList,
    items: [
      { label: "任务列表", href: "/tasks", icon: ListChecks },
      { label: "新建任务", href: "/tasks/new", icon: Plus },
      { label: "任务详情", href: "/tasks/[id]", icon: Workflow },
      { label: "定时任务", href: "/tasks/scheduled", icon: CalendarClock },
    ],
  },
  {
    module: "channels",
    title: "资源频道",
    defaultHref: "/channels/llm",
    icon: Cable,
    items: [
      { label: "LLM", href: "/channels/llm", icon: Cpu },
      { label: "Skills", href: "/channels/skills", icon: Wrench },
      { label: "MCP", href: "/channels/mcp", icon: Plug },
      { label: "接入点", href: "/channels/endpoints", icon: Cable },
      { label: "OAuth", href: "/channels/oauth", icon: KeyRound },
      { label: "路由", href: "/channels/routing", icon: GitBranch },
    ],
  },
];

/** Reverse lookup used by the topbar breadcrumb. */
export const NAV_LABEL_MAP: Record<string, string> = Object.fromEntries(
  NAV_GROUPS.flatMap((g) => g.items.map((i) => [i.href, i.label])),
);

export const NAV_MODULE_MAP: Record<string, string> = Object.fromEntries(
  NAV_GROUPS.flatMap((g) => g.items.map((i) => [i.href, g.title])),
);

/**
 * Replace Next.js dynamic segments ([id], [l1|l2|l3]) in NAV items with
 * the corresponding concrete path so `usePathname().startsWith()` matches.
 */
function resolveDynamicPath(pathname: string, href: string): string {
  if (pathname.startsWith(href.replace(/\[[^\]]+\]/, ""))) return pathname;
  return href;
}

export function Sidebar() {
  const pathname = usePathname() ?? "/";

  return (
    <aside className="w-64 shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground flex flex-col h-full">
      <div className="px-4 py-4 border-b border-sidebar-border">
        <Link href="/overview/dashboard" className="flex items-center gap-2.5">
          <div className="size-8 rounded-md bg-primary text-primary-foreground grid place-items-center font-semibold text-sm shadow-sm">
            P
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight">Panmira</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              IA v6 · Admin Console
            </div>
          </div>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto py-3">
        {NAV_GROUPS.map((group) => {
          const GroupIcon = group.icon;
          const moduleActive = pathname.startsWith(`/${group.module}`);
          return (
            <div key={group.module} className="mb-4">
              <Link
                href={group.defaultHref}
                className={cn(
                  "flex items-center gap-2 px-4 py-1.5 text-[11px] uppercase tracking-wider font-semibold transition-colors",
                  moduleActive
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <GroupIcon className="size-3.5" />
                <span>{group.title}</span>
                {moduleActive && (
                  <ChevronRight className="size-3 ml-auto opacity-60" />
                )}
              </Link>
              <ul className="mt-1 flex flex-col gap-0.5 px-2">
                {group.items.map((item) => {
                  const resolvedHref = resolveDynamicPath(pathname, item.href);
                  const active =
                    pathname === resolvedHref ||
                    (item.href !== group.defaultHref &&
                      pathname.startsWith(resolvedHref.replace(/\[[^\]]+\]/, "")));
                  // Disable the [id] / [l1|l2|l3] pseudo-links from being clickable
                  // unless the user is already inside that module.
                  const isTemplate =
                    item.href.includes("[") && item.href.includes("]");
                  if (isTemplate) return null;
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={cn(
                          "relative flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-all",
                          active
                            ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-sm"
                            : "hover:bg-sidebar-accent/40 hover:translate-x-0.5",
                        )}
                      >
                        <Icon className="size-4 shrink-0" />
                        <span className="flex-1 truncate">{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className="p-3 border-t border-sidebar-border text-[10px] text-muted-foreground">
        <div>v0.4 · IA v6 骨架</div>
      </div>
    </aside>
  );
}
