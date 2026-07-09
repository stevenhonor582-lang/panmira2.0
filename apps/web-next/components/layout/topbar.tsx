"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronRight, LogOut, Menu, Search, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { NAV_LABEL_MAP, NAV_MODULE_MAP } from "./sidebar";
import { getUser, logout, type AuthUser } from "@/lib/auth";


/** R30-B: onMenuClick 触发移动端 sidebar 抽屉(只在 < md 显示 hamburger)。 */
export interface TopbarProps {
  onMenuClick?: () => void;
}

export function Topbar({ onMenuClick }: TopbarProps = {}) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = React.useState<AuthUser | null>(null);

  React.useEffect(() => {
    setUser(getUser());
  }, []);

  const currentLabel = NAV_LABEL_MAP[pathname ?? "/"] ?? "工作台";
  const currentModule = NAV_MODULE_MAP[pathname ?? "/"];

  const initials = user
    ? user.name
        .split(/\s+/)
        .map((s) => s[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "?";

  // 个人资料跳当前登录用户的员工详情页;无 id 时退回到员工列表。
  const profileHref = user?.id
    ? `/overview/people/${user.id}`
    : "/overview/people";

  const goProfile = () => router.push(profileHref);

  const openPalette = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("panmira:command-palette-open"));
    }
  };

  return (
    <header className="h-12 shrink-0 border-b border-border bg-background/95 backdrop-blur flex items-center justify-between px-4 sticky top-0 z-30">
      <div className="flex items-center gap-3 min-w-0">
        {/* R30-B: 移动端 hamburger(< md 显示) */}
        {onMenuClick && (
          <button
            type="button"
            onClick={onMenuClick}
            aria-label="打开导航菜单"
            className="md:hidden -ml-1 size-9 grid place-items-center rounded-md text-foreground hover:bg-accent transition-colors"
          >
            <Menu className="size-5" />
          </button>
        )}

        {/* 全局搜索触发按钮(Cmd+K / Ctrl+K) */}
        <button
          type="button"
          onClick={openPalette}
          className="hidden md:flex items-center gap-2 h-8 px-2.5 rounded-md border border-border bg-muted/40 hover:bg-muted text-muted-foreground transition-colors w-56"
          aria-label="打开全局搜索"
          title="搜索或跳转 (Cmd+K / Ctrl+K)"
        >
          <Search className="size-3.5 shrink-0" />
          <span className="text-xs truncate flex-1 text-left">搜索或跳转...</span>
          <kbd className="text-[10px] font-mono opacity-70 border border-border rounded px-1 leading-4">
            ⌘K
          </kbd>
        </button>
        <Separator orientation="vertical" className="hidden md:block h-5" />

        {/* 面包屑 */}
        <div className="flex items-center gap-2 text-sm min-w-0">
          {currentModule && (
            <>
              <Link
                href="/overview/dashboard"
                className="hidden sm:inline text-muted-foreground hover:text-foreground transition-colors"
              >
                {currentModule}
              </Link>
              <ChevronRight className="hidden sm:block size-3.5 text-muted-foreground" />
            </>
          )}
          <span className="text-foreground font-medium truncate">{currentLabel}</span>
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <ThemeToggle />
        <Separator orientation="vertical" className="h-5 mx-1" />
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="sm" className="gap-2 px-2" />}
          >
            <Avatar className="size-6">
              <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
            </Avatar>
            <span className="text-xs hidden sm:inline">{user?.name ?? "未登录"}</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col">
                <span className="text-sm font-medium">{user?.name ?? "—"}</span>
                <span className="text-xs text-muted-foreground">
                  {user?.email ?? ""}
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={goProfile}>
              <User className="size-3.5" />
              <span>个人资料</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => logout()}>
              <LogOut className="size-3.5" />
              <span>退出登录</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
