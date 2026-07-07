"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Plug, HelpCircle } from "lucide-react";
import Link from "next/link";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { ChannelDetailDrawer } from "./_components/channel-detail-drawer";
import { ChannelDeleteDialog } from "./_components/channel-delete-dialog";
import {
  CATEGORIES,
  CategoryChannelDialog,
  type ChannelCategory,
  type CategoryFormValues,
  getCategoryMeta,
  toChannelCreate,
} from "./_components/channel-categories";
import type { ChannelBinding } from "./_components/types";

export default function ChannelsPage() {
  const [channels, setChannels] = useState<ChannelBinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<ChannelCategory | "all">("all");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogCategory, setDialogCategory] = useState<ChannelCategory | null>(null);
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
    let list = channels;
    if (activeCategory !== "all") {
      list = list.filter((c) => extractCategory(c.pattern) === activeCategory);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) =>
          c.id.toLowerCase().includes(q) ||
          c.groupId?.toLowerCase().includes(q) ||
          c.pattern?.toLowerCase().includes(q),
      );
    }
    return list;
  }, [channels, search, activeCategory]);

  const handleCreate = async (vals: CategoryFormValues) => {
    const body = toChannelCreate(vals);
    await api("/api/v2/admin/channels", { method: "POST", body });
    await load();
  };

  const handleDelete = async (c: ChannelBinding) => {
    await api(`/api/v2/admin/channels/${c.id}`, { method: "DELETE" });
    setDetailOpen(false);
    setDetailCh(null);
    await load();
  };

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: channels.length };
    for (const cat of CATEGORIES) {
      map[cat.key] = channels.filter((c) => extractCategory(c.pattern) === cat.key).length;
    }
    return map;
  }, [channels]);

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight">Channel 接入</h2>
            <Link href="/integrations/webhook" className="text-muted-foreground hover:text-primary" title="Webhook 接入流程">
              <HelpCircle className="size-4" />
            </Link>
          </div>
          <p className="text-sm text-muted-foreground">
            按渠道分类接入 · {channels.length} 条 ·{" "}
            <span className="text-[11px]">完整 Channel 实体待 plan B 资源池</span>
          </p>
        </div>
        <Button onClick={() => { setDialogCategory("custom"); setDialogOpen(true); }} className="gap-1.5">
          <Plus className="size-4" />
          新建 Channel
        </Button>
      </header>

      <Tabs value={activeCategory} onValueChange={(v) => setActiveCategory(v as ChannelCategory | "all")}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="all" className="gap-1 text-xs">
              <Plug className="size-3" />
              全部 ({counts.all ?? 0})
            </TabsTrigger>
            {CATEGORIES.map((c) => (
              <TabsTrigger key={c.key} value={c.key} className="gap-1 text-xs">
                <span>{c.emoji}</span>
                {c.label} ({counts[c.key] ?? 0})
              </TabsTrigger>
            ))}
          </TabsList>
          <div className="relative max-w-xs">
            <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="搜索 group / pattern / id..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>

        <TabsContent value={activeCategory} className="mt-3">
          <ChannelList
            loading={loading}
            filtered={filtered}
            onRowClick={(c) => { setDetailCh(c); setDetailOpen(true); }}
          />
        </TabsContent>
      </Tabs>

      <Card className="border-dashed bg-muted/20">
        <CardContent className="pt-4 pb-4">
          <p className="text-xs text-muted-foreground mb-2">快速创建 · 按渠道类型</p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                onClick={() => { setDialogCategory(c.key); setDialogOpen(true); }}
                className="flex items-start gap-2 rounded-md border border-border bg-card px-2.5 py-2 text-left hover:border-primary hover:bg-primary/5 transition-colors"
              >
                <span className="text-base">{c.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium">{c.label}</p>
                  <p className="text-[10px] text-muted-foreground line-clamp-2">{c.description}</p>
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <CategoryChannelDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        category={dialogCategory}
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

function ChannelList({
  loading,
  filtered,
  onRowClick,
}: {
  loading: boolean;
  filtered: ChannelBinding[];
  onRowClick: (c: ChannelBinding) => void;
}) {
  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </CardContent>
      </Card>
    );
  }
  if (filtered.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center text-sm text-muted-foreground">
          没有匹配的 Channel
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>类型</TableHead>
              <TableHead>Group ID</TableHead>
              <TableHead>Pattern</TableHead>
              <TableHead className="text-right">Target Bots</TableHead>
              <TableHead className="text-right">优先级</TableHead>
              <TableHead>状态</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((c) => {
              const cat = getCategoryMeta(extractCategory(c.pattern));
              return (
                <TableRow key={c.id} className="cursor-pointer" onClick={() => onRowClick(c)}>
                  <TableCell>
                    <Badge variant="outline" className="gap-1">
                      <span>{cat.emoji}</span>
                      {cat.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {c.groupId || <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground max-w-[280px] truncate">
                    {stripCategoryMeta(c.pattern) || "—"}
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
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function extractCategory(pattern: string | null): ChannelCategory | null {
  if (!pattern) return "custom";
  const idx = pattern.lastIndexOf("|");
  if (idx < 0) return "custom";
  try {
    const obj = JSON.parse(pattern.slice(idx + 1)) as { category?: string };
    if (obj.category && CATEGORIES.some((c) => c.key === obj.category)) {
      return obj.category as ChannelCategory;
    }
  } catch {
    /* ignore */
  }
  return "custom";
}

function stripCategoryMeta(pattern: string | null): string {
  if (!pattern) return "";
  const idx = pattern.lastIndexOf("|");
  return idx >= 0 ? pattern.slice(0, idx) : pattern;
}
