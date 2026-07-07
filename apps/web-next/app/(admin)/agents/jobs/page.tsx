"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock, Zap, Webhook, Play, Plus, Trash2, RefreshCw, AlertCircle } from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface ScheduledJob {
  id: string;
  name: string;
  description: string | null;
  triggerType: "cron" | "event" | "manual";
  cronExpression: string | null;
  eventTopic: string | null;
  enabled: boolean;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastDurationMs: number | null;
  lastError: string | null;
  runCount: number;
  successCount: number;
  agentTemplateId: string;
}

const TRIGGER_META: Record<string, { label: string; icon: typeof Clock; tone: string }> = {
  cron: { label: "定时任务", icon: Clock, tone: "bg-blue-500/15 text-blue-600 border-blue-500/30" },
  event: { label: "事件触发", icon: Webhook, tone: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
  manual: { label: "手动", icon: Zap, tone: "bg-zinc-500/15 text-zinc-500 border-zinc-500/30" },
};

const STATUS_TONE: Record<string, string> = {
  success: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  failed: "bg-rose-500/15 text-rose-600 border-rose-500/30",
  timeout: "bg-orange-500/15 text-orange-600 border-orange-500/30",
  pending: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  running: "bg-blue-500/15 text-blue-600 border-blue-500/30",
};

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return `${Math.floor(diff / 86_400_000)} 天前`;
}

export default function ScheduledJobsPage() {
  const [jobs, setJobs] = useState<ScheduledJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api<{ success: boolean; data: ScheduledJob[] }>("/api/v2/admin/scheduled-jobs");
      setJobs(r.data ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleTrigger(id: string) {
    if (!confirm("手动触发这个 Job?")) return;
    await api(`/api/v2/admin/scheduled-jobs/${id}/trigger`, { method: "POST" });
    await load();
  }

  async function handleDelete(id: string) {
    if (!confirm("确认删除这个 Job?")) return;
    await api(`/api/v2/admin/scheduled-jobs/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">定时任务 / 事件触发</h1>
          <p className="text-sm text-muted-foreground">
            让 Agent 自动执行(cron 定时 / 事件触发 / 手动触发)。用于"内部业务处理"类 Agent。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`size-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            刷新
          </Button>
          <Button size="sm">
            <Plus className="size-4 mr-2" />
            新建 Job
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-6 text-destructive text-sm flex items-center gap-2">
            <AlertCircle className="size-4" /> {error}
          </CardContent>
        </Card>
      )}

      {loading && jobs.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-48" />)}
        </div>
      ) : jobs.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Clock className="size-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground mb-1">暂无定时任务</p>
            <p className="text-xs text-muted-foreground">
              把一个 Agent 模板配成 cron / event / manual 触发,让它自动跑业务逻辑
            </p>
            <Button className="mt-4">
              <Plus className="size-4 mr-2" /> 创建第一个 Job
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {jobs.map((job) => {
            const meta = TRIGGER_META[job.triggerType] ?? TRIGGER_META.manual!;
            const Icon = meta.icon;
            return (
              <Card key={job.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base">{job.name}</CardTitle>
                    <Badge variant="outline" className={meta.tone}>
                      <Icon className="size-3 mr-1" />
                      {meta.label}
                    </Badge>
                  </div>
                  {job.description && (
                    <CardDescription className="line-clamp-2">{job.description}</CardDescription>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  {job.triggerType === "cron" && job.cronExpression && (
                    <div className="text-xs font-mono bg-muted/50 px-2 py-1 rounded">
                      ⏰ {job.cronExpression}
                    </div>
                  )}
                  {job.triggerType === "event" && job.eventTopic && (
                    <div className="text-xs font-mono bg-muted/50 px-2 py-1 rounded">
                      📨 topic: {job.eventTopic}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground space-y-1">
                    <div>上次运行: {fmtTime(job.lastRunAt)}</div>
                    <div>累计: {job.runCount} 次 / 成功 {job.successCount}</div>
                    {job.lastStatus && (
                      <Badge variant="outline" className={STATUS_TONE[job.lastStatus] ?? ""}>
                        {job.lastStatus}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => handleTrigger(job.id)}>
                      <Play className="size-3.5 mr-1" /> 触发
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleDelete(job.id)}>
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
