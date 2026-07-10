"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { Bot, ChevronRight, MessageSquare, RefreshCw, Search } from "lucide-react";
import { usePolling } from "@/lib/use-polling";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type BotSession,
  STATUS_LABEL, STATUS_TONE, fmtAge,
} from "../_components/types";

export default function BotLogsPage() {
  const [query, setQuery] = useState("");

  const fetcher = useCallback(async () => {
    const r = await api<{ success: boolean; data: { items: BotSession[] } }>(
      "/api/v2/admin/runtime/sessions?limit=100",
    );
    return r.data.items;
  }, []);

  const { data, loading, refresh } = usePolling({ fetcher, intervalMs: 30_000 });

  const filtered = (data ?? []).filter((s) =>
    !query ||
    s.botName.toLowerCase().includes(query.toLowerCase()) ||
    s.chatId.toLowerCase().includes(query.toLowerCase()) ||
    (s.sessionId ?? "").toLowerCase().includes(query.toLowerCase()) ||
    (s.model ?? "").toLowerCase().includes(query.toLowerCase()),
  );

  const byBot = filtered.reduce<Record<string, BotSession[]>>((acc, s) => {
    (acc[s.botName] ??= []).push(s);
    return acc;
  }, {});
  const botNames = Object.keys(byBot).sort();

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <nav className="flex items-center gap-1 text-xs text-muted-foreground">
            <Link href="/logs" className="hover:text-foreground">对话日志</Link>
            <ChevronRight className="size-3" />
            <span className="text-foreground">Bot 日志</span>
          </nav>
          <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <Bot className="size-5 text-blue-500" />
            Bot 对话日志
          </h2>
          <p className="text-sm text-muted-foreground">
            {botNames.length} 个 Bot · {filtered.length} 个 session · 30s 自动刷新
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
          <RefreshCw className={`size-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          刷新
        </Button>
      </header>

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
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              {query ? "没有匹配的 session" : "暂无 session"}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {botNames.map((botName) => {
                const sessions = byBot[botName];
                const activeCount = sessions.filter((s) => s.status === "active").length;
                const totalTokens = sessions.reduce((s, sess) => s + sess.cumulativeTokens, 0);
                return (
                  <div key={botName} className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <Link
                        href={`/logs/bots/${encodeURIComponent(botName)}`}
                        className="font-medium text-sm flex items-center gap-1.5 hover:text-primary"
                      >
                        <MessageSquare className="size-3.5" />
                        {botName}
                        <ChevronRight className="size-3" />
                      </Link>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{sessions.length} 个 session</span>
                        <span>{totalTokens.toLocaleString()} tokens</span>
                        {activeCount > 0 && (
                          <Badge variant="outline" className={STATUS_TONE.active}>
                            {activeCount} 活跃
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-muted-foreground">
                            <th className="text-left py-1 px-2 font-medium">状态</th>
                            <th className="text-left py-1 px-2 font-medium">会话 ID</th>
                            <th className="text-left py-1 px-2 font-medium">模型</th>
                            <th className="text-right py-1 px-2 font-medium">令牌数</th>
                            <th className="text-right py-1 px-2 font-medium">花费</th>
                            <th className="text-left py-1 px-2 font-medium">最后活动</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sessions.map((s) => (
                            <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                              <td className="py-1.5 px-2">
                                <Badge variant="outline" className={`text-[10px] ${STATUS_TONE[s.status]}`}>
                                  {STATUS_LABEL[s.status]}
                                </Badge>
                              </td>
                              <td className="py-1.5 px-2 font-mono text-xs text-muted-foreground truncate max-w-[180px]" title={s.chatId}>
                                {s.chatId}
                              </td>
                              <td className="py-1.5 px-2 text-muted-foreground text-xs">{s.model ?? "—"}</td>
                              <td className="py-1.5 px-2 text-right tabular-nums text-xs">
                                {s.cumulativeTokens.toLocaleString()}
                              </td>
                              <td className="py-1.5 px-2 text-right tabular-nums text-xs">
                                ${Number(s.cumulativeCostUsd).toFixed(4)}
                              </td>
                              <td className="py-1.5 px-2 text-muted-foreground text-xs">{fmtAge(s.lastUsed)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
