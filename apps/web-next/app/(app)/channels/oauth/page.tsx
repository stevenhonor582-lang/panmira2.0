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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChannelsPageShell, PageMeta } from "@/components/channels/page-shell";
import { DenseTable, MonoCell, KeyCell } from "@/components/channels/dense-table";
import { StatusPill, toneForOAuth } from "@/components/channels/status-pill";
import { OAuthSecretModal } from "@/components/channels/oauth-secret-modal";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ExternalLink,
  Inbox,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  PowerOff,
  RefreshCw,
  RotateCw,
  Trash2,
} from "lucide-react";
import { useFetch } from "@/lib/channels/use-fetch";
import { mutate } from "@/lib/channels/api-mutations";

/**
 * /channels/oauth — OAuth 双向
 *
 * 出站(Consumer) = 我们接别人(授权给第三方应用使用我们的 API)
 * 入站(Provider) = 别人接我们(我们作为 OAuth server 颁发的 client)
 *
 * 安全规则:
 *  - client_secret 明文只在创建/Rotate 时显示一次
 *  - 不写日志、不存 localStorage、不在列表行展示
 *  - 丢失只能 Rotate 重新生成
 */

interface OAuthAuthorized {
  id: string;
  appName?: string;
  app_name?: string;
  clientId?: string;
  client_id?: string;
  scopes?: string[] | string;
  grantedAt?: string;
  granted_at?: string;
  expiresAt?: string;
  expires_at?: string;
  revoked?: boolean;
  status?: string;
}

interface OAuthClient {
  id: string;
  name: string;
  type?: string;
  clientId?: string;
  client_id?: string;
  redirectUris?: string[];
  redirect_uris?: string[];
  scopes?: string[];
  status: string;
  createdAt?: string;
  created_at?: string;
}

interface OAuthClientWithSecret extends OAuthClient {
  clientSecret?: string;
}

