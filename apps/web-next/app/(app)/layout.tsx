import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { ToastProvider } from "@/components/toast/toast-provider";
import { CommandPalette } from "@/components/command-palette/command-palette";

/**
 * (app) 路由组布局
 * R30-A: 注入全局 ToastProvider + CommandPalette(全局命令面板)。
 * 未登录访问会被 AppShell 内部重定向到 /login,Provider 早返回不会泄漏。
 */
export default function AppGroupLayout({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <AppShell>{children}</AppShell>
      <CommandPalette />
    </ToastProvider>
  );
}
