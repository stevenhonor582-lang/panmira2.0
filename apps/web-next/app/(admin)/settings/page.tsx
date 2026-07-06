"use client";

import Link from "next/link";
import {
  Settings as SettingsIcon, Users, Bot, Layers, FolderOpen,
  Server, BookOpen, Workflow, ShieldCheck, Activity,
  Cpu, Database, Plug, ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface SettingCard {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
  available: boolean;
}

const SECTIONS: SettingCard[] = [
  { title: "Users", description: "用户管理 · 角色 · 启停", href: "/settings/users",
    icon: Users, badge: "CRUD", available: true },
  { title: "Providers", description: "LLM/Embedding Provider 配置",
    href: "/models", icon: Cpu, badge: "跳专页", available: true },
  { title: "Bots", description: "Bot 配置 · 提示词 · 工作目录",
    href: "/settings#bots", icon: Bot, badge: "占位", available: false },
  { title: "Agents", description: "Agent 模板 · system_prompt · iron_laws",
    href: "/agents", icon: Layers, badge: "跳专页", available: true },
  { title: "Knowledge", description: "KB 配置 · 检索 · chunking",
    href: "/knowledge", icon: BookOpen, badge: "跳专页", available: true },
  { title: "Skills", description: "Skill 池 · 安装 · 版本",
    href: "/resources", icon: Plug, badge: "跳专页", available: true },
  { title: "Projects", description: "项目 + 工作空间",
    href: "/settings#projects", icon: FolderOpen, badge: "占位", available: false },
  { title: "Coordinator", description: "协调器 / 工作流编排",
    href: "/settings#coordinator", icon: Workflow, badge: "占位", available: false },
  { title: "Chain Editor", description: "链式编辑器(agent pipeline)",
    href: "/settings#chain", icon: Activity, badge: "占位", available: false },
  { title: "Bot Permissions", description: "Bot 权限面板(scope)",
    href: "/permissions", icon: ShieldCheck, badge: "跳专页", available: true },
];

export default function SettingsPage() {
  const available = SECTIONS.filter((s) => s.available);
  const placeholders = SECTIONS.filter((s) => !s.available);

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
          <SettingsIcon className="size-5 text-muted-foreground" />
          设置
        </h2>
        <p className="text-sm text-muted-foreground">
          系统配置 + 用户管理 + 各 Section 导航
        </p>
      </header>

      {/* 可用 */}
      <div>
        <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-3 font-medium">
          可用功能
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {available.map((s) => {
            const Icon = s.icon;
            const Wrapper: any = s.available ? Link : "div";
            return (
              <Wrapper
                key={s.title}
                href={s.href}
                className="block group"
              >
                <Card className="hover:border-primary/30 transition-colors h-full">
                  <CardContent className="p-4 flex items-start gap-3">
                    <div className="size-10 rounded-md bg-primary/10 text-primary grid place-items-center shrink-0">
                      <Icon className="size-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <p className="font-medium">{s.title}</p>
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          {s.badge}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{s.description}</p>
                    </div>
                    {s.available && (
                      <ArrowRight className="size-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                    )}
                  </CardContent>
                </Card>
              </Wrapper>
            );
          })}
        </div>
      </div>

      {/* 占位 */}
      <div>
        <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-3 font-medium">
          占位(后续 plan)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
          {placeholders.map((s) => {
            const Icon = s.icon;
            return (
              <Card key={s.title} className="opacity-60">
                <CardContent className="p-3 flex items-center gap-2">
                  <Icon className="size-3.5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium">{s.title}</p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {s.description}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
