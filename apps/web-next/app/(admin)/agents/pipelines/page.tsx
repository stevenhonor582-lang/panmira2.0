"use client";

import { useCallback, useEffect, useState } from "react";
import { Workflow, Play, RefreshCw, Plus, Trash2, GitBranch, CheckCircle2, XCircle, Clock } from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface Pipeline {
  id: string;
  name: string;
  description: string | null;
  triggerType: string;
  nodes: Array<{ id: string; label: string; agentTemplateId: string }>;
  edges: Array<{ from: string; to: string }>;
  enabled: boolean;
  runCount: number;
  successCount: number;
  avgDurationMs: number | null;
  createdAt: string;
}

const TRIGGER_LABEL: Record<string, string> = {
  bot: "Bot 触发",
  cron: "定时",
  event: "事件",
  manual: "手动",
  api: "API",
};

export default function PipelinesPage() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<{ success: boolean; data: Pipeline[] }>("/api/v2/admin/pipelines");
      setPipelines(r.data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleTrigger(id: string) {
    await api(`/api/v2/admin/pipelines/${id}/trigger`, {
      method: "POST",
      body: { triggeredBy: "user", initialInput: { startedBy: "admin" } },
    });
    await load();
  }

  async function handleDelete(id: string) {
    if (!confirm("确认删除?")) return;
    await api(`/api/v2/admin/pipelines/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">多 Agent 编排 (Pipelines)</h1>
          <p className="text-sm text-muted-foreground">
            把多个 Agent 串成 DAG,自动传递状态。多用于"内容生产""订单处理"等内部业务流水线。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`size-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            刷新
          </Button>
          <Button size="sm">
            <Plus className="size-4 mr-2" />
            新建 Pipeline
          </Button>
        </div>
      </div>

      {loading && pipelines.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-48" />)}
        </div>
      ) : pipelines.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <GitBranch className="size-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground mb-2">暂无 Pipeline</p>
            <p className="text-xs text-muted-foreground">
              示例: 选题 Agent → 协作 Agent → 审核 Agent,组成内容生产流水线
            </p>
            <Button className="mt-4">
              <Plus className="size-4 mr-2" />
              创建第一个 Pipeline
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {pipelines.map((p) => {
            const successRate = p.runCount > 0 ? Math.round((p.successCount / p.runCount) * 100) : 0;
            return (
              <Card key={p.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Workflow className="size-4 text-primary" />
                      {p.name}
                    </CardTitle>
                    <Badge variant="outline">{TRIGGER_LABEL[p.triggerType] ?? p.triggerType}</Badge>
                  </div>
                  {p.description && <CardDescription className="line-clamp-2">{p.description}</CardDescription>}
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-xs text-muted-foreground">
                    {p.nodes.length} 个节点 · {p.edges.length} 条连线
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <div className="flex items-center gap-1">
                      <CheckCircle2 className="size-3.5 text-emerald-600" />
                      <span className="tabular-nums">{p.runCount}</span>
                      <span className="text-muted-foreground text-xs">运行</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <XCircle className="size-3.5 text-rose-500" />
                      <span className="tabular-nums">{p.runCount - p.successCount}</span>
                      <span className="text-muted-foreground text-xs">失败</span>
                    </div>
                    {p.avgDurationMs !== null && (
                      <div className="flex items-center gap-1 ml-auto">
                        <Clock className="size-3.5 text-muted-foreground" />
                        <span className="tabular-nums text-xs">{p.avgDurationMs}ms</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => handleTrigger(p.id)}>
                      <Play className="size-3.5 mr-1" /> 运行
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleDelete(p.id)}>
                      <Trash2 className="size-3.5" />
                    </Button>
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
