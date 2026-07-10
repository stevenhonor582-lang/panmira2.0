"use client";

import { useMemo } from "react";
import { RefreshCw } from "lucide-react";
import { usePolling } from "@/lib/use-polling";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Activity, Bot, Cpu, Database, KeyRound, Wrench, Plug } from "lucide-react";
import { api } from "@/lib/api";
import type { SystemStatus, AlertItem, BotAlertSummary } from "./_components/types";

const COUNT_META: { key: keyof SystemStatus["counts"]; label: string; icon: typeof Cpu; tone: string }[] = [
  { key: "agent", label: "数字员工", icon: Bot, tone: "primary" },
  { key: "llm", label: "LLM", icon: Cpu, tone: "blue" },
  { key: "kb", label: "KB", icon: Database, tone: "emerald" },
  { key: "oauth", label: "OAuth", icon: KeyRound, tone: "amber" },
  { key: "mcp", label: "MCP", icon: Plug, tone: "rose" },
  { key: "embedding", label: "嵌入模型", icon: Wrench, tone: "violet" },
];

const TONE: Record<string, { bg: string; fg: string }> = {
  primary: { bg: "bg-primary/10", fg: "text-primary" },
  blue: { bg: "bg-blue-500/10", fg: "text-blue-500" },
  emerald: { bg: "bg-emerald-500/10", fg: "text-emerald-500" },
  amber: { bg: "bg-amber-500/10", fg: "text-amber-500" },
  rose: { bg: "bg-rose-500/10", fg: "text-rose-500" },
  violet: { bg: "bg-violet-500/10", fg: "text-violet-500" },
};

function formatTs(ms: string | number): string {
  const n = typeof ms === "string" ? Number(ms) : ms;
  if (!n) return "—";
  return new Date(n).toLocaleString("zh-CN");
}

export default function StatusPage() {
  const fetcher = async () => {
    const [s, a] = await Promise.all([
      api<SystemStatus>("/api/v2/admin/status"),
      api<{ alerts: AlertItem[] }>("/api/v2/admin/alerts"),
    ]);
    return { status: s, alerts: a.alerts ?? [] };
  };

  const { data, loading, refresh, nextIn } = usePolling({
    fetcher,
    intervalMs: 30000,
  });

  const status = data?.status ?? null;
  const alerts = data?.alerts ?? [];

  // Top bots by error count
  const botSummary = useMemo<BotAlertSummary[]>(() => {
    const map = new Map<string, BotAlertSummary>();
    for (const a of alerts) {
      const ts = Number(a.created_at);
      const cur = map.get(a.bot_name);
      if (!cur) {
        map.set(a.bot_name, {
          botName: a.bot_name,
          count: 1,
          lastError: a.error_message,
          lastAt: ts,
        });
      } else {
        cur.count++;
        if (ts > cur.lastAt) {
          cur.lastAt = ts;
          cur.lastError = a.error_message;
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [alerts]);

  const errorHealth = status
    ? status.errorsLast24h === 0
      ? { tone: "emerald", text: "无错误" }
      : status.errorsLast24h < 10
        ? { tone: "amber", text: "少量错误" }
        : { tone: "rose", text: "错误较多" }
    : { tone: "slate", text: "—" };

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight">实时状态</h2>
          <p className="text-sm text-muted-foreground">
            系统健康 + 资源使用 + 最近告警
            {status && (
              <span className="ml-2 text-[11px] text-muted-foreground">
                更新于 {new Date(status.timestamp).toLocaleTimeString("zh-CN")}
              </span>
            )}
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

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : status ? (
        <>
          {/* Counts row */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {COUNT_META.map((m) => {
              const Icon = m.icon;
              const t = TONE[m.tone];
              return (
                <Card key={m.key} className="gap-1 py-3.5">
                  <CardContent className="px-3.5 space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                        {m.label}
                      </p>
                      <div className={`size-6 grid place-items-center rounded-md ${t.bg} ${t.fg}`}>
                        <Icon className="size-3.5" />
                      </div>
                    </div>
                    <p className="text-2xl font-semibold tracking-tight tabular-nums">
                      {status.counts[m.key]}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Health row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Card className="py-3.5">
              <CardContent className="px-4 space-y-1">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                  错误 (24h)
                </p>
                <div className="flex items-center gap-2">
                  <p className="text-3xl font-semibold tabular-nums">
                    {status.errorsLast24h}
                  </p>
                  <Badge
                    variant={
                      errorHealth.tone === "emerald"
                        ? "default"
                        : errorHealth.tone === "amber"
                          ? "secondary"
                          : "destructive"
                    }
                  >
                    {errorHealth.text}
                  </Badge>
                </div>
              </CardContent>
            </Card>
            <Card className="py-3.5 md:col-span-2">
              <CardContent className="px-4 space-y-2">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                  今日用量
                </p>
                <div className="grid grid-cols-4 gap-3">
                  {["token", "skill", "mcp", "knowledge"].map((dim) => (
                    <div key={dim} className="space-y-0.5">
                      <p className="text-[10px] text-muted-foreground">{dim}</p>
                      <p className="text-xl font-semibold tabular-nums">
                        {status.usageToday[dim] ?? 0}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}

      {/* Bot error summary */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="size-4 text-muted-foreground" />
            Bot 错误排行 (最近 {alerts.length} 条)
          </CardTitle>
          <CardDescription>按错误次数排序,显示每个 bot 最近一条错误</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : botSummary.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">暂无告警</p>
          ) : (
            <div className="space-y-2">
              {botSummary.slice(0, 10).map((b) => (
                <div
                  key={b.botName}
                  className="rounded-md border border-border bg-card p-3 flex items-start gap-3"
                >
                  <div className="size-9 rounded-md bg-rose-500/10 text-rose-500 grid place-items-center shrink-0">
                    <AlertTriangle className="size-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="font-medium text-sm">{b.botName}</p>
                      <Badge variant="destructive" className="tabular-nums">
                        {b.count}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 font-mono break-all">
                      {b.lastError}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      最近: {formatTs(b.lastAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
