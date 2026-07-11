"use client";

import * as React from "react";
import { KeyRound, Plus, Trash2, RotateCcw, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useFetch } from "@/lib/channels/use-fetch";
import { apiPost, apiPatch, apiDelete, mutate } from "@/lib/channels/api-mutations";
import { cn } from "@/lib/utils";

/**
 * R68-3 · 块 8: 一个 MCP server 多个 API key + 轮询
 *
 * - 调 GET  /api/v2/admin/mcp-servers/:id/credentials      列出凭据(不回明文)
 * - 调 POST /api/v2/admin/mcp-servers/:id/credentials      新增一把 key
 * - 调 PATCH/DELETE /api/v2/admin/mcp-servers/:id/credentials/:cid  改/删
 * - 调 POST /api/v2/admin/mcp-servers/:id/credentials/pick   轮询选下一把
 *
 * 前端只展示存在 + label + failureCount + 最后使用时间,
 * 不展示明文(明文后端存 encrypted_key)。
 */

type Credential = {
  id: string;
  mcpServerId: string;
  label: string | null;
  failureCount: number;
  lastUsedAt: string | null;
  disabled: boolean;
  createdAt: string;
  keyHint?: string;
  hasKey?: boolean;
};

export function McpCredentialsDialog({
  serverId,
  serverName,
  open,
  onOpenChange,
}: {
  serverId: string | null;
  serverName: string;
  open: boolean;
  onOpenChange: (n: boolean) => void;
}) {
  const url = serverId ? `/api/v2/admin/mcp-servers/${serverId}/credentials` : null;
  const { data, loading, error, refresh } = useFetch<{ success?: boolean; data?: Credential[] }>(url);
  const credentials: Credential[] = React.useMemo(() => {
    if (!data) return [];
    if (Array.isArray((data as any).data)) return (data as any).data as Credential[];
    return [];
  }, [data]);

  const [busy, setBusy] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [newLabel, setNewLabel] = React.useState("");
  const [newKey, setNewKey] = React.useState("");
  const [pickResult, setPickResult] = React.useState<{ id: string; label: string | null } | null>(null);

  function notify(msg: string) {
    console.log("[mcp-creds]", msg);
  }

  async function addOne() {
    if (!serverId) return;
    if (!newKey.trim()) { notify("请填入 API key"); return; }
    setBusy("add");
    const r = await apiPost(`/api/v2/admin/mcp-servers/${serverId}/credentials`, {
      label: newLabel.trim() || null,
      encryptedKey: newKey.trim(),
    });
    setBusy(null);
    if (r.ok) {
      setAdding(false);
      setNewLabel("");
      setNewKey("");
      refresh();
      notify("已添加凭据");
    } else {
      notify(`添加失败 · ${r.error}`);
    }
  }

  async function toggleDisabled(c: Credential) {
    if (!serverId) return;
    setBusy(c.id);
    await apiPatch(`/api/v2/admin/mcp-servers/${serverId}/credentials/${c.id}`, {
      disabled: !c.disabled,
    });
    setBusy(null);
    refresh();
  }

  async function removeOne(c: Credential) {
    if (!serverId) return;
    if (!confirm(`删除凭据 ${c.label || c.id.slice(0, 8)}?`)) return;
    setBusy(c.id);
    await apiDelete(`/api/v2/admin/mcp-servers/${serverId}/credentials/${c.id}`);
    setBusy(null);
    refresh();
  }

  async function pickNext() {
    if (!serverId) return;
    setBusy("pick");
    const r = await apiPost<{ success?: boolean; data?: { id: string; label: string | null } }>(
      `/api/v2/admin/mcp-servers/${serverId}/credentials/pick`,
      {},
    );
    setBusy(null);
    if (r.ok && r.data?.data) {
      setPickResult({ id: r.data.data.id, label: r.data.data.label });
      refresh();
    } else {
      notify(`轮询失败 · ${r.error}`);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <KeyRound className="size-4" />
            密钥池 · {serverName}
          </DialogTitle>
          <DialogDescription className="text-xs">
            1 服务多密钥 · 轮询选下一把 · 后端按 failureCount ASC + last_used_at ASC 排序
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
          {!serverId ? (
            <div className="text-[12px] text-muted-foreground py-6 text-center">未选择 server</div>
          ) : loading ? (
            <div className="text-[12px] text-muted-foreground py-6 text-center flex items-center justify-center gap-2">
              <Loader2 className="size-3 animate-spin" /> 载入中…
            </div>
          ) : error ? (
            <div className="text-[12px] text-rose-700 dark:text-rose-300 py-6 text-center font-mono">
              拉取失败: {error.message || error.code}
            </div>
          ) : credentials.length === 0 ? (
            <div className="text-[12px] text-muted-foreground py-6 text-center font-mono">
              尚未添加任何密钥 · 点下方「添加」按钮添加
            </div>
          ) : (
            <ol className="space-y-1">
              {credentials.map((c) => (
                <li
                  key={c.id}
                  className={cn(
                    "flex items-center gap-2 rounded-sm ring-1 ring-border bg-background/50 px-2.5 py-1.5",
                    c.disabled && "opacity-50",
                    pickResult && pickResult.id === c.id && "ring-foreground/40 bg-foreground/5",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[12.5px] font-medium truncate">
                        {c.label || c.id.slice(0, 8)}
                      </span>
                      {c.disabled ? (
                        <span className="text-[9px] font-mono uppercase bg-rose-500/15 text-rose-700 dark:text-rose-300 px-1 py-0.5 rounded-sm">
                          已禁用
                        </span>
                      ) : (
                        <span className="text-[9px] font-mono uppercase bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 px-1 py-0.5 rounded-sm">
                          活跃
                        </span>
                      )}
                      {pickResult && pickResult.id === c.id ? (
                        <span className="text-[9px] font-mono uppercase bg-foreground text-background px-1 py-0.5 rounded-sm">
                          本轮选中
                        </span>
                      ) : null}
                    </div>
                    <div className="text-[10px] text-muted-foreground font-mono truncate">
                      失败 {c.failureCount} 次 ·{" "}
                      {c.lastUsedAt ? `最近用 ${new Date(c.lastUsedAt).toLocaleString()}` : "未使用过"}
                    </div>
                  </div>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label="禁用/启用"
                    title={c.disabled ? "启用" : "禁用"}
                    disabled={busy === c.id}
                    onClick={() => toggleDisabled(c)}
                  >
                    {c.disabled ? <RotateCcw className="size-3" /> : <span className="text-[10px]">OFF</span>}
                  </Button>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label="删除"
                    title="删除"
                    disabled={busy === c.id}
                    onClick={() => removeOne(c)}
                    className="hover:text-rose-500"
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </li>
              ))}
            </ol>
          )}
        </div>

        <DialogFooter className="flex flex-col gap-2">
          {adding ? (
            <div className="rounded-sm ring-1 ring-border bg-background/40 p-2 space-y-1.5 w-full">
              <Input
                placeholder="标签(如 prod-2026Q1)"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                className="h-8 text-xs"
              />
              <Input
                placeholder="API key(后端加密存储,前端不回显)"
                type="password"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                className="h-8 text-xs font-mono"
              />
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
                  取消
                </Button>
                <Button size="sm" onClick={addOne} disabled={busy === "add" || !newKey.trim()}>
                  {busy === "add" ? <Loader2 className="size-3 animate-spin" /> : "保存"}
                </Button>
              </div>
            </div>
          ) : null}
          <div className="flex items-center gap-2 w-full">
            <Button
              size="sm"
              variant="outline"
              onClick={pickNext}
              disabled={busy === "pick" || credentials.length === 0}
              title="按 failureCount ASC + last_used_at ASC 选下一把"
            >
              {busy === "pick" ? <Loader2 className="size-3 animate-spin" /> : <RotateCcw className="size-3" />}
              轮询下一把
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setAdding((a) => !a)}
              className="ml-auto"
            >
              <Plus className="size-3" />
              {adding ? "收起" : "添加密钥"}
            </Button>
            <Button size="sm" variant="ghost" onClick={refresh} title="刷新">
              <RefreshCw className="size-3" />
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
