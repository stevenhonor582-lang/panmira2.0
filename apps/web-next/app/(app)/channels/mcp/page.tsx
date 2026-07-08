"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChannelsPageShell, PageMeta } from "@/components/channels/page-shell";
import { MonoCell, KeyCell } from "@/components/channels/dense-table";
import { StatusPill, toneForMCP } from "@/components/channels/status-pill";
import {
  Pencil,
  Play,
  Plus,
  Power,
  PowerOff,
  RefreshCw,
  Terminal,
  Trash2,
  Inbox,
  Wrench,
  ChevronDown,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { useFetch } from "@/lib/channels/use-fetch";
import { mutate } from "@/lib/channels/api-mutations";
import { cn } from "@/lib/utils";

/**
 * /channels/mcp — MCP 服务注册表
 *
 * 协议:
 *  - stdio  子进程(本地脚本)
 *  - sse    长连接 Server-Sent Events
 *  - http   一次性 POST (JSON-RPC)
 *
 * 测试连接:
 *  - HTTP/SSE → JSON-RPC tools/list
 *  - STDIO    → scripts/mcp-stdio-probe.py 启动子进程
 *
 * 实现备注:
 *  - 后端 GET  /api/mcp/servers        返回 { servers: [...] }
 *  - 后端 POST /api/mcp/servers        新建
 *  - 后端 PATCH/DELETE /api/mcp/servers/:id
 *  - 后端 POST /api/mcp/servers/:id/test  测试连接,更新 tools_cache
 */

interface BackendMCPServer {
  id: string;
  name: string;
  url: string;
  transport: "stdio" | "sse" | "http";
  authType?: string;
  auth_type?: string;
  status: "active" | "paused" | "error";
  healthStatus?: string;
  health_status?: string;
  toolsCount?: number;
  tools_cache?: Array<{ name: string; description?: string }>;
  lastCheckAt?: string;
  last_check_at?: string;
}

interface TestResult {
  ok: boolean;
  toolsCount: number;
  tools: Array<{ name: string; description?: string }>;
  error: string | null;
  latencyMs?: number;
}

export default function MCPPage() {
  const { data, loading, error, refresh } = useFetch<{ servers: BackendMCPServer[] }>(
    "/api/mcp/servers",
  );

  const [editing, setEditing] = React.useState<BackendMCPServer | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});
  const [testing, setTesting] = React.useState<Record<string, boolean>>({});
  const [testResults, setTestResults] = React.useState<Record<string, TestResult>>({});
  const [toast, setToast] = React.useState<string | null>(null);

  function notify(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  const servers: BackendMCPServer[] = data?.servers ?? [];
  const serversById = React.useMemo(() => {
    return servers.map((s) => ({
      ...s,
      auth: s.authType ?? s.auth_type ?? "none",
      health: s.healthStatus ?? s.health_status ?? "unknown",
      lastCheck: s.lastCheckAt ?? s.last_check_at,
      tools: s.tools_cache ?? [],
    }));
  }, [servers]);

  if (loading) {
    return (
      <ChannelsPageShell meta={<PageMeta items={[{ label: "加载", value: "…" }]} />} toolbar={<></>}>
        <div className="h-64 rounded-2xl bg-muted/30 animate-pulse" />
      </ChannelsPageShell>
    );
  }

  if (error) {
    return (
      <ChannelsPageShell
        meta={<PageMeta items={[{ label: "错误", value: error.message.slice(0, 24) }]} />}
        toolbar={<></>}
      >
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-6 text-sm text-rose-700 dark:text-rose-300">
          加载失败 · {error.message}
        </div>
      </ChannelsPageShell>
    );
  }

  const active = serversById.filter((s) => s.status === "active").length;
  const healthy = serversById.filter((s) => s.health === "healthy" || s.health === "ok").length;
  const totalTools = serversById.reduce(
    (acc, s) => acc + (s.tools?.length ?? s.toolsCount ?? 0),
    0,
  );

  async function toggleActive(s: BackendMCPServer) {
    const next = s.status === "active" ? "paused" : "active";
    const r = await mutate("PATCH", `/api/mcp/servers/${s.id}`, {
      body: { status: next },
      refresh,
    });
    notify(r.ok ? `✓ 已${next === "active" ? "启用" : "停用"} ${s.name}` : `✗ ${r.error}`);
  }

  async function remove(s: BackendMCPServer) {
    if (!confirm(`删除 MCP 服务 "${s.name}"?`)) return;
    const r = await mutate("DELETE", `/api/mcp/servers/${s.id}`, { refresh });
    notify(r.ok ? `✓ 已删除 ${s.name}` : `✗ ${r.error}`);
  }

  async function runTest(s: BackendMCPServer) {
    setTesting((t) => ({ ...t, [s.id]: true }));
    const r = await mutate<TestResult>("POST", `/api/mcp/servers/${s.id}/test`, {});
    setTesting((t) => ({ ...t, [s.id]: false }));
    if (r.ok && r.data) {
      setTestResults((p) => ({ ...p, [s.id]: r.data! }));
      setExpanded((p) => ({ ...p, [s.id]: true }));
      notify(
        r.data!.ok
          ? `✓ ${s.name} 可用 · ${r.data!.toolsCount} 个工具`
          : `✗ ${s.name} 不可用 · ${r.data!.error}`,
      );
      refresh();
    } else {
      notify(`✗ 测试失败 · ${r.error}`);
    }
  }

  return (
    <ChannelsPageShell
      meta={
        <PageMeta
          items={[
            { label: "服务总数", value: serversById.length },
            { label: "启用", value: active },
            { label: "健康", value: healthy },
            { label: "工具数", value: totalTools },
          ]}
          footnote={
            <>
              MCP (Model Context Protocol) 服务注册表。协议决定进程模型:
              <code className="font-mono">stdio</code> 子进程 ·
              <code className="font-mono">sse</code> 长连接 ·
              <code className="font-mono">http</code> 一次性 POST。
              点击「测试连接」可探测真实 tools 列表。
            </>
          }
        />
      }
      toolbar={
        <>
          <div className="flex items-center gap-2">
            <Terminal className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold tracking-tight">MCP 服务</h2>
            <span className="text-[11px] text-muted-foreground font-mono">
              {serversById.length} 个
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" className="gap-1.5" onClick={refresh}>
              <RefreshCw className="size-3.5" />
              刷新
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => setCreating(true)}>
              <Plus className="size-3.5" />
              新增 MCP
            </Button>
          </div>
        </>
      }
    >
      {serversById.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="ring-1 ring-border rounded-sm bg-card/40 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-mono">
                {["名称", "协议", "URL / 命令", "认证", "状态", "工具", ""].map((h, i) => (
                  <th key={i} className="text-left font-medium px-3 py-2 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {serversById.map((s) => {
            const t = testResults[s.id];
            const isOpen = !!expanded[s.id];
            const toolList = t?.ok ? t.tools : s.tools ?? [];
            const cells = [
                <div key="n" className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setExpanded((p) => ({ ...p, [s.id]: !p[s.id] }))}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label={isOpen ? "折叠" : "展开"}
                  >
                    {isOpen ? (
                      <ChevronDown className="size-3.5" />
                    ) : (
                      <ChevronRight className="size-3.5" />
                    )}
                  </button>
                  <div className="size-7 rounded-sm bg-foreground/5 ring-1 ring-border grid place-items-center">
                    <Terminal className="size-3.5 text-muted-foreground" />
                  </div>
                  <div className="leading-tight">
                    <div className="text-[13px] font-medium">{s.name}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">
                      {s.id.slice(0, 8)}
                    </div>
                  </div>
                </div>,
                <span
                  key="t"
                  className="text-[11px] font-mono uppercase tracking-wide bg-muted text-muted-foreground px-1.5 py-0.5 rounded-sm"
                >
                  {s.transport}
                </span>,
                <MonoCell
                  key="u"
                  className="text-muted-foreground max-w-[24rem] truncate inline-block"
                  title={s.url}
                >
                  {s.url || "—"}
                </MonoCell>,
                <MonoCell key="a" className="text-muted-foreground">
                  {s.auth === "none" || !s.auth ? "无" : s.auth}
                </MonoCell>,
                <StatusPill
                  key="s"
                  tone={
                    s.health === "healthy" || s.health === "ok"
                      ? "ok"
                      : s.health === "unhealthy"
                        ? "err"
                        : toneForMCP(s.status)
                  }
                  label={
                    s.health === "healthy" || s.health === "ok"
                      ? "健康"
                      : s.health === "unhealthy"
                        ? "异常"
                        : s.status === "active"
                          ? "启用"
                          : "停用"
                  }
                />,
                <MonoCell key="tc" className="text-muted-foreground">
                  {toolList.length || s.toolsCount || 0}
                </MonoCell>,
                <div key="act" className="flex items-center gap-1 justify-end">
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    onClick={() => runTest(s)}
                    disabled={testing[s.id]}
                    aria-label="测试连接"
                    title="测试连接"
                    className="hover:text-emerald-600"
                  >
                    {testing[s.id] ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Play className="size-3.5" />
                    )}
                  </Button>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    onClick={() => toggleActive(s)}
                    aria-label={s.status === "active" ? "停用" : "启用"}
                    title={s.status === "active" ? "停用" : "启用"}
                  >
                    {s.status === "active" ? (
                      <PowerOff className="size-3.5" />
                    ) : (
                      <Power className="size-3.5" />
                    )}
                  </Button>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    onClick={() => setEditing(s)}
                    aria-label="编辑"
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label="删除"
                    className="hover:text-rose-600"
                    onClick={() => remove(s)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>,
            ];
            return (
              <React.Fragment key={s.id}>
                <tr className="border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors">
                  {cells.map((c, ci) => (
                    <td key={ci} className="px-3 py-1.5 align-middle whitespace-nowrap">{c}</td>
                  ))}
                </tr>
                {isOpen ? (
                  <tr className="border-b border-border last:border-b-0">
                    <td colSpan={7} className="px-3 py-0">
                      <div className="bg-muted/30 px-4 py-2.5 border-t border-border">
                        <div className="flex items-center gap-1.5 mb-2 text-[10.5px] font-mono uppercase tracking-wide text-muted-foreground">
                          <Wrench className="size-3" />
                          工具列表 ({toolList.length})
                        </div>
                        {toolList.length === 0 ? (
                          <div className="text-[12px] text-muted-foreground py-2">
                            暂无工具数据 · 点击「测试连接」探测
                            {t && !t.ok ? ` (错误: ${t.error})` : ""}
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                            {toolList.map((tool, i) => (
                              <div
                                key={i}
                                className="rounded-sm ring-1 ring-border bg-background px-2 py-1.5"
                              >
                                <div className="text-[12px] font-mono font-medium text-foreground/90">
                                  {tool.name}
                                </div>
                                {tool.description ? (
                                  <div className="text-[10.5px] text-muted-foreground mt-0.5 line-clamp-2">
                                    {tool.description}
                                  </div>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : null}
              </React.Fragment>
            );
          })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-3 flex items-center gap-3 text-[10.5px] text-muted-foreground font-mono">
        <KeyCell>说明</KeyCell>
        <span>
          STDIO 协议通过 scripts/mcp-stdio-probe.py 启动子进程探测 · 认证字段加密存储于数据库
        </span>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-lg bg-foreground text-background px-3.5 py-2 text-xs shadow-lg">
          {toast}
        </div>
      )}

      <EditDialog
        server={editing}
        creating={creating}
        onClose={() => {
          setEditing(null);
          setCreating(false);
        }}
        onSaved={() => {
          setEditing(null);
          setCreating(false);
          refresh();
        }}
      />
    </ChannelsPageShell>
  );
}

function EditDialog({
  server,
  creating,
  onClose,
  onSaved,
}: {
  server: BackendMCPServer | null;
  creating: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const open = !!server || creating;
  const isEdit = !!server;
  const [name, setName] = React.useState("");
  const [transport, setTransport] = React.useState<"stdio" | "sse" | "http">("stdio");
  const [url, setUrl] = React.useState("");
  const [command, setCommand] = React.useState("");
  const [args, setArgs] = React.useState("");
  const [authType, setAuthType] = React.useState<"none" | "api_key" | "bearer" | "basic">("none");
  const [apiKey, setApiKey] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    if (server) {
      setName(server.name);
      const t = (server.transport || "stdio") as "stdio" | "sse" | "http";
      setTransport(t);
      setUrl(server.url || "");
      // parse stdio:///path
      if (t === "stdio" && server.url?.startsWith("stdio://")) {
        const p = server.url.slice("stdio://".length).replace(/^\/+/, "/");
        setUrl(p);
      }
      const a = (server.authType ?? server.auth_type ?? "none") as typeof authType;
      setAuthType(a === "none" || a === "api_key" || a === "bearer" || a === "basic" ? a : "none");
      setApiKey("");
    } else {
      setName("");
      setTransport("stdio");
      setUrl("");
      setCommand("");
      setArgs("");
      setAuthType("none");
      setApiKey("");
    }
    setErr(null);
  }, [open, server]);

  if (!open) return null;

  function buildPayload() {
    const body: Record<string, any> = {
      name: name.trim(),
      transport,
      authType,
    };
    if (transport === "stdio") {
      const cmd = command.trim();
      const fullUrl = cmd ? `stdio://${cmd}` : url.startsWith("stdio://") ? url : `stdio://${url}`;
      body.url = fullUrl;
      if (args.trim()) body.args = args.trim().split(/\s+/);
    } else {
      body.url = url.trim();
    }
    if (apiKey.trim()) body.apiKey = apiKey.trim();
    return body;
  }

  async function save() {
    if (!name.trim()) {
      setErr("名称必填");
      return;
    }
    if (transport !== "stdio" && !url.trim()) {
      setErr("URL 必填");
      return;
    }
    setSaving(true);
    setErr(null);
    const body = buildPayload();
    const r = isEdit
      ? await mutate("PATCH", `/api/mcp/servers/${server!.id}`, { body })
      : await mutate("POST", "/api/mcp/servers", { body });
    setSaving(false);
    if (r.ok) {
      onSaved();
    } else {
      setErr(r.error || "保存失败");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(n) => !n && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <Terminal className="size-4 text-muted-foreground" />
            {isEdit ? `编辑 MCP · ${server!.name}` : "新增 MCP 服务"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {transport === "stdio"
              ? "STDIO: 启动本地子进程,通过 stdin/stdout 通信"
              : transport === "sse"
                ? "SSE: 长连接 Server-Sent Events"
                : "HTTP: 一次性 POST 请求"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-xs">
          <div className="space-y-1">
            <Label htmlFor="mcp-name">名称</Label>
            <Input
              id="mcp-name"
              placeholder="Diamond Memory"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>协议</Label>
            <Select
              value={transport}
              onValueChange={(v) => setTransport(v as typeof transport)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="stdio">STDIO (子进程)</SelectItem>
                <SelectItem value="http">HTTP (POST)</SelectItem>
                <SelectItem value="sse">SSE (长连接)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {transport === "stdio" ? (
            <div className="space-y-1">
              <Label htmlFor="mcp-cmd">脚本路径</Label>
              <Input
                id="mcp-cmd"
                placeholder="/home/ubuntu/.claude/mcp-servers/your-mcp.py"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="font-mono text-[11.5px]"
              />
              <p className="text-[10.5px] text-muted-foreground">
                后端自动用 venv python 启动 .py 脚本。完整命令路径以 <code>stdio://</code> 前缀存储。
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              <Label htmlFor="mcp-url">URL</Label>
              <Input
                id="mcp-url"
                placeholder="https://api.example.com/mcp"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="font-mono text-[11.5px]"
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>认证方式</Label>
              <Select
                value={authType}
                onValueChange={(v) => setAuthType(v as typeof authType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">无</SelectItem>
                  <SelectItem value="api_key">API Key</SelectItem>
                  <SelectItem value="bearer">Bearer Token</SelectItem>
                  <SelectItem value="basic">Basic Auth</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {authType !== "none" ? (
              <div className="space-y-1">
                <Label htmlFor="mcp-key">
                  {authType === "bearer" ? "Token" : authType === "basic" ? "Base64" : "API Key"}
                </Label>
                <Input
                  id="mcp-key"
                  type="password"
                  placeholder="留空不修改"
                  autoComplete="off"
                  spellCheck={false}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
              </div>
            ) : null}
          </div>
          {err ? (
            <div className="rounded-md bg-rose-500/10 ring-1 ring-rose-500/30 px-2 py-1.5 text-[11px] text-rose-700 dark:text-rose-300">
              {err}
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            取消
          </Button>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? "保存中…" : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-border py-24 text-center">
      <Inbox className="size-6 text-foreground/35" />
      <span className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-foreground/40">
        暂无 MCP 服务
      </span>
      <p className="max-w-[44ch] text-sm text-foreground/60">
        点击右上角「新增 MCP」开始添加。
        <br />
        支持 STDIO / HTTP / SSE 三种协议。
      </p>
    </div>
  );
}
