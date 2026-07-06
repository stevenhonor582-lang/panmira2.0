"use client";

import { useEffect, useState } from "react";
import { Plus, KeyRound, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { OAuthDialog } from "./_components/oauth-dialog";
import { OAuthRevokeDialog } from "./_components/oauth-revoke-dialog";
import {
  type OAuthClient, type OAuthClientCreate, type ApiEnvelope,
} from "./_components/types";

export default function OAuthClientsPage() {
  const [clients, setClients] = useState<OAuthClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [revoking, setRevoking] = useState<OAuthClient | null>(null);
  const [revokeOpen, setRevokeOpen] = useState(false);

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
    const r = await api<ApiEnvelope<OAuthClient> & { clientSecret?: string }>(
      "/api/v2/admin/oauth-clients", { method: "POST", body: data },
    );
    await load();
    return { clientSecret: r.clientSecret };
  };

  const handleRevoke = async (c: OAuthClient) => {
    await api(`/api/v2/admin/oauth-clients/${c.id}`, { method: "DELETE" });
    await load();
  };

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <KeyRound className="size-5 text-muted-foreground" />
            OAuth Client
          </h2>
          <p className="text-sm text-muted-foreground">
            外部系统 / CLI / MCP server 接入凭证 · {clients.length} 个
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-1.5">
          <Plus className="size-4" />
          新建 Client
        </Button>
      </header>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : clients.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              还没有 OAuth Client — 点右上角创建
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
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
                {clients.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="font-mono text-xs">{c.clientId}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">
                        {c.type ?? "—"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(c.scopes ?? []).slice(0, 3).map((s) => (
                          <Badge key={s} variant="secondary" className="text-[10px] font-mono">{s}</Badge>
                        ))}
                        {(c.scopes?.length ?? 0) > 3 && (
                          <span className="text-[10px] text-muted-foreground">
                            +{c.scopes.length - 3}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={c.status === "active" ? "default" : "secondary"}>
                        {c.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                      {new Date(c.createdAt).toLocaleDateString("zh-CN")}
                    </TableCell>
                    <TableCell>
                      {c.status === "active" && (
                        <Button variant="destructive" size="sm" onClick={() => { setRevoking(c); setRevokeOpen(true); }}>
                          Revoke
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
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
