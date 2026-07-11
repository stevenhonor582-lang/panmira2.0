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
import { McpCredentialsDialog } from "@/components/channels/mcp-credentials-dialog";
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
  Eye,
  RotateCw,
  KeyRound,
  Copy,
  Check,
} from "lucide-react";
import { useFetch } from "@/lib/channels/use-fetch";
import { mutate } from "@/lib/channels/api-mutations";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * /channels/mcp — MCP 服务注册表 (R29-C: 含外部平台许可密钥绑定)
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
 * 外部平台许可密钥 (R29-C):
 *  - 列表只回显 masked(尾部 4 位)
 *  - 查看明文: GET /:id/reveal-key (admin only,记审计)
 *  - 轮换:    POST /:id/rotate-key
 *
 * 实现备注:
 *  - 后端 GET  /api/mcp/servers        返回 { servers: [...] }
 *  - 后端 POST /api/mcp/servers        新建(可带 externalPlatformName/Key)
 *  - 后端 PATCH/DELETE /api/mcp/servers/:id
 *  - 后端 POST /api/mcp/servers/:id/test  测试连接
 *  - 后端 GET  /api/mcp/servers/:id/reveal-key  查看明文(admin)
 *  - 后端 POST /api/mcp/servers/:id/rotate-key 轮换许可密钥
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
  // R29-C: 外部平台许可密钥(列表不回显明文)
  externalPlatformName?: string | null;
  external_platform_name?: string | null;
  hasExternalKey?: boolean;
  externalKeyMasked?: string;
  externalKeyLastRotated?: string | null;
  external_key_last_rotated?: string | null;
}

interface TestResult {
  ok: boolean;
  toolsCount: number;
  tools: Array<{ name: string; description?: string }>;
  error: string | null;
  latencyMs?: number;
}

