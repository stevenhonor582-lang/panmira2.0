"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Database, FileText, Loader2 } from "lucide-react";
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
import { KbDialog } from "./_components/kb-dialog";
import { KbDetailDrawer } from "./_components/kb-detail-drawer";
import { KbDeleteDialog } from "./_components/kb-delete-dialog";
import { KbUploadDialog } from "./_components/kb-upload-dialog";
import { KbSearchDialog } from "./_components/kb-search-dialog";
import type {
  KnowledgeBase,
  KBCreate,
  KBSearchHit,
  ApiEnvelope,
} from "./_components/types";

const TYPE_LABELS: Record<string, string> = {
  industry: "行业",
  product: "产品",
  competitor: "竞品",
  solution: "方案",
  pricing: "报价",
  company: "公司",
  department: "部门",
  personal: "个人",
};

export default function KnowledgePage() {
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailKb, setDetailKb] = useState<KnowledgeBase | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [deleting, setDeleting] = useState<KnowledgeBase | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [uploading, setUploading] = useState<KnowledgeBase | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [searching, setSearching] = useState<KnowledgeBase | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api<ApiEnvelope<KnowledgeBase[]>>("/api/v2/admin/knowledge-bases");
      setKbs(data.data ?? []);
    } catch {
      setKbs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return kbs;
    const q = search.toLowerCase();
    return kbs.filter(
      (k) =>
        k.name.toLowerCase().includes(q) ||
        k.type.toLowerCase().includes(q) ||
        k.description?.toLowerCase().includes(q),
    );
  }, [kbs, search]);

  // Actions
  const handleCreate = async (data: KBCreate) => {
    await api("/api/v2/admin/knowledge-bases", { method: "POST", body: data });
    await load();
  };

  const handleDelete = async (kb: KnowledgeBase) => {
    await api(`/api/v2/admin/knowledge-bases/${kb.id}`, { method: "DELETE" });
    setDetailOpen(false);
    setDetailKb(null);
    await load();
  };

  const handleUpload = async (
    kb: KnowledgeBase,
    data: { title: string; content: string },
  ) => {
    await api(`/api/v2/admin/knowledge-bases/${kb.id}/documents`, {
      method: "POST",
      body: data,
    });
    await load();
  };

  const handleSearch = async (
    kb: KnowledgeBase,
    query: string,
  ): Promise<KBSearchHit[]> => {
    const res = await api<ApiEnvelope<{ hits: KBSearchHit[] }> | { hits: KBSearchHit[] }>(
      `/api/v2/admin/knowledge-bases/${kb.id}/search`,
      { method: "POST", body: { query, topK: 5 } },
    );
    // 兼容两种 envelope
    const hits = "data" in res && res.data && "hits" in res.data
      ? (res.data as { hits: KBSearchHit[] }).hits
      : (res as { hits: KBSearchHit[] }).hits;
    return hits ?? [];
  };

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight">数智底座 KB</h2>
          <p className="text-sm text-muted-foreground">
            知识库列表 · {kbs.length} 个 KB
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-1.5">
          <Plus className="size-4" />
          新建 KB
        </Button>
      </header>

      <div className="relative max-w-sm">
        <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="搜索名称 / 类型 / 描述..."
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
              {search ? "没有匹配的 KB" : "还没有 KB — 点右上角创建第一个"}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>可见性</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">文档 / Chunks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((kb) => (
                  <TableRow
                    key={kb.id}
                    className="cursor-pointer"
                    onClick={() => { setDetailKb(kb); setDetailOpen(true); }}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="size-6 rounded bg-emerald-500/10 text-emerald-500 grid place-items-center">
                          <Database className="size-3.5" />
                        </span>
                        <span className="font-medium">{kb.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{TYPE_LABELS[kb.type] ?? kb.type}</Badge>
                    </TableCell>
                    <TableCell className="text-xs font-mono">{kb.visibility}</TableCell>
                    <TableCell>
                      <Badge variant={kb.indexStatus === "ready" ? "default" : "secondary"}>
                        {kb.indexStatus}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                      <FileText className="size-3 inline mr-1" />
                      {kb.documentCount} / {kb.chunkCount}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <KbDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleCreate}
      />
      <KbDetailDrawer
        kb={detailKb}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onDelete={(k) => { setDeleting(k); setDeleteOpen(true); }}
        onUpload={(k) => { setUploading(k); setUploadOpen(true); }}
        onSearch={(k) => { setSearching(k); setSearchOpen(true); }}
      />
      <KbDeleteDialog
        kb={deleting}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={handleDelete}
      />
      <KbUploadDialog
        kb={uploading}
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onSubmit={handleUpload}
      />
      <KbSearchDialog
        kb={searching}
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onSearch={handleSearch}
      />
    </div>
  );
}
