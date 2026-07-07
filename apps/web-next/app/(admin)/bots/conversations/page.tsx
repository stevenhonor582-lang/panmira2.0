"use client";

import { useEffect, useState, useCallback } from "react";
import { MessageSquare, Search, RefreshCw } from "lucide-react";
import { usePolling } from "@/lib/use-polling";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface Session {
  id: string;
  botName: string;
  chatId: string;
  sessionId: string | null;
  workingDirectory: string;
  model: string | null;
  lastUsed: number;
  status: "active" | "idle" | "archived";
  cumulativeTokens: number;
  cumulativeCostUsd: string;
}

const STATUS_TONE: Record<Session["status"], string> = {
  active: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  idle: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  archived: "bg-zinc-500/15 text-zinc-500 border-zinc-500/30",
};

const STATUS_LABEL: Record<Session["status"], string> = {
  active: "活跃",
  idle: "空闲",
  archived: "已归档",
};

function fmtAge(epochMs: number): string {
  const diff = Date.now() - epochMs;
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return `${Math.floor(diff / 86_400_000)} 天前`;
}

export default function BotConversationsPage() {
  const [query, setQuery] = useState("");

  const fetcher = useCallback(async () => {
    const r = await api<{ success: boolean; data: { items: Session[] } }>(
      "/api/v2/admin/runtime/sessions?limit=100"
    );
    return r.data.items;
  }, []);

  const { data, loading, refresh } = usePolling({ fetcher, intervalMs: 30_000 });

  const filtered = (data ?? []).filter((s) =>
    !query ||
    s.botName.toLowerCase().includes(query.toLowerCase()) ||
    s.chatId.toLowerCase().includes(query.toLowerCase()) ||
    (s.sessionId ?? "").toLowerCase().includes(query.toLowerCase()) ||
    (s.model ?? "").toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bot 对话日志</h1>
          <p className="text-sm text-muted-foreground">查看所有 Bot 的运行 session(全 Bot 全局搜索 · 30s 自动刷新)</p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
          <RefreshCw className={`size-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          刷新
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Search className="size-4 text-muted-foreground" />
            <Input
              placeholder="搜索 Bot 名 / chatId / sessionId / 模型..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1"
            />
            <span className="text-sm text-muted-foreground tabular-nums">{filtered.length} 个 session</span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading && !data ? (
            <div className="p-4 space-y-2">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3 text-left">状态</th>
                    <th className="px-4 py-3 text-left">Bot</th>
                    <th className="px-4 py-3 text-left">Chat ID</th>
                    <th className="px-4 py-3 text-left">模型</th>
                    <th className="px-4 py-3 text-right">Tokens</th>
                    <th className="px-4 py-3 text-right">花费</th>
                    <th className="px-4 py-3 text-left">最后活动</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => (
                    <tr key={s.id} className="border-t hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={STATUS_TONE[s.status]}>{STATUS_LABEL[s.status]}</Badge>
                      </td>
                      <td className="px-4 py-3 font-medium">{s.botName}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{s.chatId.slice(0, 20)}…</td>
                      <td className="px-4 py-3 text-muted-foreground">{s.model ?? "—"}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{s.cumulativeTokens.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right tabular-nums">${Number(s.cumulativeCostUsd).toFixed(4)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{fmtAge(s.lastUsed)}</td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                        {query ? "没有匹配的 session" : "暂无 session"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
