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
import { DenseTable, MonoCell, KeyCell } from "@/components/channels/dense-table";
import { StatusPill } from "@/components/channels/status-pill";
import { OAuthSecretModal } from "@/components/channels/oauth-secret-modal";
import {
  Eye,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  RotateCw,
  Trash2,
} from "lucide-react";
import { useFetch } from "@/lib/channels/use-fetch";
import { mutate } from "@/lib/channels/api-mutations";

/**
 * /channels/oauth — 互联授权(入站 Key 管理)
 *
 * R29-B 简化: 只保留入站(外部系统接入我方 API 的 client)。
 * 出站(我们接别人的密钥)移到「外部互联」(MCP) 页。
 *
 * 安全规则:
 *  - client_secret 创建/轮换时明文返回一次
 *  - 平台后端只存 hash, 但前端把明文保管到本机 localStorage(可随时查看)
 *  - 跨设备不可见 → 换设备需轮换重新生成
 */

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
  businessSystem?: string | null;
  updatedAt?: string;
  updated_at?: string;
}

interface OAuthClientWithSecret extends OAuthClient {
  clientSecret?: string;
}

/* ------------------------------------------------------------------ */
/* localStorage 密钥保管(本机可随时查看)                              */
/* ------------------------------------------------------------------ */

const LS_VAULT = "panmira:oauth-secrets-v1";

type VaultEntry = {
  clientId: string;
  clientSecret: string;
  name: string;
  businessSystem?: string | null;
  savedAt: string;
};

function readVault(): Record<string, VaultEntry> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(LS_VAULT) || "{}");
  } catch {
    return {};
  }
}

function writeVault(v: Record<string, VaultEntry>) {
  try {
    localStorage.setItem(LS_VAULT, JSON.stringify(v));
  } catch {
    /* quota / private mode — silently ignore */
  }
}

function saveSecret(c: OAuthClientWithSecret) {
  if (!c.id || !c.clientSecret) return;
  const v = readVault();
  v[c.id] = {
    clientId: c.clientId ?? "",
    clientSecret: c.clientSecret,
    name: c.name,
    businessSystem: c.businessSystem ?? null,
    savedAt: new Date().toISOString(),
  };
  writeVault(v);
}

function getSecret(id: string): VaultEntry | null {
  return readVault()[id] ?? null;
}

function forgetSecret(id: string) {
  const v = readVault();
  delete v[id];
  writeVault(v);
}

/* ------------------------------------------------------------------ */
/* Page                                                               */
/* ------------------------------------------------------------------ */

