"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { ChevronRight, Cpu, RefreshCw, Search, Workflow } from "lucide-react";
import { usePolling } from "@/lib/use-polling";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type AgentRun,
  RUN_STATUS_LABEL, RUN_STATUS_TONE, fmtAge, fmtDuration,
} from "../_components/types";

export default function AgentLogsPage() {
  const [query, setQuery] = useState("");

  const fetcher = useCallback(async () => {
    const r = await api<{ success: boolean; data: { items: AgentRun[] } }>(
      "/api/v2/admin/agents/runs?limit=200",
    );
    return r.data.items;
  }, []);

  const { data, loading, refresh } = usePolling({ fetcher, intervalMs: 30_000 });

  const filtered = (data ?? []).filter((r) =>
    !query ||
    r.agentName.toLowerCase().includes(query.toLowerCase()) ||
    (r.pipelineName ?? "").toLowerCase().includes(query.toLowerCase()) ||
    (r.message ?? "").toLowerCase().includes(query.toLowerCase()),
  );

  const byAgent = filtered.reduce<Record<string, AgentRun[]>>((acc, r) => {
    (acc[r.agentName] ??= []).push(r);
    return acc;
  }, {});
  const agentNames = Object.keys(byAgent).sort();

  const totalTokens = filtered.reduce((s, r) => s + r.totalTokens, 0);
  const totalCost = filtered.reduce((s, r) => s + Number(r.costUsd), 0);
  const runningCount = filtered.filter((r) => r.status === "running").length;

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <nav className="flex items-center gap-1 text-xs text-muted-foreground">
            <Link href="/logs" className="hover:text-foreground">对话日志</Link>
            <ChevronRight className="size-3" />
            <span className="text-foreground">Agent 日志</span>
          </nav>
          <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <Cpu className="size-5 text-violet-500" />
            Agent 执行日志
          </h2>
          <p className="text-sm text-muted-foreground">
            {agentNames.length} 个 Agent · {filtered.length} 次执行 · 30s 自动刷新
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
          <RefreshCw className={`size-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          刷新
        </Button>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="执行中" value={runningCount} tone="text-blue-600" />
        <KpiCard label="今日 Tokens" value={totalTokens} tone="text-violet-600" />
        <KpiCard label="今日花费" value={`$${totalCost.toFixed(4)}`} tone="text-emerald-600" />
        <KpiCard label="失败" value={filtered.filter((r) => r.status === "failed").length} tone="text-rose-600" />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Search className="size-4 text-muted-foreground" />
            <Input
              placeholder="搜索 Agent 名 / pipeline / 错误信息..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1"
            />
            <span className="text-sm text-muted-foreground tabular-nums">{filtered.length} 条</span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading && !data ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              {query ? "没有匹配的执行记录" : "暂无 Agent 执行记录"}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {agentNames.map((agentName) => {
                const runs = byAgent[agentName];
                const tokens = runs.reduce((s, r) => s + r.totalTokens, 0);
                return (
                  <div key={agentName} className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <Link
                        href={`/logs/agents/${encodeURIComponent(agentName)}`}
                        className="font-medium text-sm flex items-center gap-1.5 hover:text-primary"
                      >
                        <Workflow className="size-3.5" />
                        {agentName}
                        <ChevronRight className="size-3" />
                      </Link>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{runs.length} 次</span>
                        <span>{tokens.toLocaleString()} tokens</span>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-muted-foreground">
                            <th className="text-left py-1 px-2 font-medium">状态</th>
                            <th className="text-left py-1 px-2 font-medium">Pipeline</th>
                            <th className="text-right py-1 px-2 font-medium">Tokens</th>
                            <th className="text-right py-1 px-2 font-medium">耗时</th>
                            <th className="text-right py-1 px-2 font-medium">花费</th>
                            <th className="text-left py-1 px-2 font-medium">开始</th>
                          </tr>
                        </thead>
                        <tbody>
                          {runs.map((r) => (
                            <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                              <td className="py-1.5 px-2">
                                <Badge variant="outline" className={`text-[10px] ${RUN_STATUS_TONE[r.status]}`}>
                                  {RUN_STATUS_LABEL[r.status]}
                                </Badge>
                              </td>
                              <td className="py-1.5 px-2 text-xs text-muted-foreground truncate max-w-[200px]" title={r.pipelineName ?? ""}>
                                {r.pipelineName ?? "—"}
                              </td>
                              <td className="py-1.5 px-2 text-right tabular-nums text-xs">{r.totalTokens.toLocaleString()}</td>
                              <td className="py-1.5 px-2 text-right tabular-nums text-xs">{fmtDuration(r.durationMs)}</td>
                              <td className="py-1.5 px-2 text-right tabular-nums text-xs">${Number(r.costUsd).toFixed(4)}</td>
                              <td className="py-1.5 px-2 text-muted-foreground text-xs">{fmtAge(r.startedAt)}</td>
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

function KpiCard({ label, value, tone }: { label: string; value: number | string; tone: string }) {
  return (
    <Card className="py-3.5">
      <CardContent className="px-3.5 space-y-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-lg font-semibold tabular-nums ${tone}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
