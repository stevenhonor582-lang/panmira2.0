"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Bot, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api";
import { AgentDialog } from "./_components/agent-dialog";
import { AgentDetailDrawer } from "./_components/agent-detail-drawer";
import { AgentDeleteDialog } from "./_components/agent-delete-dialog";
import type { Agent, AgentCreate } from "./_components/types";

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Dialog/Detail state
  const [editing, setEditing] = useState<Agent | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailAgent, setDetailAgent] = useState<Agent | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [deleting, setDeleting] = useState<Agent | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Load list
  const load = async () => {
    setLoading(true);
    try {
      const data = await api<{ agents: Agent[] }>("/api/v2/admin/agents");
      setAgents(data.agents ?? []);
    } catch {
      setAgents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Filtered
  const filtered = useMemo(() => {
    if (!search.trim()) return agents;
    const q = search.toLowerCase();
    return agents.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.displayName?.toLowerCase().includes(q) ||
        a.roleTemplate.toLowerCase().includes(q) ||
        a.description?.toLowerCase().includes(q),
    );
  }, [agents, search]);

  // Actions
  const handleCreate = async (data: AgentCreate) => {
    await api("/api/v2/admin/agents", { method: "POST", body: data });
    await load();
  };

  const handleEdit = async (data: AgentCreate) => {
    if (!editing) return;
    await api(`/api/v2/admin/agents/${editing.id}`, {
      method: "PATCH",
      body: data,
    });
    await load();
    // 刷新 detail
    const fresh = (await api<{ agent: Agent }>(`/api/v2/admin/agents/${editing.id}`)).agent;
    setDetailAgent(fresh);
  };

  const handleDelete = async (agent: Agent) => {
    await api(`/api/v2/admin/agents/${agent.id}`, { method: "DELETE" });
    setDetailOpen(false);
    setDetailAgent(null);
    await load();
  };

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight">Agent</h2>
          <p className="text-sm text-muted-foreground">
            业务 Agent 列表 · {agents.length} 个
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setDialogOpen(true); }} className="gap-1.5">
          <Plus className="size-4" />
          新建 Agent
        </Button>
      </header>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="搜索名称 / 角色 / 描述..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8"
        />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              {search ? "没有匹配的 Agent" : "还没有 Agent — 点右上角创建第一个"}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead>
                  <TableHead>角色模板</TableHead>
                  <TableHead>描述</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">更新时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((agent) => (
                  <TableRow
                    key={agent.id}
                    className="cursor-pointer"
                    onClick={() => {
                      setDetailAgent(agent);
                      setDetailOpen(true);
                    }}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="size-6 rounded bg-primary/10 text-primary grid place-items-center">
                          <Bot className="size-3.5" />
                        </span>
                        <span className="font-medium">
                          {agent.displayName || agent.name}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {agent.roleTemplate}
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-[300px] truncate">
                      {agent.description || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={agent.isActive ? "default" : "secondary"}>
                        {agent.isActive ? "已启用" : "已停用"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                      {new Date(agent.updatedAt).toLocaleDateString("zh-CN")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <AgentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={editing}
        onSubmit={editing ? handleEdit : handleCreate}
      />
      <AgentDetailDrawer
        agent={detailAgent}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onEdit={(a) => {
          setDetailOpen(false);
          setEditing(a);
          setDialogOpen(true);
        }}
        onDelete={(a) => {
          setDeleting(a);
          setDeleteOpen(true);
        }}
      />
      <AgentDeleteDialog
        agent={deleting}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={handleDelete}
      />
    </div>
  );
}