export default function OAuthPage() {
  const [tab, setTab] = React.useState<"consumer" | "provider">("consumer");

  const {
    data: authData,
    loading: authLoading,
    error: authError,
    refresh: refreshAuth,
  } = useFetch<{ authorized: OAuthAuthorized[] }>(
    "/api/v2/channels/oauth/authorized",
  );
  const {
    data: clientData,
    loading: clientLoading,
    error: clientError,
    refresh: refreshClients,
  } = useFetch<{ clients: OAuthClient[] }>(
    "/api/v2/channels/oauth/clients",
  );

  const [reveal, setReveal] = React.useState<OAuthClientWithSecret | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [toast, setToast] = React.useState<string | null>(null);

  function notify(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  const authorized = (authData?.authorized ?? []).map((a) => ({
    id: a.id,
    name: a.appName ?? a.app_name ?? "—",
    clientId: a.clientId ?? a.client_id ?? "",
    scopes: Array.isArray(a.scopes)
      ? a.scopes
      : typeof a.scopes === "string"
        ? a.scopes.split(",").filter(Boolean)
        : [],
    grantedAt: a.grantedAt ?? a.granted_at,
    expiresAt: a.expiresAt ?? a.expires_at,
    revoked: !!a.revoked,
  }));

  const clients = (clientData?.clients ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type ?? "—",
    clientId: c.clientId ?? c.client_id ?? "",
    redirectUris: c.redirectUris ?? c.redirect_uris ?? [],
    scopes: c.scopes ?? [],
    status: c.status,
    createdAt: c.createdAt ?? c.created_at,
  }));

  const loading = authLoading || clientLoading;
  const error = authError || clientError;

  if (loading) {
    return (
      <ChannelsPageShell meta={<PageMeta items={[{ label: "加载", value: "…" }]} />} toolbar={<></>}>
        <div className="h-64 rounded-2xl bg-muted/30 animate-pulse" />
      </ChannelsPageShell>
    );
  }

  if (error && authorized.length === 0 && clients.length === 0) {
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

  const activeAuthorized = authorized.filter((a) => !a.revoked).length;
  const activeClients = clients.filter((c) => c.status === "active").length;

  async function revokeAuthorized(a: { id: string; name: string }) {
    if (!confirm(`撤销授权 "${a.name}"?`)) return;
    setBusy(true);
    const r = await mutate("DELETE", `/api/v2/channels/oauth/authorized/${a.id}`, {
      refresh: refreshAuth,
    });
    setBusy(false);
    notify(r.ok ? `✓ 已撤销 ${a.name}` : `✗ ${r.error}`);
  }

  async function revokeClient(c: OAuthClient) {
    if (!confirm(`禁用 client "${c.name}"?`)) return;
    setBusy(true);
    const r = await mutate("PATCH", `/api/v2/channels/oauth/clients/${c.id}`, {
      body: { status: "revoked" },
      refresh: refreshClients,
    });
    setBusy(false);
    notify(r.ok ? `✓ 已禁用 ${c.name}` : `✗ ${r.error}`);
  }

  async function rotateSecret(c: OAuthClient) {
    if (!confirm(`轮换 client "${c.name}" 的 secret?旧 secret 立即失效。`)) return;
    setBusy(true);
    const r = await mutate<any>(
      "POST",
      `/api/v2/channels/oauth/clients/${c.id}/secret/rotate`,
      { refresh: refreshClients },
    );
    setBusy(false);
    if (r.ok) {
      const newSecret = r.data?.clientSecret ?? r.data?.data?.clientSecret;
      if (newSecret) {
        setReveal({ ...c, clientSecret: newSecret });
        notify(`✓ ${c.name} secret 已轮换`);
      } else {
        notify(`✓ ${c.name} secret 已轮换 (响应未包含明文)`);
      }
    } else {
      notify(`✗ ${r.error}`);
    }
  }

  return (
    <ChannelsPageShell
      meta={
        <PageMeta
          items={[
            { label: "已授权", value: authorized.length },
            { label: "已授权启用", value: activeAuthorized },
            { label: "Clients", value: clients.length },
            { label: "Clients 启用", value: activeClients },
          ]}
          footnote={
            <>
              出站(Consumer) = 我们授权给第三方使用我们的 API。
              入站(Provider) = 我们作为 OAuth server 颁发的 client。
              client_secret 只在创建/轮换时明文显示一次,关闭后平台不再持有。
            </>
          }
        />
      }
      toolbar={
        <>
          <div className="flex items-center gap-2">
            <KeyRound className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold tracking-tight">OAuth</h2>
            <span className="text-[11px] text-muted-foreground font-mono">secret 仅显示一次</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5"
              onClick={() => {
                refreshAuth();
                refreshClients();
              }}
            >
              <RefreshCw className="size-3.5" />
              刷新
            </Button>
            {tab === "provider" ? (
              <Button size="sm" className="gap-1.5" onClick={() => setCreating(true)}>
                <Plus className="size-3.5" />
                创建 Client
              </Button>
            ) : null}
          </div>
        </>
      }
    >
      <Tabs value={tab} onValueChange={(v) => setTab(v as "consumer" | "provider")}>
        <TabsList variant="line">
          <TabsTrigger value="consumer" className="gap-1.5">
            <ArrowUpFromLine className="size-3.5" />
            出站 · 我们接别人 (Consumer)
          </TabsTrigger>
          <TabsTrigger value="provider" className="gap-1.5">
            <ArrowDownToLine className="size-3.5" />
            入站 · 别人接我们 (Provider)
          </TabsTrigger>
        </TabsList>

        <TabsContent value="consumer" className="mt-4">
          <DenseTable
            head={["第三方应用", "Client ID", "Scopes", "授权时间", "状态", ""]}
            rows={authorized.map((a) => ({
              cells: [
                <div key="n" className="leading-tight">
                  <div className="text-[13px] font-medium">{a.name}</div>
                  <div className="text-[10px] text-muted-foreground font-mono">{a.id.slice(0, 8)}</div>
                </div>,
                <MonoCell key="cid" className="text-foreground/85">
                  {a.clientId}
                </MonoCell>,
                <div key="s" className="flex items-center gap-1 flex-wrap">
                  {a.scopes.length > 0 ? (
                    a.scopes.map((s) => (
                      <span
                        key={s}
                        className="text-[10px] font-mono uppercase tracking-wide bg-muted text-muted-foreground px-1.5 py-0.5 rounded-sm"
                      >
                        {s}
                      </span>
                    ))
                  ) : (
                    <span className="text-[10px] text-muted-foreground">—</span>
                  )}
                </div>,
                <MonoCell key="at" className="text-muted-foreground">
                  {a.grantedAt ? String(a.grantedAt).slice(0, 10) : "—"}
                </MonoCell>,
                <StatusPill
                  key="st"
                  tone={a.revoked ? toneForOAuth("revoked") : toneForOAuth("active")}
                  label={a.revoked ? "已撤销" : "已授权"}
                />,
                <div key="a" className="flex items-center gap-1 justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[11px] gap-1 hover:text-rose-600"
                    onClick={() => revokeAuthorized(a)}
                    disabled={a.revoked || busy}
                  >
                    <PowerOff className="size-3" />
                    撤销
                  </Button>
                </div>,
              ],
            }))}
            empty="尚未授权任何第三方应用"
          />
        </TabsContent>

        <TabsContent value="provider" className="mt-4">
          <DenseTable
            head={["Client 名称", "client_id", "类型", "Redirect URIs", "创建", "状态", ""]}
            rows={clients.map((c) => ({
              cells: [
                <div key="n" className="leading-tight">
                  <div className="text-[13px] font-medium">{c.name}</div>
                  <div className="text-[10px] text-muted-foreground font-mono">{c.id.slice(0, 8)}</div>
                </div>,
                <MonoCell key="cid" className="text-foreground/85" title={c.clientId}>
                  {c.clientId}
                </MonoCell>,
                <MonoCell key="t" className="text-muted-foreground">
                  {c.type}
                </MonoCell>,
                <div key="r" className="flex items-center gap-1.5">
                  <MonoCell className="text-muted-foreground max-w-[16rem] truncate inline-block">
                    {c.redirectUris.join(", ") || "—"}
                  </MonoCell>
                  {c.redirectUris[0] ? (
                    <a
                      href={c.redirectUris[0]}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted-foreground hover:text-foreground"
                      aria-label="打开"
                    >
                      <ExternalLink className="size-3" />
                    </a>
                  ) : null}
                </div>,
                <MonoCell key="ca" className="text-muted-foreground">
                  {c.createdAt ? String(c.createdAt).slice(0, 10) : "—"}
                </MonoCell>,
                <StatusPill
                  key="st"
                  tone={c.status === "active" ? toneForOAuth("active") : toneForOAuth("revoked")}
                  label={c.status === "active" ? "启用" : "已禁用"}
                />,
                <div key="a" className="flex items-center gap-1 justify-end">
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    onClick={() => rotateSecret(c)}
                    aria-label="轮换 Secret"
                    title="轮换 Secret"
                    className="hover:text-amber-600"
                    disabled={busy}
                  >
                    <RotateCw className="size-3.5" />
                  </Button>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    onClick={() => revokeClient(c)}
                    aria-label="禁用"
                    title="禁用"
                    className="hover:text-rose-600"
                    disabled={busy || c.status !== "active"}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>,
              ],
            }))}
            empty="尚未注册任何 client"
          />

          <div className="mt-3 flex items-center gap-3 text-[10.5px] text-muted-foreground font-mono">
            <KeyCell>安全</KeyCell>
            <span>client_secret 明文只显示一次,关闭后无法再读,只能 Rotate 重新生成</span>
          </div>
        </TabsContent>
      </Tabs>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-lg bg-foreground text-background px-3.5 py-2 text-xs shadow-lg">
          {toast}
        </div>
      )}

      <CreateClientDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(c) => {
          setCreating(false);
          setReveal(c);
          refreshClients();
        }}
      />

      <OAuthSecretModal
        open={!!reveal}
        clientName={reveal?.name ?? ""}
        clientId={reveal?.clientId ?? ""}
        clientSecret={reveal?.clientSecret ?? ""}
        onClose={() => setReveal(null)}
        onAcknowledge={() => setReveal(null)}
      />
    </ChannelsPageShell>
  );
}

function CreateClientDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (c: OAuthClientWithSecret) => void;
}) {
  const [name, setName] = React.useState("");
  const [type, setType] = React.useState<"web" | "native" | "cli" | "mcp_server">("web");
  const [redirectUris, setRedirectUris] = React.useState("");
  const [scopes, setScopes] = React.useState("read,write");
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setName("");
    setType("web");
    setRedirectUris("");
    setScopes("read,write");
    setErr(null);
  }, [open]);

  if (!open) return null;

  async function create() {
    if (!name.trim()) {
      setErr("名称必填");
      return;
    }
    setSaving(true);
    setErr(null);
    const body = {
      name: name.trim(),
      type,
      redirectUris: redirectUris
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean),
      scopes: scopes
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean),
      generateSecret: true,
    };
    const r = await mutate<OAuthClientWithSecret>("POST", "/api/v2/channels/oauth/clients", { body });
    setSaving(false);
    if (r.ok) {
      const clientObj: any = (r.data as any)?.client ?? (r.data as any)?.data?.client ?? {};
      const created: OAuthClientWithSecret = {
        id: clientObj.id ?? "",
        name: clientObj.name ?? name.trim(),
        type: clientObj.type ?? type,
        clientId: clientObj.clientId ?? clientObj.client_id ?? "",
        redirectUris: clientObj.redirectUris ?? clientObj.redirect_uris ?? body.redirectUris,
        scopes: clientObj.scopes ?? body.scopes,
        status: clientObj.status ?? "active",
        createdAt: clientObj.createdAt ?? clientObj.created_at,
        clientSecret: clientObj.clientSecret ?? clientObj.client_secret,
      };
      onCreated(created);
    } else {
      setErr(r.error || "创建失败");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(n) => !n && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <Plus className="size-4 text-muted-foreground" />
            创建 OAuth Client
          </DialogTitle>
          <DialogDescription className="text-xs">
            提交后会立即弹出 secret 明文(仅显示一次)。请保存后再关闭。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-xs">
          <div className="space-y-1">
            <Label htmlFor="o-name">名称</Label>
            <Input
              id="o-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Partner X Demo"
            />
          </div>
          <div className="space-y-1">
            <Label>类型</Label>
            <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="web">Web</SelectItem>
                <SelectItem value="native">Native (App)</SelectItem>
                <SelectItem value="cli">CLI</SelectItem>
                <SelectItem value="mcp_server">MCP Server</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="o-red">Redirect URIs(每行一个或逗号分隔)</Label>
            <textarea
              id="o-red"
              value={redirectUris}
              onChange={(e) => setRedirectUris(e.target.value)}
              placeholder={"https://partner.example.com/oauth/callback"}
              rows={3}
              className="flex w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm font-mono outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="o-scopes">Scopes(逗号分隔)</Label>
            <Input
              id="o-scopes"
              value={scopes}
              onChange={(e) => setScopes(e.target.value)}
              placeholder="read,write"
              className="font-mono"
            />
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
          <Button size="sm" onClick={create} disabled={saving}>
            {saving ? "创建中…" : "创建并显示 Secret"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
