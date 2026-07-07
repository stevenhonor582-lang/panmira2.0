"use client";

import { use, useCallback, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, MessageSquare, RefreshCw } from "lucide-react";
import { usePolling } from "@/lib/use-polling";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type BotSession,
  STATUS_LABEL, STATUS_TONE, fmtAge,
} from "../../_components/types";

export default function BotLogDetailPage({
  params,
}: { params: Promise<{ botName: string }> }) {
  const { botName } = use(params);
  const decoded = decodeURIComponent(botName);

  const fetcher = useCallback(async () => {
    const r = await api<{ success: boolean; data: { items: BotSession[] } }>(
      `/api/v2/admin/runtime/sessions?bot=${encodeURIComponent(decoded)}&limit=200`,
    );
    return r.data.items;
  }, [decoded]);

  const { data, loading, refresh } = usePolling({ fetcher, intervalMs: 15_000 });

  const totalTokens = (data ?? []).reduce((s, x) => s + x.cumulativeTokens, 0);
  const totalCost = (data ?? []).reduce((s, x) => s + Number(x.cumulativeCostUsd), 0);

  return (
    <div className="space-y-5">
      <header>
        <nav className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
          <Link href="/logs" className="hover:text-foreground">对话日志</Link>
          <ChevronRight className="size-3" />
          <Link href="/logs/bots" className="hover:text-foreground">Bot 日志</Link>
          <ChevronRight className="size-3" />
          <span className="text-foreground font-mono">{decoded}</span>
        </nav>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
              <MessageSquare className="size-5 text-blue-500" />
              {decoded}
            </h2>
            <p className="text-sm text-muted-foreground">
              {data?.length ?? 0} 个 session · {totalTokens.toLocaleString()} tokens · ${totalCost.toFixed(4)}
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/logs/bots"><Button variant="outline" size="sm"><ChevronLeft className="size-4 mr-1" /> 返回列表</Button></Link>
            <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
              <RefreshCw className={`size-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              刷新
            </Button>
          </div>
        </div>
      </header>

      <Card>
        <CardContent className="p-0">
          {loading && !data ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : (data?.length ?? 0) === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              该 Bot 暂无 session
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3 text-left">状态</th>
                    <th className="px-4 py-3 text-left">Session</th>
                    <th className="px-4 py-3 text-left">Chat ID</th>
                    <th className="px-4 py-3 text-left">模型</th>
                    <th className="px-4 py-3 text-right">Tokens</th>
                    <th className="px-4 py-3 text-right">花费</th>
                    <th className="px-4 py-3 text-left">最后活动</th>
                  </tr>
                </thead>
                <tbody>
                  {data!.map((s) => (
                    <tr key={s.id} className="border-t hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={STATUS_TONE[s.status]}>
                          {STATUS_LABEL[s.status]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {s.sessionId ? s.sessionId.slice(0, 12) + "…" : "—"}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground truncate max-w-[180px]" title={s.chatId}>
                        {s.chatId}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{s.model ?? "—"}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{s.cumulativeTokens.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right tabular-nums">${Number(s.cumulativeCostUsd).toFixed(4)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{fmtAge(s.lastUsed)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
