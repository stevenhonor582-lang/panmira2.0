"use client";

import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import type { User } from "./types";

interface Props {
  user: User | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (u: User) => Promise<void>;
}

export function UserDeleteDialog({ user, open, onOpenChange, onConfirm }: Props) {
  const [loading, setLoading] = useState(false);
  if (!user) return null;

  const handle = async () => {
    setLoading(true);
    try {
      await onConfirm(user);
      onOpenChange(false);
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>删除用户</DialogTitle>
          <DialogDescription>
            确认删除 <strong>{user.email}</strong>({user.name})? 不可撤销。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>取消</Button>
          <Button variant="destructive" disabled={loading} onClick={handle}>
            {loading && <Loader2 className="size-3.5 animate-spin" />}
            确认删除
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
