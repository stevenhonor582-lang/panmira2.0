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
  Inbox,
} from "lucide-react";
import type { MCPServer, MCPTransport } from "@/lib/channels/types";
import { useFetch } from "@/lib/channels/use-fetch";

/**
 * /channels/mcp — Model Context Protocol server registry.
 *
 * Transport types: stdio (subprocess), sse (server-sent events), http (POST).
 * Edit / Start / Stop / Delete controls. Auth (when present) is shown as
 * `Bearer ***` only — never echoed.
 */

export default function MCPPage() {
  // Backend has no /api/mcp/servers endpoint — graceful empty state on 404.
  const { data, loading, error } = useFetch<{ servers: MCPServer[] }>("/api/mcp/servers");
  const [editing, setEditing] = React.useState<MCPServer | null>(null);
  const [creating, setCreating] = React.useState(false);

  const servers: MCPServer[] = data?.servers ?? [];

  if (loading) {
    return (
      <ChannelsPageShell
        meta={<PageMeta items={[{ label: "loading", value: "…" }]} />}
        toolbar={<></>}
      >
        <div className="h-64 rounded-2xl bg-muted/30 animate-pulse" />
      </ChannelsPageShell>
    );
  }
  if (error?.code === "not_implemented") {
    return <EmptyShell kind="MCP servers" />;
  }
  if (error) {
    return (
      <ChannelsPageShell
        meta={<PageMeta items={[{ label: "error", value: error.message.slice(0, 24) }]} />}
        toolbar={<></>}
      >
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-6 text-sm text-rose-700 dark:text-rose-300">
          加载失败 · {error.message}
        </div>
      </ChannelsPageShell>
    );
  }

  const running = servers.filter((s) => s.status === "running").length;
  const errored = servers.filter((s) => s.status === "error").length;
  const totalTools = servers.reduce((acc, s) => acc + (s.toolCount ?? 0), 0);

  function toggle(id: string) {
    void id; // mutation gated behind wiring; this is a no-op until backend supports it
  }

  function remove(id: string) {
    void id;
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
              MCP (Model Context Protocol) server 注册表。Transport 决定进程模型:
              <code className="font-mono">stdio</code> 起子进程 ·
              <code className="font-mono">sse</code> 长连接 ·
              <code className="font-mono">http</code> 一次性 POST.
              Auth 仅在配置后显示 <code className="font-mono">Bearer ***</code>.
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
              {servers.length} total
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" className="gap-1.5" onClick={() => setCreating(true)}>
              <Plus className="size-3.5" />
              新增 MCP
            </Button>
          </div>
        </>
      }
    >
      <DenseTable
        head={["Name", "Transport", "URL / Command", "Auth", "Status", "Tools", ""]}
        rows={servers.map((s) => ({
          cells: [
            <div key="n" className="flex items-center gap-2.5">
              <div className="size-7 rounded-sm bg-foreground/5 ring-1 ring-border grid place-items-center">
                <Terminal className="size-3.5 text-muted-foreground" />
              </div>
              <div className="leading-tight">
                <div className="text-[13px] font-medium">{s.name}</div>
                <div className="text-[10px] text-muted-foreground font-mono">{s.id}</div>
              </div>
            </div>,
            <MonoCell key="t">{s.transport}</MonoCell>,
            <MonoCell key="u" className="text-muted-foreground max-w-[24rem] truncate inline-block" title={s.url}>
              {s.url}
            </MonoCell>,
            <MonoCell key="a" className="text-muted-foreground">
              {s.auth ?? "—"}
            </MonoCell>,
            <StatusPill key="s" tone={toneForMCP(s.status)} label={s.status} />,
            <MonoCell key="tc" className="text-muted-foreground">
              {s.toolCount ?? 0}
            </MonoCell>,
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
              <Button size="icon-xs" variant="ghost" onClick={() => setEditing(s)} aria-label="编辑">
                <Pencil className="size-3.5" />
              </Button>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label="删除"
                className="hover:text-rose-600"
                onClick={() => remove(s.id)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>,
          ],
        }))}
        empty={
          servers.length === 0
            ? "后端未实装 /api/mcp/servers 端点 · 当前为 graceful empty state。"
            : "没有匹配的 MCP server."
        }
      />

      <div className="mt-3 flex items-center gap-3 text-[10.5px] text-muted-foreground font-mono">
        <KeyCell>NOTE</KeyCell>
        <span>Auth 仅展示脱敏标记 · 真实值加密存于 mcp_configs.auth_encrypted</span>
      </div>

      <EditDialog
        server={editing}
        creating={creating}
        onClose={() => {
          setEditing(null);
          setCreating(false);
        }}
        onSave={() => {
          setEditing(null);
          setCreating(false);
        }}
      />
    </ChannelsPageShell>
  );
}

function EditDialog({
  server,
  creating,
  onClose,
  onSave,
}: {
  server: MCPServer | null;
  creating: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  const open = !!server || creating;
  if (!open) return null;
  const isEdit = !!server;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <Terminal className="size-4 text-muted-foreground" />
            {isEdit ? `编辑 MCP · ${server!.name}` : "新增 MCP server"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Transport 决定进程模型。Auth 留空表示无认证。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-xs">
          <div className="space-y-1">
            <Label htmlFor="mcp-name">Name</Label>
            <Input id="mcp-name" placeholder="filesystem" defaultValue={server?.name ?? ""} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="mcp-transport">Transport</Label>
            <Select defaultValue={server?.transport ?? "stdio"}>
              <SelectTrigger id="mcp-transport">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="stdio">stdio</SelectItem>
                <SelectItem value="sse">sse</SelectItem>
                <SelectItem value="http">http</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="mcp-url">URL / Command</Label>
            <Input
              id="mcp-url"
              placeholder="npx -y @modelcontextprotocol/server-filesystem /workspace"
              defaultValue={server?.url ?? ""}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="mcp-auth">Auth (Bearer Token, optional)</Label>
            <Input
              id="mcp-auth"
              type="password"
              placeholder="留空表示无 auth"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            取消
          </Button>
          <Button size="sm" onClick={onSave}>
            保存
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EmptyShell({ kind }: { kind: string }) {
  return (
    <ChannelsPageShell
      meta={
        <PageMeta
          items={[{ label: "backend", value: "not_implemented" }]}
          footnote={`后端未实装 ${kind} 端点 · 已废弃 mock.ts 引用,改为显示空状态。`}
        />
      }
      toolbar={<></>}
    >
      <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-border py-24 text-center">
        <Inbox className="size-6 text-foreground/35" />
        <span className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-foreground/40">
          empty state
        </span>
        <p className="max-w-[44ch] text-sm text-foreground/60">
          {kind} 数据接口后端未实装。
          <br />
          一旦后端上线,刷新页面即可看到真实数据。
        </p>
      </div>
    </ChannelsPageShell>
  );
}
