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
  BarChart3,
  Settings,
  Activity,
  FileSearch,
  KeyRound,
  ShieldCheck,
  Mic,
  MessageSquare,
  Users,
  Clock,
  Workflow,
  Brain,
  Webhook,
  Compass,
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
    title: "🎛️ 控制台",
    items: [
      { label: "总览 Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { label: "诊断中心", href: "/diagnosis-center", icon: FileSearch },
    ],
  },
  {
    title: "🤖 Bot 工作室",
    items: [
      { label: "Agent 模板", href: "/agents", icon: Bot, badge: "MVP" },
      { label: "定时任务 / 事件", href: "/agents/jobs", icon: Clock, badge: "NEW" },
      { label: "多 Agent 编排", href: "/agents/pipelines", icon: Workflow, badge: "NEW" },
      { label: "Bot 对话日志", href: "/logs", icon: MessageSquare, badge: "NEW" },
      { label: "Runtime Console", href: "/runtime", icon: Activity, badge: "NEW" },
      { label: "蓝图深度编辑器", href: "/agents/templates", icon: Activity, badge: "NEW" },
    ],
  },
  {
    title: "📚 数智与记忆",
    items: [
      { label: "知识库总览", href: "/knowledge", icon: Database },
      { label: "Memory 管理", href: "/memory", icon: Brain, badge: "NEW" },
    ],
  },
  {
    title: "🔌 资源池",
    items: [
      { label: "模型池 (LLM)", href: "/models", icon: Cpu },
      { label: "Skill / MCP", href: "/resources", icon: Wrench },
    ],
  },
  {
    title: "📊 运营",
    items: [
      { label: "Channel 接入", href: "/channels", icon: Plug },
      { label: "数据分析", href: "/data-analytics", icon: BarChart3 },
    ],
  },
  {
    title: "⚙️ 系统",
    items: [
      { label: "用户 / 组织", href: "/settings/users", icon: Users },
      { label: "OAuth Client", href: "/oauth-clients", icon: KeyRound },
      { label: "权限配置", href: "/permissions", icon: ShieldCheck },
      { label: "Voice", href: "/voice", icon: Mic },
      { label: "高级设置", href: "/settings", icon: Settings },
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
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "hover:bg-sidebar-accent/50"
                      )}
                    >
                      <Icon className="size-4 shrink-0" />
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.badge && (
                        <span className="text-[9px] uppercase font-medium px-1.5 py-0.5 rounded bg-primary/15 text-primary">
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

      <div className="p-3 border-t border-sidebar-border text-[10px] text-muted-foreground">
        <div>v0.3 · Phase3 流程整合</div>
      </div>
    </aside>
  );
}
