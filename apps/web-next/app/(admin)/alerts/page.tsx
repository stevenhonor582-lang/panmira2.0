"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Filter, X, RefreshCw } from "lucide-react";
import { usePolling } from "@/lib/use-polling";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import type { AlertItem } from "./_components/types";

const TYPE_BADGE: Record<string, { tone: "default" | "destructive" | "secondary"; label: string }> = {
  task_failed: { tone: "destructive", label: "task_failed" },
  error: { tone: "destructive", label: "error" },
};

function formatTs(ms: string | number): string {
  const n = typeof ms === "string" ? Number(ms) : ms;
  if (!n) return "—";
  return new Date(n).toLocaleString("zh-CN");
}

export default function AlertsPage() {
  const [botFilter, setBotFilter] = useState<string>("__all__") as [string, (v: string | null) => void];
  const [typeFilter, setTypeFilter] = useState<string>("__all__") as [string, (v: string | null) => void];

  const { data: alerts = [], loading, refresh, nextIn } = usePolling<AlertItem[]>({
    fetcher: async () => {
      const r = await api<{ alerts: AlertItem[] }>("/api/v2/admin/alerts");
      return r.alerts ?? [];
    },
    intervalMs: 60000,
  });



  const bots = useMemo(() => {
    const s = new Set((alerts ?? []).map((a) => a.bot_name));
    return Array.from(s).sort();
  }, [alerts]);

  const filtered = useMemo(() => {
    return (alerts ?? []).filter((a) => {
      if (botFilter !== "__all__" && a.bot_name !== botFilter) return false;
      if (typeFilter !== "__all__" && a.type !== typeFilter) return false;
      return true;
    });
  }, [alerts, botFilter, typeFilter]);

  const reset = () => { setBotFilter("__all__"); setTypeFilter("__all__"); };

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <AlertTriangle className="size-5 text-rose-500" />
            预警中心
          </h2>
          <p className="text-sm text-muted-foreground">
            task_failed + error 事件流 · {(alerts ?? []).length} 条
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="tabular-nums">下次 {nextIn}s</span>
          <button
            onClick={refresh}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md hover:bg-muted transition-colors"
            aria-label="立即刷新"
          >
            <RefreshCw className="size-3.5" />
          </button>
        </div>
      </header>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Filter className="size-3.5 text-muted-foreground" />
            过滤
          </CardTitle>
          <CardDescription>按 bot 或事件类型筛选</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5 min-w-[160px]">
            <label className="text-xs text-muted-foreground">Bot</label>
            <Select value={botFilter} onValueChange={setBotFilter}>
              <SelectTrigger>
                <SelectValue placeholder="全部" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">全部</SelectItem>
                {bots.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 min-w-[160px]">
            <label className="text-xs text-muted-foreground">类型</label>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger>
                <SelectValue placeholder="全部" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">全部</SelectItem>
                <SelectItem value="task_failed">task_failed</SelectItem>
                <SelectItem value="error">error</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button variant="ghost" size="sm" onClick={reset} className="gap-1.5">
            <X className="size-3.5" />
            清除过滤
          </Button>
          <p className="ml-auto text-xs text-muted-foreground self-end">
            显示 {filtered.length} / {(alerts ?? []).length}
          </p>
        </CardContent>
      </Card>

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-sm text-muted-foreground">
            {(alerts ?? []).length === 0 ? "暂无告警 — 系统正常运行" : "没有匹配的告警"}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((a) => {
            const badge = TYPE_BADGE[a.type] ?? { tone: "secondary" as const, label: a.type };
            return (
              <Card key={a.id} className="hover:border-rose-500/30 transition-colors">
                <CardContent className="p-3.5">
                  <div className="flex items-start gap-3">
                    <div className="size-8 rounded-md bg-rose-500/10 text-rose-500 grid place-items-center shrink-0">
                      <AlertTriangle className="size-4" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={badge.tone}>{badge.label}</Badge>
                        <span className="font-medium text-sm">{a.bot_name}</span>
                        <span className="text-[11px] text-muted-foreground tabular-nums">
                          {formatTs(a.created_at)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground font-mono break-all">
                        {a.error_message}
                      </p>
                      <p className="text-[10px] text-muted-foreground/60 font-mono">
                        id: {a.id}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
