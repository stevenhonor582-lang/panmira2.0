"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, XCircle, Clock, Loader2, ArrowRight, SkipForward, AlertCircle, FileText } from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface NodeState {
  status: "pending" | "running" | "success" | "failed" | "skipped";
  input?: unknown;
  output?: unknown;
  error?: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  tokensUsed?: number;
}

interface Run {
  id: string;
  pipelineId: string;
  status: string;
  triggeredBy: string;
  triggeredByRef: string | null;
  currentNodeId: string | null;
  nodeStates: Record<string, NodeState>;
  result: unknown;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
}

interface PipelineNode { id: string; label: string; agentTemplateId: string; }

const STATUS_TONE: Record<string, string> = {
  pending: "bg-zinc-500/15 text-zinc-500 border-zinc-500/30",
  running: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  success: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  failed: "bg-rose-500/15 text-rose-600 border-rose-500/30",
  skipped: "bg-zinc-500/15 text-zinc-500 border-zinc-500/30",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "等待",
  running: "运行中",
  success: "成功",
  failed: "失败",
  skipped: "跳过",
};

const STATUS_ICON: Record<string, typeof CheckCircle2> = {
  pending: Clock,
  running: Loader2,
  success: CheckCircle2,
  failed: XCircle,
  skipped: SkipForward,
};

function fmtDuration(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("zh-CN", { hour12: false });
}

export default function RunTimelinePage({ params }: { params: { id: string; runId: string } }) {
  const [run, setRun] = useState<Run | null>(null);
  const [nodes, setNodes] = useState<PipelineNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedNode, setExpandedNode] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [runRes, pipeRes] = await Promise.all([
        api<{ success: boolean; data: { run: Run } }>(`/api/v2/admin/pipelines/${params.id}/runs/${params.runId}`),
        api<{ success: boolean; data: { nodes: PipelineNode[] } }>(`/api/v2/admin/pipelines/${params.id}`),
      ]);
      setRun(runRes.data.run);
      setNodes(pipeRes.data.nodes);
    } finally {
      setLoading(false);
    }
  }, [params.id, params.runId]);

  useEffect(() => { load(); }, [load]);

  if (loading || !run) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  // 计算累计耗时(节点开始时间差)
  const totalStart = run.startedAt;
  const totalEnd = run.finishedAt ?? new Date().toISOString();

  return (
    <div className="space-y-6 p-6 max-w-5xl">
      <Link href={`/agents/pipelines/${params.id}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" />
        返回 Pipeline 详情
      </Link>

      {/* 头部 */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-3">
          Run #{run.id.slice(0, 8)}
          <Badge variant="outline" className={STATUS_TONE[run.status] ?? ""}>
            {run.status}
          </Badge>
        </h1>
        <div className="text-xs text-muted-foreground mt-1 font-mono">
          {run.id}
        </div>
      </div>

      {/* 总览卡 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">触发者</div>
            <div className="text-lg font-semibold">{run.triggeredBy}</div>
            {run.triggeredByRef && <div className="text-xs text-muted-foreground font-mono">{run.triggeredByRef}</div>}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">开始时间</div>
            <div className="text-sm font-mono">{fmtTime(totalStart)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">结束时间</div>
            <div className="text-sm font-mono">{fmtTime(totalEnd)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">总耗时</div>
            <div className="text-lg font-semibold text-primary">{fmtDuration(run.durationMs)}</div>
          </CardContent>
        </Card>
      </div>

      {/* 错误 */}
      {run.error && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-4 flex items-start gap-2">
            <AlertCircle className="size-4 text-destructive mt-0.5" />
            <div>
              <div className="font-medium text-destructive">运行失败</div>
              <div className="text-sm text-destructive/80 mt-1">{run.error}</div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 节点时间线 */}
      <Card>
        <CardHeader>
          <CardTitle>节点执行时间线</CardTitle>
          <CardDescription>每个节点按拓扑顺序执行。前一个节点的 output 作为后一个节点的 input。</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {nodes.map((node, idx) => {
              const state = run.nodeStates[node.id];
              const status = state?.status ?? "pending";
              const Icon = STATUS_ICON[status] ?? Clock;
              const isExpanded = expandedNode === node.id;
              return (
                <div key={node.id} className="p-4">
                  <button
                    className="w-full flex items-center gap-3 text-left"
                    onClick={() => setExpandedNode(isExpanded ? null : node.id)}
                  >
                    <div className="flex items-center justify-center size-10 rounded-full border-2"
                      style={{ borderColor: "currentColor" }}>
                      <Icon className={"size-5 " + (status === "running" ? "animate-spin" : "")} />
                    </div>
                    <div className="flex-1">
                      <div className="font-medium">{node.label}</div>
                      <div className="text-xs text-muted-foreground font-mono">
                        id={node.id} · agent={node.agentTemplateId.slice(0, 8)}…
                      </div>
                    </div>
                    <Badge variant="outline" className={STATUS_TONE[status]}>
                      {STATUS_LABEL[status]}
                    </Badge>
                    {state?.durationMs != null && (
                      <span className="text-xs text-muted-foreground tabular-nums w-16 text-right">
                        {fmtDuration(state.durationMs)}
                      </span>
                    )}
                    {state?.tokensUsed != null && (
                      <span className="text-xs text-muted-foreground tabular-nums w-20 text-right">
                        {state.tokensUsed} tokens
                      </span>
                    )}
                    <div className="text-xs text-muted-foreground font-mono w-20 text-right">
                      {fmtTime(state?.startedAt)} → {fmtTime(state?.finishedAt)}
                    </div>
                  </button>

                  {isExpanded && state && (
                    <div className="mt-4 ml-12 grid grid-cols-1 md:grid-cols-2 gap-3">
                      {state.input !== undefined && (
                        <div className="border rounded-lg p-3 bg-muted/30">
                          <div className="flex items-center gap-1.5 text-xs font-medium mb-2">
                            <FileText className="size-3" /> Input
                          </div>
                          <pre className="font-mono text-xs overflow-auto max-h-48">
                            {JSON.stringify(state.input, null, 2)}
                          </pre>
                        </div>
                      )}
                      {state.output !== undefined && (
                        <div className="border rounded-lg p-3 bg-emerald-500/5">
                          <div className="flex items-center gap-1.5 text-xs font-medium mb-2 text-emerald-600">
                            <CheckCircle2 className="size-3" /> Output
                          </div>
                          <pre className="font-mono text-xs overflow-auto max-h-48">
                            {JSON.stringify(state.output, null, 2)}
                          </pre>
                        </div>
                      )}
                      {state.error && (
                        <div className="border rounded-lg p-3 bg-rose-500/5 md:col-span-2">
                          <div className="flex items-center gap-1.5 text-xs font-medium mb-2 text-rose-600">
                            <XCircle className="size-3" /> Error
                          </div>
                          <pre className="font-mono text-xs text-rose-700">{state.error}</pre>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 节点之间的箭头(流程图可视化) */}
                  {idx < nodes.length - 1 && (
                    <div className="ml-12 mt-2 text-muted-foreground/40">
                      <ArrowRight className="size-3.5 inline" /> ↓ 传给下一节点
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* 最终结果 */}
      {run.result !== null && run.result !== undefined && (
        <Card>
          <CardHeader>
            <CardTitle>最终结果</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="font-mono text-xs bg-muted/50 p-4 rounded overflow-auto max-h-96">
              {JSON.stringify(run.result, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
