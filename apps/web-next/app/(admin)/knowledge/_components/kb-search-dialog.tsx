"use client";

import { useState, type FormEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Search as SearchIcon } from "lucide-react";
import type { KnowledgeBase, KBSearchHit } from "./types";

interface Props {
  kb: KnowledgeBase | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSearch: (kb: KnowledgeBase, query: string) => Promise<KBSearchHit[]>;
}

export function KbSearchDialog({ kb, open, onOpenChange, onSearch }: Props) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [hits, setHits] = useState<KBSearchHit[] | null>(null);

  if (!kb) return null;

  const handleSearch = async (e: FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    try {
      const r = await onSearch(kb, query);
      setHits(r);
    } catch {
      setHits([]);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setQuery(""); setHits(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>检索测试</DialogTitle>
          <DialogDescription>
            在 <strong>{kb.name}</strong> 中跑一次混合检索(pgvector + BM25 + RRF)
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSearch} className="flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="输入查询词..."
            autoFocus
          />
          <Button type="submit" disabled={loading || !query.trim()}>
            {loading ? <Loader2 className="size-3.5 animate-spin" /> : <SearchIcon className="size-3.5" />}
            检索
          </Button>
        </form>
        <div className="flex-1 overflow-y-auto mt-2 space-y-2 min-h-[200px]">
          {loading ? (
            <div className="text-center text-sm text-muted-foreground py-8">检索中...</div>
          ) : hits === null ? (
            <div className="text-center text-sm text-muted-foreground py-8">输入查询词开始</div>
          ) : hits.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-8">无结果</div>
          ) : (
            hits.map((h, i) => (
              <div key={h.chunkId ?? i} className="rounded-md border border-border bg-card p-2.5 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-xs">{h.title ?? h.documentId ?? `Hit ${i + 1}`}</p>
                  {h.score !== undefined && (
                    <span className="text-[10px] tabular-nums text-muted-foreground font-mono">
                      score={h.score.toFixed(3)}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground line-clamp-3">
                  {h.content ?? "(无内容预览)"}
                </p>
              </div>
            ))
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
