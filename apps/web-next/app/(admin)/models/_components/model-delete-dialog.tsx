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
import type { Model } from "./types";

interface Props {
  model: Model | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (model: Model) => Promise<void>;
}

export function ModelDeleteDialog({ model, open, onOpenChange, onConfirm }: Props) {
  const [loading, setLoading] = useState(false);
  if (!model) return null;

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm(model);
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>删除模型</DialogTitle>
          <DialogDescription>
            确认删除 <strong>{model.name}</strong>({model.model})? 此操作不可撤销。
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
