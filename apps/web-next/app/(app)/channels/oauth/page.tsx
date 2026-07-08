"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  StatusPill,
  toneForOAuth,
} from "@/components/channels/status-pill";
import { ChannelsPageShell, PageMeta } from "@/components/channels/page-shell";
import { DenseTable, MonoCell, KeyCell } from "@/components/channels/dense-table";
import { OAuthSecretModal } from "@/components/channels/oauth-secret-modal";
import {
  KeyRound,
  Pencil,
  Plus,
  RotateCw,
  Trash2,
  ExternalLink,
  ArrowDownToLine,
  ArrowUpFromLine,
  PowerOff,
} from "lucide-react";
import { useFetch } from "@/lib/channels/use-fetch";
import { Inbox } from "lucide-react";
import type {
  OAuthAuthorizedThirdParty,
  OAuthClient,
  OAuthClientWithSecret,
} from "@/lib/channels/types";

/**
 * /channels/oauth — OAuth 双向.
 *
 * Tab 1: 我们接别人 (consumer) — 已授权第三方应用 + token 状态 + 撤销.
 * Tab 2: 别人接我们 (provider/client) — 我们作为 OAuth server 颁发的 client.
 *
 * Security rules:
 *  - client_secret plaintext is shown EXACTLY ONCE on creation, inside
 *    OAuthSecretModal.
 *  - Never logged / never persisted to localStorage / never in list rows.
 *  - Secret must be rotated (not re-read) to recover from loss.
 *  - The "Rotate" button opens a confirmation that issues a NEW secret,
 *    then triggers the same one-time reveal modal.
 */

type Direction = "consumer" | "provider";

