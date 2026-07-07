"use client";

import { useMemo, useState } from "react";
import {
  Building2, Bot, Cpu, FolderOpen, ChevronRight, Network, Upload, Trash2, FileText,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { Agent, EmployeeFolder } from "./types";

interface Props {
  employees: EmployeeFolder[] | null;
  agents: Agent[] | null;
  loading: boolean;
}

export function EmployeeTier({ employees, agents, loading }: Props) {
  const [selected, setSelected] = useState<string | null>(null);

  const byDept = useMemo(() => {
    const map: Record<string, EmployeeFolder[]> = {};
    (employees ?? []).forEach((e) => {
      (map[e.department] ??= []).push(e);
    });
    return map;
  }, [employees]);

  const selectedEmployee = selected ? (employees ?? []).find((e) => e.employee === selected) : null;

  // 模拟每个员工/agent 的"文件列表"(基于真实数据 + 占位)
  const mockFilesFor = (e: EmployeeFolder) => {
    const baseAgents = (agents ?? []).slice(0, e.agentCount || 2);
    return baseAgents.flatMap((a) => [
      { id: `${a.id}-ctx`, name: `${a.name}/context.md`, kind: "context", size: "12 KB" },
      { id: `${a.id}-ep`, name: `${a.name}/episodes.jsonl`, kind: "episodes", size: "128 KB" },
    ]);
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Network className="size-4 text-blue-500" />
          数字员工记忆
        </CardTitle>
        <CardDescription>
          每个员工一个独立文件夹 · 内部按 agent 再分目录 · 与其他员工隔离
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
          </div>
        ) : !employees || employees.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            暂无员工记录 — 配置 Bot 实例时绑定员工会自动出现
          </div>
        ) : (
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
                            onClick={() => setSelected(active ? null : e.employee)}
                            className={`w-full flex items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors text-left ${
                              active ? "bg-primary/10 text-primary" : "hover:bg-muted/40 text-foreground"
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

            <div className="p-4 space-y-3">
              {!selectedEmployee ? (
                <div className="grid place-items-center min-h-[400px] text-sm text-muted-foreground text-center px-4">
                  <div>
                    <FolderOpen className="size-10 mx-auto mb-2 opacity-40" />
                    选一个员工查看其独立记忆文件夹
                  </div>
                </div>
              ) : (
                <EmployeeFolderDetail employee={selectedEmployee} files={mockFilesFor(selectedEmployee)} />
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EmployeeFolderDetail({
  employee, files,
}: { employee: EmployeeFolder; files: Array<{ id: string; name: string; kind: string; size: string }> }) {
  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Building2 className="size-5 text-blue-500" />
            {employee.employee}
          </h3>
          <p className="text-xs text-muted-foreground">
            {employee.department} · <code className="font-mono">{employee.memoryPath}</code>
          </p>
          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Bot className="size-3" />{employee.bots.length} bot</span>
            <span className="inline-flex items-center gap-1"><Cpu className="size-3" />{employee.agentCount} agent</span>
            <span className="inline-flex items-center gap-1"><FolderOpen className="size-3" />{employee.memoryItems} 条记忆</span>
          </div>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5">
          <Upload className="size-3.5" />上传文件
        </Button>
      </header>

      <div className="rounded-md border border-border bg-card">
        <div className="px-3 py-2 border-b border-border flex items-center gap-2 text-xs text-muted-foreground">
          <FolderOpen className="size-3.5" />{employee.memoryPath}/
        </div>
        <ul className="divide-y divide-border">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-2 px-3 py-2">
              <FileText className="size-3.5 text-muted-foreground" />
              <code className="text-xs font-mono flex-1 truncate">{f.name}</code>
              <Badge variant="outline" className="text-[10px]">{f.kind}</Badge>
              <span className="text-[10px] text-muted-foreground tabular-nums">{f.size}</span>
              <button
                className="text-muted-foreground hover:text-rose-500 transition-colors"
                aria-label="删除"
                title="删除(占位)"
              >
                <Trash2 className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
