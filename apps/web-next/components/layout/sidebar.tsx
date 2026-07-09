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
  ScrollText,
  Bot,
  Library,
  Database,
  Brain,
  BookOpen,
  FileSearch,
  MessageSquareWarning,
  ListChecks,
  ClipboardList,
  CalendarClock,
  Cpu,
  Wrench,
  Cable,
  Plug,
  KeyRound,
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

// R29-A: 一级板块仅为分类标签,点击固定跳仪表盘(/overview/dashboard)。
// 独立"路由"菜单删除(内置到大模型);"优化"已合并到诊断(R14-E)。
const NAV_GROUPS: NavGroup[] = [
  {
    module: "overview",
    title: "公司综业",
    defaultHref: "/overview/dashboard",
    icon: LayoutDashboard,
    items: [
      { label: "仪表盘", href: "/overview/dashboard", icon: LayoutDashboard },
      { label: "组织部", href: "/overview/people", icon: Users },
      { label: "财务室", href: "/overview/billing", icon: Wallet },
      { label: "系统诊断", href: "/overview/diagnosis", icon: Stethoscope },
      { label: "工作日志", href: "/overview/logs", icon: ScrollText },
    ],
  },
  {
    module: "employees",
    title: "智能体员工",
    defaultHref: "/overview/dashboard",
    icon: Bot,
    items: [
      // 只保留"数字员工"入口;新建向导 / 模板在员工库页面内部已有按钮。
      { label: "数字员工", href: "/employees", icon: Library },
    ],
  },
  {
    module: "foundation",
    title: "记忆知识",
    defaultHref: "/overview/dashboard",
    icon: Database,
    items: [
      // L1/L2/L3 由记忆页面内部 tab 切换,左侧只保留一个入口(默认 L1)。
      { label: "记忆沉淀", href: "/foundation/memory/l1", icon: Brain },
      { label: "知识库", href: "/foundation/knowledge", icon: BookOpen },
      { label: "优化抽取", href: "/foundation/extraction", icon: FileSearch },
      { label: "反馈迭代", href: "/foundation/feedback", icon: MessageSquareWarning },
    ],
  },
  {
    module: "tasks",
    title: "任务协作",
    defaultHref: "/overview/dashboard",
    icon: ClipboardList,
    items: [
      // 新建任务在任务列表页面内部已有按钮;任务详情 [id] 是模板占位。
      { label: "任务列表", href: "/tasks", icon: ListChecks },
      { label: "定时任务", href: "/tasks/scheduled", icon: CalendarClock },
    ],
  },
  {
    module: "channels",
    title: "资源频道",
    defaultHref: "/overview/dashboard",
    icon: Cable,
    items: [
      // "路由" 已内置到大模型,不再单独列。
      { label: "大模型", href: "/channels/llm", icon: Cpu },
      { label: "技能地图", href: "/channels/skills", icon: Wrench },
      { label: "外部互联", href: "/channels/mcp", icon: Plug },
      { label: "访问入口", href: "/channels/endpoints", icon: Cable },
      { label: "互联授权", href: "/channels/oauth", icon: KeyRound },
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
            <div className="text-sm font-semibold tracking-tight">PAMELA</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              2.4
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
                  const active =
                    pathname === item.href ||
                    (item.href !== group.defaultHref &&
                      pathname.startsWith(item.href));
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
        <div>PAMELA 2.4</div>
        <div className="text-[9px] opacity-60">by 海联智达</div>
      </div>
    </aside>
  );
}
