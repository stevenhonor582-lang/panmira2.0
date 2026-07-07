"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Copy, ShieldAlert } from "lucide-react";

/**
 * OAuthSecretModal — one-time client_secret reveal.
 *
 * Hard rules (must hold across the whole IA v6 stack):
 *  - This modal is the ONLY surface where the plaintext secret is allowed
 *    to live, even momentarily.
 *  - The secret is passed in via prop, never re-fetched from /api while open.
 *  - The modal clears its in-memory copy the moment the user closes or
 *    acknowledges it; nothing is written to localStorage, sessionStorage,
 *    cookies, logs, or window state.
 *  - Closing the dialog -> the parent owns `clearSecret()` to drop the
 *    parent-held copy too. We never keep secrets in module-level state.
 */
export function OAuthSecretModal({
  open,
  clientName,
  clientId,
  clientSecret,
  onAcknowledge,
  onClose,
}: {
  open: boolean;
  clientName: string;
  clientId: string;
  clientSecret: string;
  /** Called when user clicks "I've stored it". Should also clear parent state. */
  onAcknowledge: () => void;
  onClose: () => void;
}) {
  const [copied, setCopied] = React.useState(false);

  // Clear "copied" affordance as soon as the modal closes.
  React.useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  const copy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(clientSecret);
      setCopied(true);
      // Briefly show "Copied" then reset — never log the secret anywhere.
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked; user must copy manually */
    }
  }, [clientSecret]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-start gap-2">
            <div className="mt-0.5 size-8 rounded-sm bg-rose-500/10 ring-1 ring-rose-500/30 grid place-items-center text-rose-600 dark:text-rose-300">
              <ShieldAlert className="size-4" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base">
                保存 client_secret · 仅显示一次
              </DialogTitle>
              <DialogDescription className="text-xs mt-1">
                这是一次性明文,关闭后将无法再次查看。如需轮换,请用「Rotate」。
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="rounded-sm ring-1 ring-rose-500/40 bg-rose-500/[0.04] p-3 flex gap-2">
          <AlertTriangle className="size-4 text-rose-600 dark:text-rose-300 mt-0.5 shrink-0" />
          <div className="text-[11.5px] leading-snug text-rose-700 dark:text-rose-300">
            <strong className="font-semibold">立即复制并安全存储</strong>。
            不要写入 localStorage、日志、截图或第三方协作工具。
            一旦关闭此对话框或刷新页面,平台将不再持有明文。
          </div>
        </div>

        <dl className="text-xs space-y-2">
          <div className="flex items-center justify-between gap-2">
            <dt className="text-muted-foreground font-mono uppercase tracking-wide text-[10px]">
              client
            </dt>
            <dd className="font-mono">{clientName}</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-muted-foreground font-mono uppercase tracking-wide text-[10px]">
              client_id
            </dt>
            <dd className="font-mono text-foreground/80">{clientId}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground font-mono uppercase tracking-wide text-[10px] mb-1">
              client_secret
            </dt>
            <dd>
              <div className="flex items-stretch gap-1.5">
                <code className="flex-1 break-all rounded-sm bg-foreground/95 text-background px-2.5 py-2 font-mono text-[12px] tracking-tight select-all">
                  {clientSecret}
                </code>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={copy}
                  className="shrink-0"
                >
                  <Copy className="size-3.5" />
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            </dd>
          </div>
        </dl>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            稍后处理
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              // Acknowledge -> close & drop the secret from parent state.
              onAcknowledge();
            }}
          >
            我已安全存储,清除显示
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}