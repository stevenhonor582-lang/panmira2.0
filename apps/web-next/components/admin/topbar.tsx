"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Moon, Sun, LogOut, User, Bell, ChevronRight } from "lucide-react";
import { TopbarActiveStatus } from "./topbar-active";
import { getUser, logout, type AuthUser } from "@/lib/auth";
import { NAV_LABEL_MAP, NAV_GROUP_MAP } from "./sidebar";

export function Topbar() {
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    setUser(getUser());
    const saved = (typeof window !== "undefined" && localStorage.getItem("theme")) as
      | "light"
      | "dark"
      | null;
    const initial = saved ?? "dark";
    setTheme(initial);
    document.documentElement.classList.toggle("dark", initial === "dark");
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    localStorage.setItem("theme", next);
  };

  // 找当前路由对应的 label 和 group(去掉 basePath 前缀)
  const cleanPath = (pathname ?? "").replace(/^\/web-next/, "").replace(/\/$/, "") || "/";
  const currentLabel = NAV_LABEL_MAP[cleanPath] ?? "工作台";
  const currentGroup = NAV_GROUP_MAP[cleanPath];

  const initials = user
    ? user.name
        .split(/\s+/)
        .map((s) => s[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "?";

  return (
    <header className="h-12 shrink-0 border-b border-border bg-background flex items-center justify-between px-4">
      {/* 面包屑:分组 > 当前页(分组 = 工作台 时不显示分组,避免重复) */}
      <div className="flex items-center gap-2 text-sm">
        {currentGroup && currentGroup !== "工作台" && (
          <>
            <span className="text-muted-foreground">{currentGroup}</span>
            <ChevronRight className="size-3.5 text-muted-foreground" />
          </>
        )}
        <span className="text-foreground font-medium">{currentLabel}</span>
      </div>

      <div className="flex items-center gap-1">
        <TopbarActiveStatus />
        <Separator orientation="vertical" className="h-5 mx-1" />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="通知"
          className="relative"
        >
          <Bell className="size-4" />
          <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-primary" />
        </Button>
        <Separator orientation="vertical" className="h-5 mx-1" />
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={toggleTheme}
          aria-label="切换主题"
        >
          {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="sm" className="gap-2 px-2" />
            }
          >
            <Avatar className="size-6">
              <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
            </Avatar>
            <span className="text-xs hidden sm:inline">
              {user?.name ?? "未登录"}
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col">
                <span className="text-sm font-medium">
                  {user?.name ?? "—"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {user?.email ?? ""}
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>
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