const COMMON_PLATFORMS = [
  "GitHub", "GitLab", "Slack", "Notion", "Linear", "Jira", "Feishu", "Lark",
  "Google Drive", "Dropbox", "Atlassian", "Asana", "Trello",
];

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
  // R29-C: 当前正在查看/轮换许可密钥的 server
  const [revealing, setRevealing] = React.useState<BackendMCPServer | null>(null);
  const [rotating, setRotating] = React.useState<BackendMCPServer | null>(null);
  // R68-3 · 块 8: 密钥池弹窗
  const [credsFor, setCredsFor] = React.useState<BackendMCPServer | null>(null);

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
      extName: s.externalPlatformName ?? s.external_platform_name ?? null,
      extRotated: s.externalKeyLastRotated ?? s.external_key_last_rotated ?? null,
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
  const withKey = serversById.filter((s) => s.hasExternalKey).length;

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
            { label: "已绑许可", value: withKey },
          ]}
          footnote={
            <>
              MCP (Model Context Protocol) 服务注册表。协议决定进程模型:
              <code className="font-mono">stdio</code> 子进程 ·
              <code className="font-mono">sse</code> 长连接 ·
              <code className="font-mono">http</code> 一次性 POST。
              点击「测试连接」可探测真实 tools 列表。
              <span className="text-foreground/70"> R29-C: 外部平台许可密钥统一在此管理,列表不回显明文。</span>
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
                {["名称", "协议", "URL / 命令", "认证", "状态", "外部许可密钥", "工具", ""].map((h, i) => (
                  <th key={i} className="text-left font-medium px-3 py-2 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {serversById.map((s) => {
            const t = testResults[s.id];
            const isOpen = !!expanded[s.id];
            const toolList = t?.ok ? t.tools : s.tools ?? [];
            const rotatedDate = s.extRotated
              ? new Date(s.extRotated).toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" })
              : null;
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
                  className="text-muted-foreground max-w-[20rem] truncate inline-block"
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
                // R29-C: 外部平台许可密钥列(不回显明文)
                <div key="ext" className="flex items-center gap-2 min-w-[14rem]">
                  {s.hasExternalKey ? (
                    <>
                      <span className="text-[11px] font-medium text-foreground/90 truncate max-w-[7rem]">
                        {s.extName || "—"}
                      </span>
                      <MonoCell className="text-muted-foreground text-[11px]">
                        {s.externalKeyMasked || "••••••••"}
                      </MonoCell>
                      <div className="flex items-center gap-0.5">
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          onClick={() => setRevealing(s)}
                          aria-label="查看明文"
                          title="查看明文(管理员)"
                          className="hover:text-sky-600"
                        >
                          <Eye className="size-3.5" />
                        </Button>
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          onClick={() => setRotating(s)}
                          aria-label="轮换密钥"
                          title="轮换许可密钥"
                          className="hover:text-amber-600"
                        >
                          <RotateCw className="size-3.5" />
                        </Button>
                      </div>
                      {rotatedDate ? (
                        <span className="text-[10px] text-muted-foreground/70 font-mono whitespace-nowrap" title="上次轮换">
                          {rotatedDate}
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <span className="text-[11px] text-muted-foreground/50 italic">未绑定</span>
                  )}
                </div>,
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
                  {/* R68-3 · 块 8: 密钥池 — 多密钥 + 轮询 */}
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label="密钥池"
                    title="密钥池 · 多密钥 + 轮询"
                    onClick={() => setCredsFor(s)}
                  >
                    <KeyRound className="size-3.5" />
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
                    <td colSpan={8} className="px-3 py-0">
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
          STDIO 协议通过 scripts/mcp-stdio-probe.py 启动子进程探测 · MCP 自身认证密钥加密存储
        </span>
        <span className="text-foreground/70">
          R29-C: 外部平台许可密钥(如 GitHub OAuth token)在此统一管理,查看明文需管理员权限并记审计
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

      {/* R29-C: 查看明文 / 轮换许可密钥 */}
      {revealing ? (
        <RevealKeyDialog
          server={revealing}
          onClose={() => setRevealing(null)}
          onDone={(msg) => {
            setRevealing(null);
            if (msg) notify(msg);
          }}
        />
      ) : null}
      {rotating ? (
        <RotateKeyDialog
          server={rotating}
          onClose={() => setRotating(null)}
          onSaved={() => {
            setRotating(null);
            refresh();
          }}
        />
      ) : null}
      <McpCredentialsDialog
        serverId={credsFor?.id ?? null}
        serverName={credsFor?.name ?? ""}
        open={!!credsFor}
        onOpenChange={(n) => !n && setCredsFor(null)}
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
  // R29-C: 外部平台许可密钥
  const [extPlatform, setExtPlatform] = React.useState("");
  const [extKey, setExtKey] = React.useState("");
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
      // R29-C: 外部平台(只回填名称,密钥留空不修改)
      setExtPlatform((server.externalPlatformName ?? server.external_platform_name) ?? "");
      setExtKey("");
    } else {
      setName("");
      setTransport("stdio");
      setUrl("");
      setCommand("");
      setArgs("");
      setAuthType("none");
      setApiKey("");
      setExtPlatform("");
      setExtKey("");
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
    // R29-C: 外部平台许可密钥
    body.externalPlatformName = extPlatform.trim() || "";
    if (extKey.trim()) body.externalPlatformKey = extKey.trim();
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
              <Label htmlFor="mcp-url">服务地址</Label>
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
              <Label>MCP 自身认证</Label>
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
                  <SelectItem value="bearer">Bearer 令牌</SelectItem>
                  <SelectItem value="basic">Basic 认证</SelectItem>
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
            ) : (
              <div className="self-end text-[10.5px] text-muted-foreground pb-1.5">
                MCP 自身鉴权(与外部平台许可密钥区分)
              </div>
            )}
          </div>

          {/* R29-C: 外部平台许可密钥 */}
          <div className="rounded-md bg-amber-500/5 ring-1 ring-amber-500/20 p-2.5 space-y-2">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
              <KeyRound className="size-3.5" />
              外部平台许可密钥 (R29-C)
            </div>
            <p className="text-[10.5px] text-muted-foreground leading-relaxed">
              绑定此后端 MCP 对应的外部平台许可凭证(如 GitHub OAuth Token、Slack API Key)。
              与 MCP 自身认证区分;留空名称即不绑定。
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="mcp-ext-platform">外部平台</Label>
                <Input
                  id="mcp-ext-platform"
                  list="mcp-common-platforms"
                  placeholder="GitHub / Slack / Notion…"
                  value={extPlatform}
                  onChange={(e) => setExtPlatform(e.target.value)}
                />
                <datalist id="mcp-common-platforms">
                  {COMMON_PLATFORMS.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-1">
                <Label htmlFor="mcp-ext-key">
                  许可密钥{isEdit ? " (留空不修改)" : ""}
                </Label>
                <Input
                  id="mcp-ext-key"
                  type="password"
                  placeholder={isEdit ? "••••••••" : "粘贴外部平台 token"}
                  autoComplete="off"
                  spellCheck={false}
                  value={extKey}
                  onChange={(e) => setExtKey(e.target.value)}
                />
              </div>
            </div>
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

// R29-C: 查看明文许可密钥(admin only,记审计)
function RevealKeyDialog({
  server,
  onClose,
  onDone,
}: {
  server: BackendMCPServer;
  onClose: () => void;
  onDone: (msg: string | null) => void;
}) {
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [plain, setPlain] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  async function doReveal() {
    setLoading(true);
    setErr(null);
    try {
      const r = await api<{ success?: boolean; externalKey?: string; error?: string; message?: string }>(
        `/api/mcp/servers/${server.id}/reveal-key`,
      );
      if (r && r.success && typeof r.externalKey === "string") {
        setPlain(r.externalKey);
      } else {
        const msg = r?.message || r?.error || "查看失败";
        setErr(msg);
      }
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  async function copyPlain() {
    if (!plain) return;
    try {
      await navigator.clipboard.writeText(plain);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore
    }
  }

  return (
    <Dialog open onOpenChange={(n) => !n && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <Eye className="size-4 text-sky-600" />
            查看明文许可密钥 · {server.name}
          </DialogTitle>
          <DialogDescription className="text-xs">
            此操作会记录审计日志。仅管理员可查看。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-xs">
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span>外部平台:<span className="text-foreground/90 ml-1">{server.externalPlatformName ?? server.external_platform_name ?? "—"}</span></span>
            <span className="text-muted-foreground/50">·</span>
            <span className="font-mono">Masked: {server.externalKeyMasked || "••••••••"}</span>
          </div>

          {plain ? (
            <div className="space-y-1.5">
              <Label>明文许可密钥(已显示)</Label>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={plain}
                  className="font-mono text-[11px]"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button size="sm" variant="outline" onClick={copyPlain} className="gap-1.5 shrink-0">
                  {copied ? (
                    <>
                      <Check className="size-3.5 text-emerald-600" /> 已复制
                    </>
                  ) : (
                    <>
                      <Copy className="size-3.5" /> 复制
                    </>
                  )}
                </Button>
              </div>
              <p className="text-[10.5px] text-rose-600 dark:text-rose-400">
                ⚠ 密钥已明文展示。请勿在他人屏幕共享时显示此对话框。
              </p>
            </div>
          ) : null}

          {err ? (
            <div className="rounded-md bg-rose-500/10 ring-1 ring-rose-500/30 px-2 py-1.5 text-[11px] text-rose-700 dark:text-rose-300">
              {err}
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onDone(null)}>
            关闭
          </Button>
          {!plain ? (
            <Button size="sm" onClick={doReveal} disabled={loading} className="gap-1.5">
              {loading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <KeyRound className="size-3.5" />
              )}
              确认查看并记审计
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => onDone(`✓ 已查看 ${server.name} 许可密钥(已记审计)`)}>
              完成
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// R29-C: 轮换许可密钥(输入新 key → POST /rotate-key)
function RotateKeyDialog({
  server,
  onClose,
  onSaved,
}: {
  server: BackendMCPServer;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [newKey, setNewKey] = React.useState("");
  const [confirmText, setConfirmText] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function doRotate() {
    if (!newKey.trim()) {
      setErr("请输入新的许可密钥");
      return;
    }
    if (confirmText.trim() !== server.name) {
      setErr(`请输入 MCP 名称 "${server.name}" 以确认`);
      return;
    }
    setSaving(true);
    setErr(null);
    const r = await mutate<{ externalKeyMasked?: string }>(
      "POST",
      `/api/mcp/servers/${server.id}/rotate-key`,
      { body: { externalPlatformKey: newKey.trim() } },
    );
    setSaving(false);
    if (r.ok) {
      onSaved();
    } else {
      setErr(r.error || "轮换失败");
    }
  }

  return (
    <Dialog open onOpenChange={(n) => !n && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <RotateCw className="size-4 text-amber-600" />
            轮换许可密钥 · {server.name}
          </DialogTitle>
          <DialogDescription className="text-xs">
            外部平台许可密钥将立即更新,旧密钥不可恢复。操作会记录审计日志。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-xs">
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span>外部平台:<span className="text-foreground/90 ml-1">{server.externalPlatformName ?? server.external_platform_name ?? "—"}</span></span>
            <span className="text-muted-foreground/50">·</span>
            <span className="font-mono">当前: {server.externalKeyMasked || "••••••••"}</span>
          </div>
          <div className="space-y-1">
            <Label htmlFor="rotate-key">新许可密钥</Label>
            <Input
              id="rotate-key"
              type="password"
              placeholder="粘贴新 token / API key"
              autoComplete="off"
              spellCheck={false}
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              className="font-mono text-[11.5px]"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="rotate-confirm">输入 MCP 名称 <span className="font-mono text-muted-foreground">{server.name}</span> 确认</Label>
            <Input
              id="rotate-confirm"
              placeholder={server.name}
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
            />
          </div>
          {err ? (
            <div className="rounded-md bg-rose-500/10 ring-1 ring-rose-500/30 px-2 py-1.5 text-[11px] text-rose-700 dark:text-rose-300">
              {err}
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button size="sm" onClick={doRotate} disabled={saving} className="gap-1.5">
            {saving ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RotateCw className="size-3.5" />
            )}
            确认轮换
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
