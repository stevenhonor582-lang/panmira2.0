"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Bot, Loader2, LayoutGrid, List, Filter } from "lucide-react";
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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import { AgentDialog } from "./_components/agent-dialog";
import { AgentDetailDrawer } from "./_components/agent-detail-drawer";
import { AgentDeleteDialog } from "./_components/agent-delete-dialog";
import { AgentCard } from "./_components/agent-card";
import type { Agent, AgentCreate } from "./_components/types";
import { FlowNav } from "./_components/flow-nav";
import Link from "next/link";
import { HelpCircle } from "lucide-react";

const FLOW_STEPS = [
  { label: "1. 模板", href: "/agents" },
  { label: "2. 编排", href: "/agents/pipelines" },
  { label: "3. 蓝图", href: "/agents/templates" },
];

type ViewMode = "card" | "table";

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ViewMode>("card");
  const [roleFilter, setRoleFilter] = useState<string>("__all__");
  const [statusFilter, setStatusFilter] = useState<string>("__all__");

  // Dialog/Detail state
  const [editing, setEditing] = useState<Agent | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailAgent, setDetailAgent] = useState<Agent | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [deleting, setDeleting] = useState<Agent | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // 从 localStorage 读取视图偏好
  useEffect(() => {
    const v = localStorage.getItem("agents.view");
    if (v === "card" || v === "table") setView(v);
  }, []);
  useEffect(() => {
    localStorage.setItem("agents.view", view);
  }, [view]);

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

  useEffect(() => { load(); }, []);

  const roles = useMemo(
    () => Array.from(new Set(agents.map((a) => a.roleTemplate))).sort(),
    [agents],
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return agents.filter((a) => {
      if (roleFilter !== "__all__" && a.roleTemplate !== roleFilter) return false;
      if (statusFilter === "active" && !a.isActive) return false;
      if (statusFilter === "off" && a.isActive) return false;
      if (q) {
        const hay = `${a.name} ${a.displayName} ${a.roleTemplate} ${a.description ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [agents, search, roleFilter, statusFilter]);

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
      <FlowNav steps={FLOW_STEPS} current="/agents" />

      <header className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight">Agent</h2>
            <Link href="/agents/onboarding" className="text-muted-foreground hover:text-primary" title="了解模板/编排/蓝图三者关系">
              <HelpCircle className="size-4" />
            </Link>
          </div>
          <p className="text-sm text-muted-foreground">
            业务 Agent 列表 · {agents.length} 个 · 视图 {view === "card" ? "卡片" : "表格"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-md border border-border p-0.5">
            <button
              onClick={() => setView("card")}
              className={`px-2 py-1 rounded text-xs inline-flex items-center gap-1 ${view === "card" ? "bg-muted" : "text-muted-foreground hover:text-foreground"}`}
              aria-label="卡片视图"
            >
              <LayoutGrid className="size-3.5" />卡片
            </button>
            <button
              onClick={() => setView("table")}
              className={`px-2 py-1 rounded text-xs inline-flex items-center gap-1 ${view === "table" ? "bg-muted" : "text-muted-foreground hover:text-foreground"}`}
              aria-label="表格视图"
            >
              <List className="size-3.5" />表格
            </button>
          </div>
          <Button onClick={() => { setEditing(null); setDialogOpen(true); }} className="gap-1.5">
            <Plus className="size-4" />
            新建 Agent
          </Button>
        </div>
      </header>

      <Card>
        <CardContent className="p-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜索名称 / 角色 / 描述..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <Filter className="size-3.5 text-muted-foreground" />
            <Select value={roleFilter} onValueChange={(v) => v && setRoleFilter(v)}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="角色" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">全部角色</SelectItem>
                {roles.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => v && setStatusFilter(v)}>
              <SelectTrigger className="w-[120px]"><SelectValue placeholder="状态" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">全部状态</SelectItem>
                <SelectItem value="active">已启用</SelectItem>
                <SelectItem value="off">已停用</SelectItem>
              </SelectContent>
            </Select>
            {(roleFilter !== "__all__" || statusFilter !== "__all__" || search) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setRoleFilter("__all__"); setStatusFilter("__all__"); setSearch(""); }}
              >
                清除筛选
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-sm text-muted-foreground">
            {search || roleFilter !== "__all__" || statusFilter !== "__all__"
              ? "没有匹配的 Agent · 尝试调整搜索/筛选"
              : "还没有 Agent — 点右上角创建第一个"}
          </CardContent>
        </Card>
      ) : view === "card" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((a) => (
            <AgentCard
              key={a.id}
              agent={a}
              onClick={() => { setDetailAgent(a); setDetailOpen(true); }}
            />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead>
                  <TableHead>角色模板</TableHead>
                  <TableHead>能力</TableHead>
                  <TableHead>工具</TableHead>
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
                    onClick={() => { setDetailAgent(agent); setDetailOpen(true); }}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="size-6 rounded bg-primary/10 text-primary grid place-items-center">
                          <Bot className="size-3.5" />
                        </span>
                        <div>
                          <p className="font-medium">{agent.displayName || agent.name}</p>
                          <p className="text-[10px] font-mono text-muted-foreground">{agent.name}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{agent.roleTemplate}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {agent.capabilities?.slice(0, 3).map((c) => (
                          <Badge key={c} variant="secondary" className="text-[10px]">{c}</Badge>
                        ))}
                        {(agent.capabilities?.length ?? 0) > 3 && (
                          <span className="text-[10px] text-muted-foreground">+{(agent.capabilities?.length ?? 0) - 3}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs tabular-nums">{agent.tools?.length ?? 0}</span>
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
          </CardContent>
        </Card>
      )}

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
        onEdit={(a) => { setDetailOpen(false); setEditing(a); setDialogOpen(true); }}
        onDelete={(a) => { setDeleting(a); setDeleteOpen(true); }}
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