export default function OAuthPage() {
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
  const [, forceTick] = React.useReducer((n: number) => n + 1, 0);

  function notify(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  const clients: OAuthClient[] = React.useMemo(() => {
    const raw = clientData?.clients ?? [];
    return raw.map((c) => ({
      ...c,
      clientId: c.clientId ?? c.client_id,
      redirectUris: c.redirectUris ?? c.redirect_uris,
      createdAt: c.createdAt ?? c.created_at,
      updatedAt: c.updatedAt ?? c.updated_at,
      businessSystem: c.businessSystem ?? null,
    }));
  }, [clientData]);

  const loading = clientLoading;
  const error = clientError;

  if (loading) {
    return (
      <ChannelsPageShell meta={<PageMeta items={[{ label: "加载", value: "…" }]} />} toolbar={<></>}>
        <div className="h-64 rounded-2xl bg-muted/30 animate-pulse" />
      </ChannelsPageShell>
    );
  }

  if (error && clients.length === 0) {
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

  const activeClients = clients.filter((c) => c.status === "active").length;
  const revokedClients = clients.length - activeClients;
  const withBusinessSystem = clients.filter((c) => c.businessSystem).length;
  const vaultCount = Object.keys(readVault()).length;

  async function revokeClient(c: OAuthClient) {
    if (!confirm(`禁用 client "${c.name}"?已禁用的 client 不能再换 secret。`)) return;
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
      const updated: OAuthClientWithSecret = { ...c, clientSecret: newSecret };
      if (newSecret) {
        saveSecret(updated);
        setReveal(updated);
        notify(`✓ ${c.name} secret 已轮换(已存入本机保管)`);
      } else {
        notify(`✓ ${c.name} secret 已轮换(响应未包含明文)`);
      }
    } else {
      notify(`✗ ${r.error}`);
    }
  }

  function viewSecret(c: OAuthClient) {
    const entry = getSecret(c.id);
    if (!entry) {
      notify(`⚠ ${c.name}: 本机未保管该密钥(可能在别处创建)。轮换以重新生成。`);
      return;
    }
    setReveal({ ...c, clientSecret: entry.clientSecret });
  }

  return (
    <ChannelsPageShell
      meta={
        <PageMeta
          items={[
            { label: "接入 Client", value: clients.length },
            { label: "启用", value: activeClients },
            { label: "已禁用", value: revokedClients },
            { label: "登记业务系统", value: withBusinessSystem },
            { label: "本机保管密钥", value: vaultCount },
          ]}
          footnote={
            <>
              只管入站(外部系统接入我方 API)。出站密钥请到「外部互联」(MCP)。
              <br />
              client_secret 后端只存 hash;前端把明文保管到本机浏览器,可随时查看。
              <br />
              数据存储于 <code className="font-mono">oauth_clients</code> 表。
            </>
          }
        />
      }
      toolbar={
        <>
          <div className="flex items-center gap-2">
            <KeyRound className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold tracking-tight">互联授权</h2>
            <span className="text-[11px] text-muted-foreground font-mono">入站 Key</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5"
              onClick={() => {
                refreshClients();
                forceTick();
              }}
            >
              <RefreshCw className="size-3.5" />
              刷新
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => setCreating(true)}>
              <Plus className="size-3.5" />
              创建 Client
            </Button>
          </div>
        </>
      }
    >
      <DenseTable
        head={["Client 名称", "业务系统", "client_id", "类型", "创建", "状态", ""]}
        rows={clients.map((c) => ({
          cells: [
            <div key="n" className="leading-tight">
              <div className="text-[13px] font-medium">{c.name}</div>
              <div className="text-[10px] text-muted-foreground font-mono">{c.id.slice(0, 8)}</div>
            </div>,
            <MonoCell key="bs" className="text-foreground/85">
              {c.businessSystem ? (
                <span className="inline-flex items-center gap-1">
                  <span className="size-1 rounded-full bg-sky-500" />
                  {c.businessSystem}
                </span>
              ) : (
                <span className="text-muted-foreground/60">未登记</span>
              )}
            </MonoCell>,
            <MonoCell key="cid" className="text-foreground/85" title={c.clientId}>
              {c.clientId}
            </MonoCell>,
            <MonoCell key="t" className="text-muted-foreground">
              {c.type || "—"}
            </MonoCell>,
            <MonoCell key="ca" className="text-muted-foreground">
              {c.createdAt ? String(c.createdAt).slice(0, 10) : "—"}
            </MonoCell>,
            <StatusPill
              key="st"
              tone={c.status === "active" ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground"}
              label={c.status === "active" ? "启用" : "已禁用"}
            />,
            <div key="a" className="flex items-center gap-1 justify-end">
              <Button
                size="icon-xs"
                variant="ghost"
                onClick={() => viewSecret(c)}
                aria-label="查看密钥"
                title="查看密钥(本机保管)"
                className="hover:text-sky-600"
                disabled={busy || c.status !== "active"}
              >
                <Eye className="size-3.5" />
              </Button>
              <Button
                size="icon-xs"
                variant="ghost"
                onClick={() => rotateSecret(c)}
                aria-label="轮换 Secret"
                title="轮换 Secret"
                className="hover:text-amber-600"
                disabled={busy || c.status !== "active"}
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
        empty="尚未注册任何 client · 点右上「创建 Client」开始"
      />

      <div className="mt-3 flex items-center gap-3 text-[10.5px] text-muted-foreground font-mono">
        <KeyCell>安全</KeyCell>
        <span>
          密钥本机保管(localStorage), 可「查看」随时读出;跨设备不可见, 需轮换重新生成。
        </span>
      </div>

      {/* 接入台账 */}
      <section className="mt-5 rounded-sm ring-1 ring-border bg-card/40">
        <header className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold tracking-tight">接入台账</span>
            <span className="text-[10px] text-muted-foreground font-mono">audit log</span>
          </div>
          <span className="text-[10px] text-muted-foreground font-mono">
            {clients.length} 条记录
          </span>
        </header>
        <ol className="divide-y divide-border">
          {clients
            .slice()
            .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
            .map((c) => {
              const inVault = !!getSecret(c.id);
              return (
                <li key={c.id} className="flex items-center gap-3 px-4 py-2 text-[11px]">
                  <span className="font-mono text-muted-foreground w-24 shrink-0">
                    {c.createdAt ? String(c.createdAt).slice(0, 16).replace("T", " ") : "—"}
                  </span>
                  <span className="font-mono text-muted-foreground/70 w-20 shrink-0">
                    {c.updatedAt && c.updatedAt !== c.createdAt ? "已更新" : "创建"}
                  </span>
                  <span className="font-medium truncate flex-1">{c.name}</span>
                  <span className="text-muted-foreground truncate hidden md:inline-block max-w-[14rem]">
                    {c.businessSystem || "未登记业务系统"}
                  </span>
                  <StatusPill
                    tone={c.status === "active" ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground"}
                    label={c.status === "active" ? "启用" : "已禁用"}
                  />
                  <span
                    className={`font-mono text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded-sm ${
                      inVault
                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                        : "bg-muted text-muted-foreground/70"
                    }`}
                    title={inVault ? "本机已保管密钥" : "本机未保管密钥"}
                  >
                    {inVault ? "key ✓" : "no key"}
                  </span>
                </li>
              );
            })}
          {clients.length === 0 ? (
            <li className="px-4 py-6 text-center text-[11px] text-muted-foreground">
              台账为空
            </li>
          ) : null}
        </ol>
      </section>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-lg bg-foreground text-background px-3.5 py-2 text-xs shadow-lg">
          {toast}
        </div>
      )}

      <CreateClientDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(c) => {
          saveSecret(c);
          setCreating(false);
          setReveal(c);
          refreshClients();
          forceTick();
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

/* ------------------------------------------------------------------ */
/* Create Client Dialog(加 business_system 字段)                     */
/* ------------------------------------------------------------------ */

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
  const [businessSystem, setBusinessSystem] = React.useState("");
  const [type, setType] = React.useState<"web" | "native" | "cli" | "mcp_server">("web");
  const [redirectUris, setRedirectUris] = React.useState("");
  const [scopes, setScopes] = React.useState("read,write");
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setName("");
    setBusinessSystem("");
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
      businessSystem: businessSystem.trim() || null,
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
        businessSystem: clientObj.businessSystem ?? body.businessSystem,
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
            创建互联授权 Client
          </DialogTitle>
          <DialogDescription className="text-xs">
            提交后立即显示 secret 明文,并自动保管到本机(可随时查看)。
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
            <Label htmlFor="o-bs">业务系统(登记接入方)</Label>
            <Input
              id="o-bs"
              value={businessSystem}
              onChange={(e) => setBusinessSystem(e.target.value)}
              placeholder="例如:销售系统 / 客服工作台 / metmira CRM"
            />
            <p className="text-[10px] text-muted-foreground">
              登记这个 Key 是给哪个业务系统用的,方便接入台账追溯。
            </p>
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
            {saving ? <Loader2 className="size-3.5 animate-spin mr-1.5" /> : null}
            {saving ? "创建中…" : "创建并显示 Secret"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
