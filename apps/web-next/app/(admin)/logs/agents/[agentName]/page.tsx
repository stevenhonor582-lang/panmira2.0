"use client";

import { use, useCallback, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Cpu, RefreshCw, Workflow, AlertCircle } from "lucide-react";
import { usePolling } from "@/lib/use-polling";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type AgentRun,
  RUN_STATUS_LABEL, RUN_STATUS_TONE, fmtAge, fmtDuration,
} from "../../_components/types";

export default function AgentLogDetailPage({
  params,
}: { params: Promise<{ agentName: string }> }) {
  const { agentName } = use(params);
  const decoded = decodeURIComponent(agentName);

  const fetcher = useCallback(async () => {
    const r = await api<{ success: boolean; data: { items: AgentRun[] } }>(
      `/api/v2/admin/agents/runs?agent=${encodeURIComponent(decoded)}&limit=100`,
    );
    return r.data.items;
  }, [decoded]);

  const { data, loading, refresh } = usePolling({ fetcher, intervalMs: 15_000 });

  const totalTokens = (data ?? []).reduce((s, x) => s + x.totalTokens, 0);
  const totalCost = (data ?? []).reduce((s, x) => s + Number(x.costUsd), 0);
  const totalDuration = (data ?? []).reduce((s, x) => s + x.durationMs, 0);
  const failCount = (data ?? []).filter((x) => x.status === "failed").length;

  return (
    <div className="space-y-5">
      <header>
        <nav className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
          <Link href="/logs" className="hover:text-foreground">对话日志</Link>
          <ChevronRight className="size-3" />
          <Link href="/logs/agents" className="hover:text-foreground">Agent 日志</Link>
          <ChevronRight className="size-3" />
          <span className="text-foreground font-mono">{decoded}</span>
        </nav>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
              <Cpu className="size-5 text-violet-500" />
              {decoded}
            </h2>
            <p className="text-sm text-muted-foreground">
              {data?.length ?? 0} 次执行 · {totalTokens.toLocaleString()} tokens · ${totalCost.toFixed(4)}
              {failCount > 0 && <span className="text-rose-500 ml-2">· {failCount} 失败</span>}
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/logs/agents"><Button variant="outline" size="sm"><ChevronLeft className="size-4 mr-1" /> 返回列表</Button></Link>
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
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
            </div>
          ) : (data?.length ?? 0) === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              该 Agent 暂无执行记录
            </div>
          ) : (
            <div className="divide-y divide-border">
              {data!.map((r) => (
                <div key={r.id} className="p-4 space-y-2">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={RUN_STATUS_TONE[r.status]}>
                        {RUN_STATUS_LABEL[r.status]}
                      </Badge>
                      {r.pipelineName && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Workflow className="size-3" />
                          {r.pipelineName}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {fmtAge(r.startedAt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground tabular-nums">
                      <span>in/out: {r.inputTokens}/{r.outputTokens}</span>
                      <span>{fmtDuration(r.durationMs)}</span>
                      <span>${Number(r.costUsd).toFixed(4)}</span>
                    </div>
                  </div>
                  {r.message && (
                    <div className="flex items-start gap-2 text-xs rounded-md bg-muted/40 px-3 py-2">
                      <AlertCircle className={`size-3.5 mt-0.5 shrink-0 ${
                        r.status === "failed" ? "text-rose-500" : "text-muted-foreground"
                      }`} />
                      <span className="font-mono break-all">{r.message}</span>
                    </div>
                  )}
                </div>
              ))}
              {data!.length > 0 && (
                <div className="p-4 bg-muted/30 text-xs text-muted-foreground">
                  累计 {totalDuration > 0 ? fmtDuration(totalDuration) : "—"} · 失败 {failCount} 次
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
