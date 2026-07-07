"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Brain, Database, FileText, Hash, Layers, Tag, Building2, Bot, Cpu,
  FolderOpen, ChevronRight, Network,
} from "lucide-react";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";

interface Agent {
  id: string;
  name: string;
  displayName: string;
  description: string;
  isActive: boolean;
  capabilities: string[];
}

interface EmployeeFolder {
  employee: string;
  department: string;
  bots: Array<{ name: string; channels: string[]; sessionCount: number }>;
  agentCount: number;
  memoryPath: string;
  memoryItems: number;
}

export default function MemoryPage() {
  const [employees, setEmployees] = useState<EmployeeFolder[] | null>(null);
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [emp, ag] = await Promise.all([
          api<{ success: boolean; data: EmployeeFolder[] }>("/api/v2/admin/memory/employees"),
          api<{ success: boolean; data: { agents: Agent[] } }>("/api/v2/admin/agents"),
        ]);
        if (!mounted) return;
        setEmployees(emp.data ?? []);
        setAgents(ag.data?.agents ?? []);
      } catch {
        if (mounted) {
          setEmployees([]);
          setAgents([]);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
          <Brain className="size-5 text-muted-foreground" />
          Memory 管理
        </h2>
        <p className="text-sm text-muted-foreground">
          数智底座 · 员工记忆夹 · 架构视图(spec § 11.4)
        </p>
      </header>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview" className="gap-1.5">
            <Database className="size-3.5" />
            概览
          </TabsTrigger>
          <TabsTrigger value="employees" className="gap-1.5">
            <Building2 className="size-3.5" />
            员工架构
          </TabsTrigger>
        </TabsList>

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
              <CardTitle className="text-base">架构</CardTitle>
              <CardDescription>Memory 数据流 + 检索</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <ol className="space-y-2 list-decimal list-inside">
                <li><strong>store</strong>: 文档切 chunk → embedding → 存入 pgvector</li>
                <li><strong>retrieve</strong>: query → embedding → cosine top-K + BM25 → RRF 合并</li>
                <li><strong>synthesize</strong>: 拼接 chunks → agent prompt 上下文</li>
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
                Admin JWT(role=admin → scope <code className="font-mono">*</code>)不能直接访问。
                实际使用:web bot / mobile / external CLI 通过 internal 凭证调用。
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="employees" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Network className="size-4 text-blue-500" />
                数字员工组织架构
              </CardTitle>
              <CardDescription>
                员工 → 挂载 Bot (channel) → Agent → 独立记忆文件夹 — 按真实员工分文件夹隔离
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-4 space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
                </div>
              ) : !employees || employees.length === 0 ? (
                <div className="p-12 text-center text-sm text-muted-foreground">
                  暂无员工记录 — 配置 Bot 实例时绑定员工,会自动出现在这里
                </div>
              ) : (
                <EmployeeTree
                  employees={employees}
                  agents={agents ?? []}
                  selected={selected}
                  onSelect={setSelected}
                />
              )}
            </CardContent>
          </Card>

          {agents && agents.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Cpu className="size-3.5" />
                  所有 Agent ({agents.length})
                </CardTitle>
                <CardDescription>每个 Agent 拥有独立记忆命名空间</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                  {agents.map((a) => (
                    <div key={a.id} className="rounded-md border border-border px-3 py-2 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{a.displayName}</p>
                        <p className="text-[10px] font-mono text-muted-foreground truncate">{a.name}</p>
                      </div>
                      <Badge variant={a.isActive ? "default" : "secondary"} className="text-[10px] shrink-0">
                        {a.isActive ? "active" : "off"}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EmployeeTree({
  employees, agents, selected, onSelect,
}: {
  employees: EmployeeFolder[];
  agents: Agent[];
  selected: string | null;
  onSelect: (s: string | null) => void;
}) {
  const byDept = useMemo(() => {
    const map: Record<string, EmployeeFolder[]> = {};
    employees.forEach((e) => {
      (map[e.department] ??= []).push(e);
    });
    return map;
  }, [employees]);

  const selectedEmployee = selected ? employees.find((e) => e.employee === selected) : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr]">
      <div className="border-b lg:border-b-0 lg:border-r border-border max-h-[600px] overflow-y-auto">
        {Object.entries(byDept).map(([dept, emps]) => (
          <div key={dept} className="p-3 border-b border-border/60 last:border-b-0">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
              {dept}
            </p>
            <ul className="space-y-1">
              {emps.map((e) => {
                const active = selected === e.employee;
                return (
                  <li key={e.employee}>
                    <button
                      onClick={() => onSelect(active ? null : e.employee)}
                      className={`w-full flex items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors text-left ${
                        active
                          ? "bg-primary/10 text-primary"
                          : "hover:bg-muted/40 text-foreground"
                      }`}
                    >
                      <Building2 className="size-3.5 shrink-0" />
                      <span className="flex-1 truncate">{e.employee}</span>
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {e.bots.length}b · {e.agentCount}a
                      </span>
                      <ChevronRight
                        className={`size-3 text-muted-foreground transition-transform ${
                          active ? "rotate-90" : ""
                        }`}
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="p-4">
        {!selectedEmployee ? (
          <div className="grid place-items-center min-h-[400px] text-sm text-muted-foreground text-center px-4">
            <div>
              <FolderOpen className="size-10 mx-auto mb-2 opacity-40" />
              选一个员工查看其挂载的 bot / agent / 记忆文件夹
            </div>
          </div>
        ) : (
          <EmployeeDetail employee={selectedEmployee} agents={agents} />
        )}
      </div>
    </div>
  );
}

function EmployeeDetail({
  employee, agents,
}: { employee: EmployeeFolder; agents: Agent[] }) {
  return (
    <div className="space-y-4">
      <header>
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Building2 className="size-5 text-blue-500" />
          {employee.employee}
        </h3>
        <p className="text-xs text-muted-foreground">
          {employee.department} · 记忆路径: <code className="font-mono">{employee.memoryPath}</code>
        </p>
        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Bot className="size-3" /> {employee.bots.length} 个 bot
          </span>
          <span className="inline-flex items-center gap-1">
            <Cpu className="size-3" /> {employee.agentCount} 个 agent
          </span>
          <span className="inline-flex items-center gap-1">
            <FolderOpen className="size-3" /> {employee.memoryItems} 条记忆
          </span>
        </div>
      </header>

      <div className="rounded-md border border-border bg-muted/20 p-3 space-y-3">
        <div className="flex items-center gap-2">
          <Building2 className="size-4 text-blue-500" />
          <span className="font-medium text-sm">{employee.employee}</span>
          <Badge variant="outline" className="text-[10px]">{employee.department}</Badge>
        </div>

        <div className="ml-4 border-l border-border pl-4 space-y-3">
          {employee.bots.map((bot) => (
            <div key={bot.name} className="space-y-2">
              <div className="flex items-center gap-2">
                <Bot className="size-3.5 text-blue-500" />
                <code className="text-sm font-mono">{bot.name}</code>
                <span className="text-[10px] text-muted-foreground">
                  {bot.sessionCount} sessions
                </span>
              </div>
              <div className="ml-4 border-l border-border/60 pl-4 space-y-2">
                {bot.channels.map((ch) => (
                  <div key={ch} className="flex items-center gap-2 text-xs">
                    <Tag className="size-3 text-amber-500" />
                    <span className="font-mono text-muted-foreground">{ch}</span>
                  </div>
                ))}
                {agents.slice(0, 2).map((a) => (
                  <div key={a.id} className="flex items-center gap-2 text-xs">
                    <Cpu className="size-3 text-violet-500" />
                    <span>{a.displayName}</span>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      → memory/{a.name}/
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="ml-4 border-l border-border pl-4">
          <div className="flex items-center gap-2 text-xs">
            <FolderOpen className="size-3.5 text-emerald-500" />
            <code className="font-mono">{employee.memoryPath}/</code>
            <span className="text-[10px] text-muted-foreground">
              独立命名空间 — 与其他员工隔离
            </span>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <a
          href={`/kb/agents?employee=${encodeURIComponent(employee.employee)}`}
          className="text-xs text-primary hover:underline"
        >
          打开该员工的 KB →
        </a>
      </div>
    </div>
  );
}
