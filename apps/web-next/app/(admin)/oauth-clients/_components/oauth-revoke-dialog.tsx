"use client";

import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import type { OAuthClient } from "./types";

interface Props {
  client: OAuthClient | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (c: OAuthClient) => Promise<void>;
}

export function OAuthRevokeDialog({ client, open, onOpenChange, onConfirm }: Props) {
  const [loading, setLoading] = useState(false);
  if (!client) return null;

  const handle = async () => {
    setLoading(true);
    try {
      await onConfirm(client);
      onOpenChange(false);
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>撤销 OAuth 客户端</DialogTitle>
          <DialogDescription>
            确认 revoke <strong>{client.name}</strong>?
            <br />
            Client ID: <code className="text-xs">{client.clientId}</code>
            <br />
            状态将改为 revoked,该 client 无法再调用任何 API。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>取消</Button>
          <Button variant="destructive" disabled={loading} onClick={handle}>
            {loading && <Loader2 className="size-3.5 animate-spin" />}
            确认 Revoke
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
