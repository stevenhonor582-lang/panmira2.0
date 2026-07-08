"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, ChevronRight, LogOut, User } from "lucide-react";
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


export function Topbar() {
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

  return (
    <header className="h-12 shrink-0 border-b border-border bg-background/95 backdrop-blur flex items-center justify-between px-4 sticky top-0 z-30">
      <div className="flex items-center gap-2 text-sm">
        {currentModule && (
          <>
            <Link
              href="/overview/dashboard"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {currentModule}
            </Link>
            <ChevronRight className="size-3.5 text-muted-foreground" />
          </>
        )}
        <span className="text-foreground font-medium">{currentLabel}</span>
      </div>

      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon-sm" aria-label="通知" className="relative">
          <Bell className="size-4" />
          <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-primary" />
        </Button>
        <Separator orientation="vertical" className="h-5 mx-1" />
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
