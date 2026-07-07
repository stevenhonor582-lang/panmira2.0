"use client";

import { useEffect, useState } from "react";
import { Plus, Server, Puzzle, Plug, Loader2, GitBranch } from "lucide-react";
import { InstallGitBranchDialog } from "./_components/install-github-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { McpDialog } from "./_components/mcp-dialog";
import { McpDetailDrawer } from "./_components/mcp-detail-drawer";
import { McpDeleteDialog } from "./_components/mcp-delete-dialog";
import type {
  McpServer, McpCreate, McpHealthResult, Plugin, ApiEnvelope,
} from "./_components/types";

export default function ResourcesPage() {
  const [mcps, setMcps] = useState<McpServer[]>([]);
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [loadingMcp, setLoadingMcp] = useState(true);
  const [loadingPlugin, setLoadingPlugin] = useState(true);

  const [mcpDialogOpen, setMcpDialogOpen] = useState(false);
  const [detailMcp, setDetailMcp] = useState<McpServer | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [deleting, setDeleting] = useState<McpServer | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [ghOpen, setGhOpen] = useState(false);
  const [ghKind, setGhKind] = useState<"skill" | "mcp" | "auto">("auto");

  const loadMcp = async () => {
    setLoadingMcp(true);
    try {
      const r = await api<ApiEnvelope<McpServer[]>>("/api/v2/admin/mcp-servers");
      setMcps(r.data ?? []);
    } catch { setMcps([]); }
    finally { setLoadingMcp(false); }
  };

  const loadPlugins = async () => {
    setLoadingPlugin(true);
    try {
      const r = await api<{ plugins: Plugin[] }>("/api/skills/plugins");
      setPlugins(r.plugins ?? []);
    } catch { setPlugins([]); }
    finally { setLoadingPlugin(false); }
  };

  useEffect(() => {
    loadMcp();
    loadPlugins();
  }, []);

  const handleCreateMcp = async (data: McpCreate) => {
    await api("/api/v2/admin/mcp-servers", { method: "POST", body: data });
    await loadMcp();
  };

  const handleDeleteMcp = async (s: McpServer) => {
    await api(`/api/v2/admin/mcp-servers/${s.id}`, { method: "DELETE" });
    setDetailOpen(false);
    setDetailMcp(null);
    await loadMcp();
  };

  const handleHealth = async (s: McpServer): Promise<{ status: string; latencyMs?: number; error?: string }> => {
    try {
      const r = await api<McpHealthResult>(`/api/v2/admin/mcp-servers/${s.id}/health`, { method: "POST" });
      await loadMcp();
      return { status: r.status ?? "unknown", latencyMs: r.latencyMs, error: r.error };
    } catch (err) {
      return { status: "down", error: err instanceof Error ? err.message : "健康检查失败" };
    }
  };

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">Skill / MCP 资源池</h2>
        <p className="text-sm text-muted-foreground">
          注册 MCP server 端点 + 插件 — Agent 可调用其 tools
        </p>
      </header>

      <Tabs defaultValue="mcp">
        <TabsList>
          <TabsTrigger value="mcp" className="gap-1.5">
            <Plug className="size-3.5" />
            MCP Servers ({mcps.length})
          </TabsTrigger>
          <TabsTrigger value="plugins" className="gap-1.5">
            <Puzzle className="size-3.5" />
            Skill Plugins ({plugins.length})
          </TabsTrigger>
        </TabsList>

        {/* MCP Tab */}
        <TabsContent value="mcp" className="space-y-3">
          <div className="flex justify-end gap-2">
            <Button onClick={() => { setGhKind("mcp"); setGhOpen(true); }} variant="outline" className="gap-1.5">
              <GitBranch className="size-4" />
              从 GitHub 安装 MCP
            </Button>
            <Button onClick={() => setMcpDialogOpen(true)} className="gap-1.5">
              <Plus className="size-4" />
              新建 MCP
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              {loadingMcp ? (
                <div className="p-6 space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : mcps.length === 0 ? (
                <div className="p-12 text-center text-sm text-muted-foreground">
                  还没有 MCP server — 点右上角注册第一个
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>名称</TableHead>
                      <TableHead>URL</TableHead>
                      <TableHead>Transport</TableHead>
                      <TableHead>健康</TableHead>
                      <TableHead className="text-right">检查时间</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mcps.map((m) => (
                      <TableRow key={m.id}
                        className="cursor-pointer"
                        onClick={() => { setDetailMcp(m); setDetailOpen(true); }}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="size-6 rounded bg-rose-500/10 text-rose-500 grid place-items-center">
                              <Plug className="size-3.5" />
                            </span>
                            <span className="font-medium">{m.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground max-w-[280px] truncate">
                          {m.url}
                        </TableCell>
                        <TableCell className="text-xs font-mono uppercase">
                          {m.transport ?? "http"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={
                            m.healthStatus === "healthy" ? "default" :
                            m.healthStatus === "degraded" ? "secondary" : "outline"
                          }>
                            {m.healthStatus ?? "unknown"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                          {m.lastCheckAt ? new Date(m.lastCheckAt).toLocaleDateString("zh-CN") : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Plugins Tab */}
        <TabsContent value="plugins" className="space-y-3">
          <div className="flex justify-end gap-2">
            <Button onClick={() => { setGhKind("skill"); setGhOpen(true); }} variant="outline" className="gap-1.5">
              <GitBranch className="size-4" />
              从 GitHub 安装 Skill
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              {loadingPlugin ? (
                <div className="p-6 space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : plugins.length === 0 ? (
                <div className="p-12 text-center text-sm text-muted-foreground">
                  还没有 plugin
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>名称</TableHead>
                      <TableHead>版本</TableHead>
                      <TableHead className="text-right">Skills</TableHead>
                      <TableHead>状态</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {plugins.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="size-6 rounded bg-violet-500/10 text-violet-500 grid place-items-center">
                              <Puzzle className="size-3.5" />
                            </span>
                            <span className="font-medium">{p.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs">v{p.version}</TableCell>
                        <TableCell className="text-right tabular-nums">{p.skillCount}</TableCell>
                        <TableCell>
                          <Badge variant={p.enabled ? "default" : "secondary"}>
                            {p.enabled ? "启用" : "停用"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <McpDialog
        open={mcpDialogOpen}
        onOpenChange={setMcpDialogOpen}
        onSubmit={handleCreateMcp}
      />
      <McpDetailDrawer
        server={detailMcp}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onDelete={(s) => { setDeleting(s); setDeleteOpen(true); }}
        onHealth={handleHealth}
      />
      <McpDeleteDialog
        server={deleting}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={handleDeleteMcp}
      />
      <InstallGitBranchDialog
        open={ghOpen}
        onOpenChange={setGhOpen}
        kind={ghKind}
        onInstalled={() => {
          if (ghKind === "skill" || ghKind === "auto") loadPlugins();
          if (ghKind === "mcp" || ghKind === "auto") loadMcp();
        }}
      />
    </div>
  );
}
