"use client";

import { useCallback } from "react";
import { RefreshCw, Pause, Activity, DollarSign, Bot } from "lucide-react";
import { usePolling } from "@/lib/use-polling";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface Stats {
  activeSessions: number;
  totalToday: number;
  totalCostToday: number;
  byBot: Array<{ botName: string; count: number; totalCost: number; totalTokens: number }>;
}

interface Session {
  id: string;
  botName: string;
  sessionId: string | null;
  workingDirectory: string;
  model: string | null;
  engine: string | null;
  lastUsed: number;
  status: "active" | "idle" | "archived";
  cumulativeTokens: number;
  cumulativeCostUsd: string;
  cumulativeDurationMs: number;
  interruptRequested: boolean;
}

function fmtAge(epochMs: number): string {
  const diff = Date.now() - epochMs;
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return `${Math.floor(diff / 86_400_000)} 天前`;
}

const STATUS_LABEL: Record<Session["status"], string> = {
  active: "活跃",
  idle: "空闲",
  archived: "已归档",
};

const STATUS_TONE: Record<Session["status"], string> = {
  active: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  idle: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  archived: "bg-zinc-500/15 text-zinc-500 border-zinc-500/30",
};

export default function RuntimeConsolePage() {
  const fetcher = useCallback(async () => {
    const [stats, sessions] = await Promise.all([
      api<{ success: boolean; data: Stats }>("/api/v2/admin/runtime/stats"),
      api<{ success: boolean; data: { items: Session[] } }>("/api/v2/admin/runtime/sessions?limit=50"),
    ]);
    return { stats: stats.data, sessions: sessions.data.items };
  }, []);

  const { data, loading, error, refresh } = usePolling({ fetcher, intervalMs: 30_000 });

  async function handleInterrupt(id: string) {
    if (!confirm("确认中断这个 session?")) return;
    await api(`/api/v2/admin/runtime/sessions/${id}/interrupt`, { method: "POST" });
    refresh();
  }

  if (loading && !data) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-destructive">
        加载失败: {error.message}
      </div>
    );
  }

  const stats = data?.stats;
  const sessions = data?.sessions ?? [];

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Runtime Console</h1>
          <p className="text-sm text-muted-foreground">实时监控所有 Bot 的运行 session(30s 自动刷新)</p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
          <RefreshCw className={`size-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          刷新
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Activity className="size-4" /> 活跃中
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold text-emerald-600">{stats?.activeSessions ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Bot className="size-4" /> 今日总数
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{stats?.totalToday ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="size-4" /> 今日花费
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">${(stats?.totalCostToday ?? 0).toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">活跃 Bot 数</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{stats?.byBot.length ?? 0}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Session 列表</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">状态</th>
                  <th className="px-4 py-3 text-left">Bot</th>
                  <th className="px-4 py-3 text-left">模型</th>
                  <th className="px-4 py-3 text-left">最后活动</th>
                  <th className="px-4 py-3 text-right">花费</th>
                  <th className="px-4 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((sess) => (
                  <tr key={sess.id} className="border-t hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={STATUS_TONE[sess.status]}>
                        {STATUS_LABEL[sess.status]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{sess.botName}</div>
                      <div className="text-xs text-muted-foreground font-mono truncate max-w-xs" title={sess.workingDirectory}>
                        {sess.workingDirectory || "—"}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{sess.model || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{fmtAge(sess.lastUsed)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">${Number(sess.cumulativeCostUsd).toFixed(4)}</td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleInterrupt(sess.id)}
                        disabled={sess.status !== "active"}
                      >
                        <Pause className="size-3 mr-1" /> 中断
                      </Button>
                    </td>
                  </tr>
                ))}
                {sessions.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                      暂无 session
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
