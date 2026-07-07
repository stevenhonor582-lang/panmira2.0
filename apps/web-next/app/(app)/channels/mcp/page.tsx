"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { StatusPill, toneForMCP } from "@/components/channels/status-pill";
import { ChannelsPageShell, PageMeta } from "@/components/channels/page-shell";
import { DenseTable, MonoCell, KeyCell } from "@/components/channels/dense-table";
import {
  Pencil,
  Play,
  Plug,
  Plus,
  PowerOff,
  Terminal,
  Trash2,
} from "lucide-react";
import { MOCK_MCP } from "@/lib/channels/mock";
import type { MCPServer, MCPTransport } from "@/lib/channels/types";

/**
 * /channels/mcp — Model Context Protocol server registry.
 *
 * Transport types: stdio (subprocess), sse (server-sent events), http (POST).
 * Edit / Start / Stop / Delete controls. Auth (when present) is shown as
 * `Bearer ***` only — never echoed.
 */

export default function MCPPage() {
  const [servers, setServers] = React.useState<MCPServer[]>(MOCK_MCP);
  const [editing, setEditing] = React.useState<MCPServer | null>(null);
  const [creating, setCreating] = React.useState(false);

  const running = servers.filter((s) => s.status === "running").length;
  const errored = servers.filter((s) => s.status === "error").length;
  const totalTools = servers.reduce((acc, s) => acc + (s.toolCount ?? 0), 0);

  function toggle(id: string) {
    setServers((ss) =>
      ss.map((s) =>
        s.id === id
          ? {
              ...s,
              status: s.status === "running" ? "stopped" : "running",
              toolCount: s.status === "running" ? 0 : s.toolCount || 6,
            }
          : s,
      ),
    );
  }

  function remove(id: string) {
    setServers((ss) => ss.filter((s) => s.id !== id));
  }

  return (
    <ChannelsPageShell
      meta={
        <PageMeta
          items={[
            { label: "servers", value: servers.length },
            { label: "running", value: running },
            { label: "error", value: errored },
            { label: "tools", value: totalTools },
          ]}
          footnote={
            <>
              MCP = Model Context Protocol。stdio 走本地子进程,sse / http 走网络。
              启动后会自动 <code className="font-mono">tools/list</code> 探测可用工具数。
            </>
          }
        />
      }
      toolbar={
        <>
          <div className="flex items-center gap-2">
            <Plug className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold tracking-tight">MCP Servers</h2>
            <span className="text-[11px] text-muted-foreground font-mono">
              {servers.length} entries
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="gap-1.5">
              <Terminal className="size-3.5" />
              测试连通
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => setCreating(true)}>
              <Plus className="size-3.5" />
              添加 MCP Server
            </Button>
          </div>
        </>
      }
    >
      <DenseTable
        head={["Server", "Transport", "URL", "Auth", "Tools", "Status", ""]}
        rows={servers.map((s) => ({
          cells: [
            <div key="n" className="flex items-center gap-2.5">
              <div className="size-7 rounded-sm bg-foreground/5 ring-1 ring-border grid place-items-center">
                <Terminal className="size-3.5 text-muted-foreground" />
              </div>
              <div className="leading-tight">
                <div className="text-[13px] font-medium font-mono">{s.name}</div>
                <div className="text-[10px] text-muted-foreground font-mono">
                  {s.id}
                </div>
              </div>
            </div>,
            <StatusPill
              key="t"
              tone="info"
              label={s.transport}
              dot={false}
              className="font-mono"
            />,
            <MonoCell
              key="u"
              className="text-muted-foreground max-w-[22rem] truncate inline-block"
              title={s.url}
            >
              {s.url}
            </MonoCell>,
            <MonoCell key="a" className="text-muted-foreground">
              {s.auth ?? "—"}
            </MonoCell>,
            <MonoCell key="tc" className="text-foreground/85">
              {s.toolCount ?? 0}
            </MonoCell>,
            <StatusPill key="s" tone={toneForMCP(s.status)} label={s.status} />,
            <div key="act" className="flex items-center gap-1 justify-end">
              <Button
                size="icon-xs"
                variant="ghost"
                onClick={() => toggle(s.id)}
                aria-label={s.status === "running" ? "停止" : "启动"}
              >
                {s.status === "running" ? (
                  <PowerOff className="size-3.5" />
                ) : (
                  <Play className="size-3.5" />
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
                onClick={() => remove(s.id)}
                aria-label="删除"
                className="hover:text-rose-600"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>,
          ],
        }))}
        empty="No MCP servers configured."
      />

      <div className="mt-3 flex items-center gap-3 text-[10.5px] text-muted-foreground font-mono">
        <KeyCell>NOTE</KeyCell>
        <span>Auth 字段永不显示完整 token · 删除前确保无 bot 引用</span>
      </div>

      <MCPEditDialog
        server={editing}
        creating={creating}
        onClose={() => {
          setEditing(null);
          setCreating(false);
        }}
        onSave={(s) => {
          setServers((ss) => {
            const exists = ss.find((x) => x.id === s.id);
            if (exists) return ss.map((x) => (x.id === s.id ? s : x));
            return [...ss, s];
          });
          setEditing(null);
          setCreating(false);
        }}
      />
    </ChannelsPageShell>
  );
}

function MCPEditDialog({
  server,
  creating,
  onClose,
  onSave,
}: {
  server: MCPServer | null;
  creating: boolean;
  onClose: () => void;
  onSave: (s: MCPServer) => void;
}) {
  const [name, setName] = React.useState("");
  const [transport, setTransport] = React.useState<MCPTransport>("stdio");
  const [url, setUrl] = React.useState("");
  const [auth, setAuth] = React.useState("");

  React.useEffect(() => {
    if (server) {
      setName(server.name);
      setTransport(server.transport);
      setUrl(server.url);
      setAuth("");
    } else if (creating) {
      setName("");
      setTransport("stdio");
      setUrl("");
      setAuth("");
    }
  }, [server, creating]);

  const open = !!server || creating;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setAuth("");
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <Terminal className="size-4 text-muted-foreground" />
            {server ? "编辑 MCP Server" : "添加 MCP Server"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            stdio 走本地子进程,sse / http 走网络。Auth 字段写入后只显示 `***`,不再回显。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-xs">
          <div className="space-y-1">
            <Label htmlFor="m-name">Name</Label>
            <Input
              id="m-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="postgres-readonly"
            />
          </div>
          <div className="space-y-1">
            <Label>Transport</Label>
            <Select
              value={transport}
              onValueChange={(v) => setTransport(v as MCPTransport)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="stdio">stdio · 子进程</SelectItem>
                <SelectItem value="sse">sse · Server-Sent Events</SelectItem>
                <SelectItem value="http">http · JSON-RPC POST</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="m-url">URL / Command</Label>
            <Input
              id="m-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={
                transport === "stdio"
                  ? "npx -y @modelcontextprotocol/server-postgres ..."
                  : "http://host:port/mcp"
              }
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="m-auth">Auth (可选)</Label>
            <Input
              id="m-auth"
              type="password"
              value={auth}
              onChange={(e) => setAuth(e.target.value)}
              placeholder="Bearer / API key · 留空不修改"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            取消
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onSave({
                id: server?.id ?? `m_${Math.random().toString(36).slice(2, 8)}`,
                name: name.trim() || server?.name || "mcp",
                transport,
                url: url.trim() || server?.url || "",
                auth: auth.length > 0 ? "***" : server?.auth ?? null,
                status: server?.status ?? "stopped",
                toolCount: server?.toolCount ?? 0,
              });
              setAuth("");
            }}
          >
            {server ? "保存" : "添加"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}