"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import type { KnowledgeBase } from "./types";

interface Props {
  kb: KnowledgeBase | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (kb: KnowledgeBase) => Promise<void>;
}

export function KbDeleteDialog({ kb, open, onOpenChange, onConfirm }: Props) {
  const [loading, setLoading] = useState(false);
  if (!kb) return null;

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm(kb);
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>删除知识库</DialogTitle>
          <DialogDescription>
            确认删除 <strong>{kb.name}</strong>?
            将级联删除 {kb.documentCount} 个文档 + {kb.chunkCount} 个 chunks,不可撤销。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            取消
          </Button>
          <Button variant="destructive" disabled={loading} onClick={handleConfirm}>
            {loading && <Loader2 className="size-3.5 animate-spin" />}
            确认删除
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
