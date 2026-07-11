"use client";

import * as React from "react";
import { GitBranch, Pause, Play, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFetch } from "@/lib/channels/use-fetch";
import { apiPatch } from "@/lib/channels/api-mutations";
import { cn } from "@/lib/utils";

/**
 * R68-1 · 块 6: 路由规则列表 + 暂停/恢复(只 disable, 不删)
 *
 * 数据源: GET /api/v2/admin/routing-rules
 * 操作:   PATCH /api/v2/admin/routing-rules/:id { enabled: false|true }
 *
 * 「不删,只 disable」 — 用户原话: "出了→切备份, 问题→从路由表暂停"
 */

type RoutingBinding = {
  id: string;
  groupId: string;
  pattern: string | null;
  targetBots: string[];
  priority: number;
  enabled: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export function RoutingBindingsPanel() {
  const { data, loading, error, refresh } = useFetch<{
    success?: boolean;
    rules?: RoutingBinding[];
  }>(`/api/v2/admin/routing-rules`);

  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [flash, setFlash] = React.useState<{ id: string; msg: string; tone: "ok" | "bad" } | null>(null);

  const rules: RoutingBinding[] = React.useMemo(() => {
    if (!data) return [];
    if (Array.isArray((data as any).rules)) return (data as any).rules as RoutingBinding[];
    if (Array.isArray(data)) return data as unknown as RoutingBinding[];
    return [];
  }, [data]);

  async function toggle(rule: RoutingBinding) {
    setBusyId(rule.id);
    try {
      const next = !rule.enabled;
      const result = await apiPatch<{ success?: boolean }>(
        `/api/v2/admin/routing-rules/${rule.id}`,
        { enabled: next },
      );
      if (result.ok) {
        setFlash({ id: rule.id, msg: next ? "已启用" : "已暂停", tone: "ok" });
        refresh();
      } else {
        setFlash({ id: rule.id, msg: `操作失败: ${result.error || `HTTP ${result.status}`}`, tone: "bad" });
      }
    } finally {
      setBusyId(null);
      setTimeout(() => setFlash((f) => (f && f.id === rule.id ? null : f)), 3000);
    }
  }

  return (
    <section className="rounded-sm ring-1 ring-border bg-card/40">
      <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <GitBranch className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold tracking-tight">路由规则</h3>
          <span className="text-[10px] text-muted-foreground font-mono">R68-1 · enabled toggle</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground font-mono">
            {rules.length} 条规则 · {rules.filter((r) => r.enabled).length} 启用中
          </span>
          <Button size="icon-xs" variant="ghost" aria-label="刷新" title="刷新" onClick={refresh}>
            <RefreshCw className="size-3" />
          </Button>
        </div>
      </header>

      <div className="p-3">
        {loading ? (
          <div className="text-[11px] text-muted-foreground py-6 text-center flex items-center justify-center gap-2">
            <Loader2 className="size-3 animate-spin" /> 载入中…
          </div>
        ) : error ? (
          <div className="text-[11px] text-rose-700 dark:text-rose-300 py-4 text-center font-mono">
            拉取失败: {error.message || error.code}
          </div>
        ) : rules.length === 0 ? (
          <div className="text-[11px] text-muted-foreground py-6 text-center font-mono">
            尚无路由规则 — 创建后会显示在这里
          </div>
        ) : (
          <ol className="space-y-1.5">
            {rules.map((r) => {
              const f = flash && flash.id === r.id ? flash : null;
              return (
                <li
                  key={r.id}
                  className={cn(
                    "flex items-center gap-2 rounded-sm ring-1 ring-border bg-background/50 px-2.5 py-2",
                    !r.enabled && "opacity-60",
                  )}
                >
                  <span className="text-[10.5px] font-mono text-muted-foreground w-12 text-right">P{r.priority}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[12.5px] font-medium truncate">{r.groupId}</span>
                      <span
                        className={cn(
                          "text-[9px] font-mono uppercase px-1 py-0.5 rounded-sm",
                          r.enabled
                            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                            : "bg-rose-500/15 text-rose-700 dark:text-rose-300",
                        )}
                      >
                        {r.enabled ? "启用" : "已暂停"}
                      </span>
                      {r.pattern ? (
                        <span className="text-[9.5px] font-mono text-muted-foreground truncate">匹配: {r.pattern}</span>
                      ) : null}
                    </div>
                    <div className="text-[10px] text-muted-foreground font-mono truncate">
                      → {(r.targetBots || []).slice(0, 4).join(", ")}
                      {(r.targetBots || []).length > 4 ? ` +${r.targetBots.length - 4}` : null}
                    </div>
                    {f ? (
                      <div
                        className={cn(
                          "text-[10px] font-mono mt-1",
                          f.tone === "ok" ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300",
                        )}
                      >
                        {f.msg}
                      </div>
                    ) : null}
                  </div>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label={r.enabled ? "暂停" : "启用"}
                    title={r.enabled ? "暂停(不删除)" : "恢复启用"}
                    disabled={busyId === r.id}
                    onClick={() => toggle(r)}
                    className={cn(r.enabled ? "hover:text-amber-600" : "hover:text-emerald-600")}
                  >
                    {busyId === r.id ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : r.enabled ? (
                      <Pause className="size-3" />
                    ) : (
                      <Play className="size-3" />
                    )}
                  </Button>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
