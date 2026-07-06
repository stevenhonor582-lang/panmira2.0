"use client";

import { useEffect, useState } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Database,
  Trash2,
  Upload,
  Search as SearchIcon,
  FileText,
  Calendar,
  Hash,
  Power,
} from "lucide-react";
import { api } from "@/lib/api";
import type { KnowledgeBase, KBDocument, ApiEnvelope } from "./types";

interface Props {
  kb: KnowledgeBase | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: (kb: KnowledgeBase) => void;
  onUpload: (kb: KnowledgeBase) => void;
  onSearch: (kb: KnowledgeBase) => void;
}

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

export function KbDetailDrawer({ kb, open, onOpenChange, onDelete, onUpload, onSearch }: Props) {
  const [docs, setDocs] = useState<KBDocument[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !kb) return;
    setLoading(true);
    setDocs([]);
    api<ApiEnvelope<KBDocument[]>>(`/api/v2/admin/knowledge-bases/${kb.id}/documents`)
      .then((r) => setDocs(r.data ?? []))
      .catch(() => setDocs([]))
      .finally(() => setLoading(false));
  }, [open, kb]);

  if (!kb) return null;

  return (
    <Drawer open={open} onOpenChange={onOpenChange} swipeDirection="right">
      <DrawerContent className="max-w-2xl w-full">
        <DrawerHeader className="border-b">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <DrawerTitle className="flex items-center gap-2">
                <span className="size-7 rounded-md bg-emerald-500/10 text-emerald-500 grid place-items-center">
                  <Database className="size-4" />
                </span>
                {kb.name}
              </DrawerTitle>
              <DrawerDescription>{kb.description || "—"}</DrawerDescription>
            </div>
            <Badge variant={kb.indexStatus === "ready" ? "default" : "secondary"}>
              {kb.indexStatus}
            </Badge>
          </div>
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
          <section className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">类型</p>
              <p className="text-xs">{TYPE_LABELS[kb.type] ?? kb.type} <span className="text-muted-foreground">({kb.type})</span></p>
            </div>
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">可见性</p>
              <p className="text-xs font-mono">{kb.visibility}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">文档数 / Chunk 数</p>
              <p className="text-xs flex items-center gap-1.5 tabular-nums">
                <FileText className="size-3 text-muted-foreground" />
                {kb.documentCount} docs · {kb.chunkCount} chunks
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">分块参数</p>
              <p className="text-xs font-mono tabular-nums">
                size={kb.chunkSize} · overlap={kb.chunkOverlap}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">创建</p>
              <p className="text-xs flex items-center gap-1.5">
                <Calendar className="size-3 text-muted-foreground" />
                {new Date(kb.createdAt).toLocaleString("zh-CN")}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">更新</p>
              <p className="text-xs flex items-center gap-1.5">
                <Calendar className="size-3 text-muted-foreground" />
                {new Date(kb.updatedAt).toLocaleString("zh-CN")}
              </p>
            </div>
          </section>

          <Separator />

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                文档 ({docs.length})
              </p>
              <Button variant="ghost" size="sm" onClick={() => onUpload(kb)} className="gap-1.5 h-6 text-xs">
                <Upload className="size-3" />
                上传
              </Button>
            </div>
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : docs.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">
                暂无文档 — 点上方"上传"
              </p>
            ) : (
              <ul className="space-y-1.5">
                {docs.map((d) => (
                  <li
                    key={d.id}
                    className="rounded-md border border-border bg-card p-2.5 space-y-1"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-xs">{d.title}</p>
                      <Badge variant="outline" className="text-[10px]">
                        {new Date(d.updatedAt).toLocaleDateString("zh-CN")}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground line-clamp-2">
                      {d.content.slice(0, 120)}...
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <Separator />

          <section className="space-y-2">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">UUID</p>
            <p className="font-mono text-[11px] text-muted-foreground break-all">{kb.id}</p>
          </section>
        </div>

        <DrawerFooter className="border-t flex-row justify-between">
          <Button
            variant="destructive"
            size="icon-sm"
            onClick={() => onDelete(kb)}
            aria-label="删除"
          >
            <Trash2 className="size-3.5" />
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>关闭</Button>
            <Button variant="secondary" onClick={() => onSearch(kb)} className="gap-1.5">
              <SearchIcon className="size-3.5" />
              检索测试
            </Button>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