function generateClientSecret(): string {
  // dev-only: 32-char base64-ish. production swap -> POST /api/oauth/clients response.
  const arr = new Uint8Array(24);
  if (typeof window !== "undefined" && window.crypto) {
    window.crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  return "cs_" + Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function generateClientId(): string {
  return "cli_" + Math.random().toString(36).slice(2, 10);
}

export default function OAuthPage() {
  const [tab, setTab] = React.useState<Direction>("consumer");

  // Real data: backend currently has no /api/oauth/... endpoints — graceful empty state.
  const { data: authData, loading: authLoading, error: authError } = useFetch<{ authorized: OAuthAuthorizedThirdParty[] }>("/api/v2/channels/oauth/authorized");
  const { data: clientData, loading: clientLoading, error: clientError } = useFetch<{ clients: OAuthClient[] }>("/api/v2/channels/oauth/clients");

  const [authorized, setAuthorized] = React.useState<OAuthAuthorizedThirdParty[]>([]);
  const [clients, setClients] = React.useState<OAuthClient[]>([]);
  React.useEffect(() => { if (authData?.authorized) setAuthorized(authData.authorized); }, [authData]);
  React.useEffect(() => { if (clientData?.clients) setClients(clientData.clients); }, [clientData]);

  const [creating, setCreating] = React.useState(false);
  const [createName, setCreateName] = React.useState("");
  const [createRedirect, setCreateRedirect] = React.useState("");

  // One-time secret reveal — held ONLY here, wiped on close.
  const [reveal, setReveal] = React.useState<OAuthClientWithSecret | null>(null);

  const loading = authLoading || clientLoading;
  const firstError = authError || clientError;
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
  if (firstError?.code === "not_implemented" && authorized.length === 0 && clients.length === 0) {
    return <EmptyShell kind="OAuth (authorized + clients)" />;
  }
  if (firstError && authorized.length === 0 && clients.length === 0) {
    return (
      <ChannelsPageShell
        meta={<PageMeta items={[{ label: "error", value: firstError.message.slice(0, 24) }]} />}
        toolbar={<></>}
      >
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-6 text-sm text-rose-700 dark:text-rose-300">
          加载失败 · {firstError.message}
        </div>
      </ChannelsPageShell>
    );
  }


  function revokeAuth(id: string) {
    setAuthorized((rows) =>
      rows.map((r) => (r.id === id ? { ...r, status: "revoked" as const } : r)),
    );
  }

  function disableClient(id: string) {
    setClients((rows) =>
      rows.map((r) => (r.id === id ? { ...r, status: "disabled" as const } : r)),
    );
  }

  function rotateSecret(client: OAuthClient) {
    const newSecret = generateClientSecret();
    setReveal({
      ...client,
      clientSecret: newSecret,
    });
  }

  function createClient() {
    if (!createName.trim()) return;
    const id = `oc_${Math.random().toString(36).slice(2, 8)}`;
    const newClient: OAuthClientWithSecret = {
      id,
      clientId: generateClientId(),
      name: createName.trim(),
      redirectUris: createRedirect
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean),
      status: "active",
      createdAt: new Date().toISOString().slice(0, 10),
      clientSecret: generateClientSecret(),
    };
    // Persist without secret to client list; secret lives ONLY in modal state.
    setClients((rows) => [
      ...rows,
      {
        id: newClient.id,
        clientId: newClient.clientId,
        name: newClient.name,
        redirectUris: newClient.redirectUris,
        status: newClient.status,
        createdAt: newClient.createdAt,
      },
    ]);
    setCreating(false);
    setCreateName("");
    setCreateRedirect("");
    setReveal(newClient);
  }

  return (
    <ChannelsPageShell
      meta={
        <PageMeta
          items={[
            { label: "authorized", value: authorized.length },
            { label: "active", value: authorized.filter((a) => a.status === "active").length },
            { label: "clients", value: clients.length },
            {
              label: "active-cli",
              value: clients.filter((c) => c.status === "active").length,
            },
          ]}
          footnote={
            <>
              双向:Consumer = 我们授权给第三方;Provider = 第三方作为 client 接入我们。
              client_secret 只在创建 / Rotate 时明文显示一次,关闭后平台不再持有。
            </>
          }
        />
      }
      toolbar={
        <>
          <div className="flex items-center gap-2">
            <KeyRound className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold tracking-tight">OAuth</h2>
            <span className="text-[11px] text-muted-foreground font-mono">
              双向 · secret 仅显示一次
            </span>
          </div>
          <Tabs value={tab} onValueChange={(v) => setTab(v as Direction)}>
            <TabsList variant="line">
              <TabsTrigger value="consumer" className="gap-1.5">
                <ArrowUpFromLine className="size-3.5" />
                我们接别人 (Consumer)
              </TabsTrigger>
              <TabsTrigger value="provider" className="gap-1.5">
                <ArrowDownToLine className="size-3.5" />
                别人接我们 (Provider)
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-2">
            {tab === "provider" && (
              <Button size="sm" className="gap-1.5" onClick={() => setCreating(true)}>
                <Plus className="size-3.5" />
                创建 Client
              </Button>
            )}
          </div>
        </>
      }
    >
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as Direction)}
        className="-mt-2"
      >
        {/* Consumer — 我们接别人 */}
        <TabsContent value="consumer" className="mt-0">
          <DenseTable
            head={[
              "Third-party",
              "Scopes",
              "Authorized At",
              "Status",
              "",
            ]}
            rows={authorized.map((a) => ({
              cells: [
                <div key="n" className="flex items-center gap-2.5">
                  <div className="size-7 rounded-sm bg-foreground/5 ring-1 ring-border grid place-items-center">
                    <ArrowUpFromLine className="size-3.5 text-muted-foreground" />
                  </div>
                  <div className="leading-tight">
                    <div className="text-[13px] font-medium">{a.name}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">
                      {a.id}
                    </div>
                  </div>
                </div>,
                <div key="s" className="flex items-center gap-1 flex-wrap">
                  {a.scopes.map((s) => (
                    <span
                      key={s}
                      className="text-[10px] font-mono uppercase tracking-wide bg-muted text-muted-foreground px-1.5 py-0.5 rounded-sm"
                    >
                      {s}
                    </span>
                  ))}
                </div>,
                <MonoCell key="at" className="text-muted-foreground">
                  {a.authorizedAt}
                </MonoCell>,
                <StatusPill
                  key="st"
                  tone={toneForOAuth(a.status)}
                  label={a.status}
                />,
                <div key="a" className="flex items-center gap-1 justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[11px] gap-1 hover:text-rose-600"
                    onClick={() => revokeAuth(a.id)}
                    disabled={a.status === "revoked"}
                  >
                    <PowerOff className="size-3" />
                    撤销授权
                  </Button>
                </div>,
              ],
            }))}
            empty="尚未授权任何第三方应用."
          />
        </TabsContent>

        {/* Provider — 别人接我们 */}
        <TabsContent value="provider" className="mt-0">
          <DenseTable
            head={["Client", "client_id", "Redirect URIs", "Created", "Status", ""]}
            rows={clients.map((c) => ({
              cells: [
                <div key="n" className="flex items-center gap-2.5">
                  <div className="size-7 rounded-sm bg-foreground/5 ring-1 ring-border grid place-items-center">
                    <ArrowDownToLine className="size-3.5 text-muted-foreground" />
                  </div>
                  <div className="leading-tight">
                    <div className="text-[13px] font-medium">{c.name}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">
                      {c.id}
                    </div>
                  </div>
                </div>,
                <MonoCell
                  key="cid"
                  className="text-foreground/85"
                  title={c.clientId}
                >
                  {c.clientId}
                </MonoCell>,
                <div key="r" className="flex items-center gap-1.5">
                  <MonoCell className="text-muted-foreground max-w-[16rem] truncate inline-block">
                    {c.redirectUris.join(", ")}
                  </MonoCell>
                  {c.redirectUris[0] && (
                    <a
                      href={c.redirectUris[0]}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted-foreground hover:text-foreground"
                      aria-label="打开"
                    >
                      <ExternalLink className="size-3" />
                    </a>
                  )}
                </div>,
                <MonoCell key="ca" className="text-muted-foreground">
                  {c.createdAt}
                </MonoCell>,
                <StatusPill
                  key="st"
                  tone={toneForOAuth(c.status)}
                  label={c.status}
                />,
                <div key="a" className="flex items-center gap-1 justify-end">
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    onClick={() => rotateSecret(c)}
                    aria-label="Rotate Secret"
                    title="Rotate Secret"
                    className="hover:text-amber-600"
                  >
                    <RotateCw className="size-3.5" />
                  </Button>
                  <Button size="icon-xs" variant="ghost" aria-label="编辑">
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    onClick={() => disableClient(c.id)}
                    aria-label="禁用"
                    title={c.status === "active" ? "禁用" : "已禁用"}
                    className="hover:text-rose-600"
                    disabled={c.status !== "active"}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>,
              ],
            }))}
            empty="尚未注册任何 client."
          />

          <div className="mt-3 flex items-center gap-3 text-[10.5px] text-muted-foreground font-mono">
            <KeyCell>SECURITY</KeyCell>
            <span>
              client_secret 明文只显示一次,关闭后无法再读,只能 Rotate 重新生成
            </span>
          </div>
        </TabsContent>
      </Tabs>

      {/* Create dialog */}
      <Dialog
        open={creating}
        onOpenChange={(next) => {
          if (!next) {
            setCreateName("");
            setCreateRedirect("");
            setCreating(false);
          }
        }}
      >
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
              <Label htmlFor="o-name">Name</Label>
              <Input
                id="o-name"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="Partner X Demo"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="o-red">Redirect URIs (每行一个)</Label>
              <textarea
                id="o-red"
                value={createRedirect}
                onChange={(e) => setCreateRedirect(e.target.value)}
                placeholder={"https://partner.example.com/oauth/callback"}
                rows={3}
                className="flex w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm font-mono outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setCreating(false)}>
              取消
            </Button>
            <Button size="sm" onClick={createClient}>
              创建并显示 Secret
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* One-time secret reveal — secret never reappears after close. */}
      <OAuthSecretModal
        open={!!reveal}
        clientName={reveal?.name ?? ""}
        clientId={reveal?.clientId ?? ""}
        clientSecret={reveal?.clientSecret ?? ""}
        onClose={() => setReveal(null)}
        onAcknowledge={() => {
          // Drop plaintext from state on acknowledge.
          setReveal(null);
        }}
      />
    </ChannelsPageShell>
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
