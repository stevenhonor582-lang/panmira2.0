"use client";

import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import type { McpServer } from "./types";

interface Props {
  server: McpServer | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (s: McpServer) => Promise<void>;
}

export function McpDeleteDialog({ server, open, onOpenChange, onConfirm }: Props) {
  const [loading, setLoading] = useState(false);
  if (!server) return null;

  const handle = async () => {
    setLoading(true);
    try {
      await onConfirm(server);
      onOpenChange(false);
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>删除 MCP Server</DialogTitle>
          <DialogDescription>
            确认删除 <strong>{server.name}</strong>? Agent 将无法再调用其 tool。
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
