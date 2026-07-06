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
import type { ChannelBinding } from "./types";

interface Props {
  channel: ChannelBinding | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (c: ChannelBinding) => Promise<void>;
}

export function ChannelDeleteDialog({ channel, open, onOpenChange, onConfirm }: Props) {
  const [loading, setLoading] = useState(false);
  if (!channel) return null;

  const handle = async () => {
    setLoading(true);
    try {
      await onConfirm(channel);
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>删除路由绑定</DialogTitle>
          <DialogDescription>
            确认删除 binding <strong>{channel.id.slice(0, 8)}</strong>?
            将不再路由消息到该 group。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            取消
          </Button>
          <Button variant="destructive" disabled={loading} onClick={handle}>
            {loading && <Loader2 className="size-3.5 animate-spin" />}
            确认删除
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
