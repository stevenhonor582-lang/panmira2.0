"use client";

/**
 * 全局 Toast 通知系统
 * ============================================================================
 * 用法:
 *   const toast = useToast();
 *   toast.success("保存成功");
 *   toast.error("保存失败:网络错误");
 *   toast.info("正在加载...");
 *
 * 注入位置:app/(app)/layout.tsx 用 <ToastProvider> 包裹。
 * 右下角浮现,3s 自动消失,可手动关闭。
 * 替代所有 window.alert() 和各页面手写的本地 toast。
 */

import * as React from "react";
import { CheckCircle2, AlertCircle, Info, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastKind = "success" | "error" | "info";

interface ToastItem {
  id: number;
  kind: ToastKind;
  msg: string;
  /** 停留时间(ms),默认 3000;error 默认 5000 */
  duration: number;
}

interface ToastApi {
  success: (msg: string) => void;
  error: (msg: string) => void;
  info: (msg: string) => void;
}

const ToastContext = React.createContext<ToastApi | null>(null);

const ICONS: Record<ToastKind, LucideIcon> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

const STYLES: Record<ToastKind, string> = {
  success:
    "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  error:
    "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  info:
    "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
};

const DURATION: Record<ToastKind, number> = {
  success: 3000,
  error: 5000,
  info: 3000,
};

let counter = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);

  const remove = React.useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = React.useCallback((kind: ToastKind, msg: string) => {
    const id = ++counter;
    const duration = DURATION[kind];
    setToasts((prev) => [...prev.slice(-4), { id, kind, msg, duration }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  const api = React.useMemo<ToastApi>(
    () => ({
      success: (m) => push("success", m),
      error: (m) => push("error", m),
      info: (m) => push("info", m),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="fixed bottom-6 right-6 z-[60] flex flex-col gap-2 pointer-events-none"
        aria-live="polite"
        aria-atomic="true"
      >
        {toasts.map((t) => {
          const Icon = ICONS[t.kind];
          return (
            <div
              key={t.id}
              className={cn(
                "pointer-events-auto flex items-start gap-2 rounded-lg border px-4 py-3 text-sm shadow-lg max-w-sm",
                "animate-in slide-in-from-right-4 fade-in duration-200",
                STYLES[t.kind],
              )}
              role="status"
            >
              <Icon className="size-4 shrink-0 mt-0.5" />
              <span className="flex-1 whitespace-pre-wrap break-words leading-5">
                {t.msg}
              </span>
              <button
                type="button"
                onClick={() => remove(t.id)}
                className="opacity-50 hover:opacity-100 transition-opacity shrink-0 mt-0.5"
                aria-label="关闭通知"
              >
                <X className="size-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

/**
 * 在 ToastProvider 内任意子组件调用,返回 toast 接口。
 * Provider 外调用返回 no-op,避免 SSR 或边界场景崩溃。
 */
export function useToast(): ToastApi {
  const ctx = React.useContext(ToastContext);
  if (!ctx) {
    return {
      success: () => {},
      error: () => {},
      info: () => {},
    };
  }
  return ctx;
}
