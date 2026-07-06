"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Plug, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api";
import { ChannelDialog } from "./_components/channel-dialog";
import { ChannelDetailDrawer } from "./_components/channel-detail-drawer";
import { ChannelDeleteDialog } from "./_components/channel-delete-dialog";
import type { ChannelBinding, ChannelCreate } from "./_components/types";

export default function ChannelsPage() {
  const [channels, setChannels] = useState<ChannelBinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailCh, setDetailCh] = useState<ChannelBinding | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [deleting, setDeleting] = useState<ChannelBinding | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api<{ channels: ChannelBinding[] }>("/api/v2/admin/channels");
      setChannels(data.channels ?? []);
    } catch {
      setChannels([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return channels;
    const q = search.toLowerCase();
    return channels.filter(
      (c) =>
        c.id.toLowerCase().includes(q) ||
        c.groupId?.toLowerCase().includes(q) ||
        c.pattern?.toLowerCase().includes(q),
    );
  }, [channels, search]);

  const handleCreate = async (data: ChannelCreate) => {
    await api("/api/v2/admin/channels", { method: "POST", body: data });
    await load();
  };

  const handleDelete = async (c: ChannelBinding) => {
    await api(`/api/v2/admin/channels/${c.id}`, { method: "DELETE" });
    setDetailOpen(false);
    setDetailCh(null);
    await load();
  };

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight">Channel</h2>
          <p className="text-sm text-muted-foreground">
            路由绑定 · {channels.length} 条
            <span className="ml-2 text-[11px] text-muted-foreground">
              (完整 Channel 实体待 plan B 资源池)
            </span>
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-1.5">
          <Plus className="size-4" />
          新建路由
        </Button>
      </header>

      <div className="relative max-w-sm">
        <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="搜索 group / pattern / id..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              {search ? "没有匹配的路由" : "还没有路由 — 点右上角创建第一条"}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Group ID</TableHead>
                  <TableHead>Pattern</TableHead>
                  <TableHead className="text-right">Target Bots</TableHead>
                  <TableHead className="text-right">优先级</TableHead>
                  <TableHead>状态</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow
                    key={c.id}
                    className="cursor-pointer"
                    onClick={() => { setDetailCh(c); setDetailOpen(true); }}
                  >
                    <TableCell className="font-mono text-xs">
                      {c.groupId || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground max-w-[280px] truncate">
                      {c.pattern || "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="secondary" className="font-mono">
                        {c.targetBots?.length ?? 0}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{c.priority}</TableCell>
                    <TableCell>
                      <Badge variant={c.enabled ? "default" : "secondary"}>
                        {c.enabled ? "启用" : "停用"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ChannelDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleCreate}
      />
      <ChannelDetailDrawer
        channel={detailCh}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onDelete={(c) => { setDeleting(c); setDeleteOpen(true); }}
      />
      <ChannelDeleteDialog
        channel={deleting}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={handleDelete}
      />
    </div>
  );
}
