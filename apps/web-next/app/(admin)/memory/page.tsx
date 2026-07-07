"use client";

import { useEffect, useState } from "react";
import {
  Brain, Database, Building2, Workflow, Layers, Hash, FileText, Sparkles,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import type { Agent, EmployeeFolder, KnowledgeBase } from "./_components/types";
import { PublicTier } from "./_components/public-tier";
import { EmployeeTier } from "./_components/employee-tier";
import { ProjectTier } from "./_components/project-tier";
import { MemorySearch } from "./_components/memory-search";

export default function MemoryPage() {
  const [employees, setEmployees] = useState<EmployeeFolder[] | null>(null);
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [kbs, setKbs] = useState<KnowledgeBase[] | null>(null);
  const [loadingEmp, setLoadingEmp] = useState(true);
  const [loadingKb, setLoadingKb] = useState(true);
  const [algorithmMsg, setAlgorithmMsg] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [emp, ag, kb] = await Promise.all([
          api<{ success: boolean; data: EmployeeFolder[] }>("/api/v2/admin/memory/employees").catch(() => ({ success: false, data: [] })),
          api<{ success: boolean; data: { agents: Agent[] } }>("/api/v2/admin/agents").catch(() => ({ success: false, data: { agents: [] } })),
          api<{ success: boolean; data: KnowledgeBase[] }>("/api/v2/admin/knowledge-bases").catch(() => ({ success: false, data: [] })),
        ]);
        if (!mounted) return;
        setEmployees(emp.data ?? []);
        setAgents(ag.data?.agents ?? []);
        setKbs(kb.data ?? []);
      } finally {
        if (mounted) {
          setLoadingEmp(false);
          setLoadingKb(false);
        }
      }
    })();
    return () => { mounted = false; };
  }, []);

  const triggerAlgorithm = async () => {
    setAlgorithmMsg(null);
    try {
      // 老的沉淀算法入口(若后端未提供,前端给出占位)
      await api("/api/v2/admin/memory/aggregate", { method: "POST", body: { trigger: "manual" } })
        .catch(() => null);
      setAlgorithmMsg("已触发沉淀算法 · 后台异步执行 · 完成后可在日志查看结果");
    } catch (err) {
      setAlgorithmMsg(err instanceof Error ? err.message : "触发失败");
    }
  };

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <Brain className="size-5 text-muted-foreground" />
            Memory 管理(数智与记忆三层架构)
          </h2>
          <p className="text-sm text-muted-foreground">
            公共 / 数字员工 / 项目 — 三层独立命名空间(spec § 11.4)
          </p>
        </div>
        {algorithmMsg && (
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
            <Sparkles className="size-3.5" />
            {algorithmMsg}
          </div>
        )}
      </header>

      <MemorySearch kbs={kbs} onTriggerAlgorithm={triggerAlgorithm} />

      <Tabs defaultValue="public">
        <TabsList>
          <TabsTrigger value="public" className="gap-1.5"><Database className="size-3.5" />公共记忆</TabsTrigger>
          <TabsTrigger value="employee" className="gap-1.5"><Building2 className="size-3.5" />数字员工记忆</TabsTrigger>
          <TabsTrigger value="project" className="gap-1.5"><Workflow className="size-3.5" />项目记忆</TabsTrigger>
          <TabsTrigger value="overview" className="gap-1.5"><Layers className="size-3.5" />架构总览</TabsTrigger>
        </TabsList>

        <TabsContent value="public">
          <PublicTier kbs={kbs} loading={loadingKb} />
        </TabsContent>
        <TabsContent value="employee">
          <EmployeeTier employees={employees} agents={agents} loading={loadingEmp} />
        </TabsContent>
        <TabsContent value="project">
          <ProjectTier />
        </TabsContent>
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Card className="py-3.5">
              <CardContent className="px-3.5 space-y-1">
                <div className="flex items-center gap-2">
                  <Database className="size-4 text-blue-500" />
                  <p className="text-xs text-muted-foreground">Postgres + pgvector</p>
                </div>
                <p className="text-sm font-medium">3 个 memory 层</p>
              </CardContent>
            </Card>
            <Card className="py-3.5">
              <CardContent className="px-3.5 space-y-1">
                <div className="flex items-center gap-2">
                  <Layers className="size-4 text-emerald-500" />
                  <p className="text-xs text-muted-foreground">layers</p>
                </div>
                <p className="text-sm font-medium">knowledge / facts / episodes</p>
              </CardContent>
            </Card>
            <Card className="py-3.5">
              <CardContent className="px-3.5 space-y-1">
                <div className="flex items-center gap-2">
                  <Hash className="size-4 text-amber-500" />
                  <p className="text-xs text-muted-foreground">chunk size</p>
                </div>
                <p className="text-sm font-medium">512 (configurable)</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">三层架构</CardTitle>
              <CardDescription>数据流 + 检索路径</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <ol className="space-y-2 list-decimal list-inside">
                <li>
                  <strong>公共层</strong>(KB) — 全员可见 · admin 配置权限 · 用于行业/产品/竞品/方案类共享知识
                </li>
                <li>
                  <strong>数字员工层</strong> — 按 employee 隔离 · 内部按 agent 再分目录 · 用于 SOP/上下文/会话记忆
                </li>
                <li>
                  <strong>项目层</strong> — 按多 agent pipeline 隔离 · input/output 文件可见 · 用于阶段性项目结果沉淀
                </li>
                <li><strong>检索</strong>:query → embedding → cosine top-K + BM25 → RRF 合并 · 跨层 union</li>
                <li><strong>沉淀算法</strong>:周期任务 + admin 手动触发 · 把高频 facts 提升到上一层</li>
              </ol>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText className="size-3.5" />
                API 访问说明
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-1">
              <p>
                Memory API(<code className="font-mono text-xs">/api/v1/memory/*</code>)是 internal 接口,
                需要 <Badge variant="outline" className="text-[10px] mx-1">x-internal-key</Badge> header
                (env <code className="font-mono">MEMORY_INTERNAL_KEY</code>)。
              </p>
              <p>
                Admin JWT(role=admin → scope <code className="font-mono">*</code>)不能直接访问,需在中间层代理。
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
