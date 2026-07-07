"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Plus, KeyRound, Eye, EyeOff, Search, ShieldCheck,
  Copy, AlertTriangle, ChevronRight, Lock, Check, Minus,
} from "lucide-react";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { OAuthDialog } from "./_components/oauth-dialog";
import { OAuthRevokeDialog } from "./_components/oauth-revoke-dialog";
import {
  type OAuthClient, type OAuthClientCreate, type ApiEnvelope,
  TYPE_OPTIONS, SCOPE_OPTIONS,
} from "./_components/types";

const TYPE_PREFIX: Record<string, string> = {
  web: "web_",
  native: "nat_",
  cli: "cli_",
  mcp_server: "mcp_",
};

const TYPE_TONE: Record<string, string> = {
  web: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  native: "bg-violet-500/15 text-violet-600 border-violet-500/30",
  cli: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  mcp_server: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
};

export default function OAuthClientsPage() {
  const [clients, setClients] = useState<OAuthClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [revoking, setRevoking] = useState<OAuthClient | null>(null);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api<ApiEnvelope<OAuthClient[]>>("/api/v2/admin/oauth-clients");
      setClients(r.data ?? []);
    } catch { setClients([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (data: OAuthClientCreate): Promise<{ clientSecret?: string }> => {
    const r = await api<ApiEnvelope<OAuthClient> & { clientSecret?: string; client?: { clientSecret?: string } }>(
      "/api/v2/admin/oauth-clients", { method: "POST", body: data },
    );
    await load();
    return { clientSecret: r.clientSecret ?? r.client?.clientSecret };
  };

  const handleRevoke = async (c: OAuthClient) => {
    await api(`/api/v2/admin/oauth-clients/${c.id}`, { method: "DELETE" });
    await load();
  };

  const filtered = useMemo(() => {
    return clients.filter((c) => {
      if (filterType !== "all" && c.type !== filterType) return false;
      if (!query) return true;
      const q = query.toLowerCase();
      return c.name.toLowerCase().includes(q) ||
        c.clientId.toLowerCase().includes(q);
    });
  }, [clients, query, filterType]);

  const stats = useMemo(() => {
    const byType: Record<string, number> = {};
    clients.forEach((c) => {
      const t = c.type ?? "unknown";
      byType[t] = (byType[t] ?? 0) + 1;
    });
    return { total: clients.length, active: clients.filter((c) => c.status === "active").length, byType };
  }, [clients]);

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <KeyRound className="size-5 text-muted-foreground" />
            Access Tokens
          </h2>
          <p className="text-sm text-muted-foreground">
            接入账户 = 每个 OAuth Client 一个账户 · 前缀区分接入类型 · 可逐项勾选 scope
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-1.5">
          <Plus className="size-4" />
          新建 Token
        </Button>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="总数" value={stats.total} />
        <StatCard label="活跃" value={stats.active} tone="text-emerald-600" />
        {TYPE_OPTIONS.map((t) => (
          <button
            key={t.value}
            onClick={() => setFilterType(filterType === t.value ? "all" : t.value)}
            className={`text-left rounded-md border px-3 py-2.5 transition-colors ${
              filterType === t.value
                ? "border-primary bg-primary/5"
                : "border-border bg-card hover:border-primary/50"
            }`}
          >
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              {t.label}
            </p>
            <p className="text-lg font-semibold tabular-nums">
              {stats.byType[t.value] ?? 0}
              <span className="text-xs text-muted-foreground font-mono ml-1">
                {TYPE_PREFIX[t.value] ?? ""}
              </span>
            </p>
          </button>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Search className="size-4 text-muted-foreground" />
            <Input
              placeholder="搜索 Token 名称 / client_id..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1"
            />
            {filterType !== "all" && (
              <Badge variant="outline" className={TYPE_TONE[filterType]}>
                {TYPE_OPTIONS.find((t) => t.value === filterType)?.label}
              </Badge>
            )}
            <span className="text-sm text-muted-foreground tabular-nums">{filtered.length} 个</span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              {query || filterType !== "all" ? "没有匹配的 Token" : "还没有 Token — 点右上角创建"}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>名称</TableHead>
                  <TableHead>Client ID</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>Scopes</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">创建</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TokenRow
                    key={c.id}
                    client={c}
                    expanded={expandedId === c.id}
                    onToggle={() => setExpandedId(expandedId === c.id ? null : c.id)}
                    onRevoke={() => { setRevoking(c); setRevokeOpen(true); }}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <OAuthDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleCreate}
      />
      <OAuthRevokeDialog
        client={revoking}
        open={revokeOpen}
        onOpenChange={setRevokeOpen}
        onConfirm={handleRevoke}
      />
    </div>
  );
}

function TokenRow({
  client, expanded, onToggle, onRevoke,
}: {
  client: OAuthClient;
  expanded: boolean;
  onToggle: () => void;
  onRevoke: () => void;
}) {
  const [reveal, setReveal] = useState(false);
  const prefix = TYPE_PREFIX[client.type ?? ""] ?? "";
  const masked = (id: string) => id.length > 12
    ? `${id.slice(0, 8)}${"•".repeat(Math.min(id.length - 12, 20))}${id.slice(-4)}`
    : id;
  const copy = (text: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
    }
  };

  return (
    <>
      <TableRow className="cursor-pointer" onClick={onToggle}>
        <TableCell>
          <ChevronRight
            className={`size-4 text-muted-foreground transition-transform ${
              expanded ? "rotate-90" : ""
            }`}
          />
        </TableCell>
        <TableCell className="font-medium">
          <div className="flex items-center gap-1.5">
            <Lock className="size-3.5 text-muted-foreground" />
            {client.name}
          </div>
        </TableCell>
        <TableCell>
          <code className="text-[11px] font-mono bg-muted/50 px-1.5 py-0.5 rounded">
            {reveal ? client.clientId : masked(client.clientId)}
          </code>
        </TableCell>
        <TableCell>
          <Badge variant="outline" className={`text-[10px] ${TYPE_TONE[client.type ?? ""] ?? ""}`}>
            {prefix || "—"}
            <span className="ml-1 text-muted-foreground">
              {TYPE_OPTIONS.find((t) => t.value === client.type)?.label ?? "—"}
            </span>
          </Badge>
        </TableCell>
        <TableCell>
          <div className="flex flex-wrap gap-1">
            {(client.scopes ?? []).slice(0, 3).map((s) => (
              <Badge key={s} variant="secondary" className="text-[10px] font-mono">{s}</Badge>
            ))}
            {(client.scopes?.length ?? 0) > 3 && (
              <span className="text-[10px] text-muted-foreground">
                +{client.scopes.length - 3}
              </span>
            )}
          </div>
        </TableCell>
        <TableCell>
          <Badge variant={client.status === "active" ? "default" : "secondary"}>
            {client.status}
          </Badge>
        </TableCell>
        <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
          {new Date(client.createdAt).toLocaleDateString("zh-CN")}
        </TableCell>
        <TableCell onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setReveal(!reveal)}
              aria-label={reveal ? "隐藏" : "显示"}
            >
              {reveal ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => copy(client.clientId)}
              aria-label="复制"
            >
              <Copy className="size-3.5" />
            </Button>
            {client.status === "active" && (
              <Button
                variant="destructive"
                size="sm"
                onClick={onRevoke}
              >
                Revoke
              </Button>
            )}
          </div>
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={8} className="bg-muted/20 p-0">
            <PermissionsMatrix client={client} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function PermissionsMatrix({ client }: { client: OAuthClient }) {
  const grantedSet = new Set(client.scopes ?? []);
  const groupedScopes = SCOPE_OPTIONS.reduce<Record<string, string[]>>((acc, s) => {
    const cat = s.split(":")[0] ?? "other";
    (acc[cat] ??= []).push(s);
    return acc;
  }, {});
  const total = SCOPE_OPTIONS.length;
  const granted = SCOPE_OPTIONS.filter((s) => grantedSet.has(s)).length;

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <ShieldCheck className="size-4 text-emerald-500" />
          权限矩阵
        </h4>
        <span className="text-xs text-muted-foreground">
          {granted} / {total} scopes 已授权
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2">
        {Object.entries(groupedScopes).map(([cat, scopes]) => (
          <div key={cat} className="space-y-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              {cat}
            </p>
            <ul className="space-y-1">
              {scopes.map((s) => {
                const has = grantedSet.has(s);
                return (
                  <li
                    key={s}
                    className={`flex items-center justify-between gap-2 rounded px-2 py-1 text-xs ${
                      has ? "bg-emerald-500/10" : "bg-muted/30"
                    }`}
                  >
                    <code className="font-mono text-[11px]">{s}</code>
                    {has ? (
                      <Check className="size-3.5 text-emerald-500 shrink-0" />
                    ) : (
                      <Minus className="size-3 text-muted-foreground/40 shrink-0" />
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      {client.redirectUris?.length > 0 && (
        <div className="pt-2 border-t border-border/50">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
            Redirect URIs
          </p>
          <ul className="space-y-0.5">
            {client.redirectUris.map((uri) => (
              <li key={uri} className="text-xs font-mono text-muted-foreground">
                {uri}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="pt-2 border-t border-border/50 text-[10px] text-muted-foreground flex items-center gap-1.5">
        <AlertTriangle className="size-3" />
        修改权限需要 revoke 现有 token 并重新创建(密码学安全约束,GitHub 同款策略)
      </div>
    </div>
  );
}

function StatCard({
  label, value, tone,
}: { label: string; value: number | string; tone?: string }) {
  return (
    <Card className="py-3.5">
      <CardContent className="px-3.5 space-y-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-lg font-semibold tabular-nums ${tone ?? ""}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
