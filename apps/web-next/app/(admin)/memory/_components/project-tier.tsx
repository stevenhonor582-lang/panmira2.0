"use client";

import { useEffect, useMemo, useState } from "react";
import { Workflow, FolderOpen, FileText, Upload, RefreshCw, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { PipelineProject } from "./types";

interface PipelinesResp {
  pipelines?: Array<{
    id: string;
    name: string;
    description?: string;
    agentCount?: number;
    updatedAt?: string;
  }>;
}

interface Props {
  refreshKey?: number;
}

export function ProjectTier(_: Props) {
  void _; // 暂不响应外部 refresh key
  const [projects, setProjects] = useState<PipelineProject[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api<PipelinesResp>("/api/v2/admin/agents/pipelines").catch(() => ({} as PipelinesResp));
      const list = r.pipelines ?? [];
      const mapped: PipelineProject[] = list.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description ?? "",
        agentCount: p.agentCount ?? 0,
        updatedAt: p.updatedAt ?? new Date().toISOString(),
        inputCount: 0,
        outputCount: 0,
        memoryPath: `projects/${p.id}`,
      }));
      setProjects(mapped);
      if (mapped.length > 0 && !selected) setSelected(mapped[0].id);
    } catch {
      setProjects([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const sel = useMemo(() => (projects ?? []).find((p) => p.id === selected) ?? null, [projects, selected]);

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Workflow className="size-4 text-violet-500" />
            项目记忆(多 Agent 流水线)
          </CardTitle>
          <CardDescription>每个 pipeline 一个文件夹 · 包含输入/输出文件</CardDescription>
        </div>
        <Button onClick={load} size="sm" variant="outline" className="gap-1.5">
          {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}刷新
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
          </div>
        ) : !projects || projects.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            暂无项目 — 在 <a href="/agents/pipelines" className="text-primary hover:underline">多 Agent 编排</a> 创建第一个
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-3">
            <div className="space-y-1">
              {projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelected(p.id)}
                  className={`w-full flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors text-left ${
                    selected === p.id ? "bg-primary/10 text-primary" : "hover:bg-muted/40"
                  }`}
                >
                  <Workflow className="size-3.5" />
                  <span className="flex-1 truncate">{p.name}</span>
                  <Badge variant="outline" className="text-[10px]">{p.agentCount}a</Badge>
                </button>
              ))}
            </div>

            {sel && (
              <div className="rounded-md border border-border bg-card p-3 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-medium">{sel.name}</h4>
                    <p className="text-xs text-muted-foreground">{sel.description || "—"}</p>
                    <p className="text-[10px] text-muted-foreground font-mono mt-1">{sel.memoryPath}/</p>
                  </div>
                  <Button size="sm" variant="outline" className="gap-1.5">
                    <Upload className="size-3.5" />上传
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-md border border-border p-2">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">输入</p>
                    <ul className="space-y-1">
                      <li className="flex items-center gap-1.5 text-xs">
                        <FileText className="size-3 text-muted-foreground" />
                        <code className="font-mono truncate">input.jsonl</code>
                      </li>
                      <li className="flex items-center gap-1.5 text-xs">
                        <FileText className="size-3 text-muted-foreground" />
                        <code className="font-mono truncate">schema.yaml</code>
                      </li>
                    </ul>
                  </div>
                  <div className="rounded-md border border-border p-2">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">输出</p>
                    <ul className="space-y-1">
                      <li className="flex items-center gap-1.5 text-xs">
                        <FileText className="size-3 text-muted-foreground" />
                        <code className="font-mono truncate">output.jsonl</code>
                      </li>
                      <li className="flex items-center gap-1.5 text-xs">
                        <FileText className="size-3 text-muted-foreground" />
                        <code className="font-mono truncate">report.md</code>
                      </li>
                    </ul>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <FolderOpen className="size-3" />更新 {new Date(sel.updatedAt).toLocaleString("zh-CN")}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
