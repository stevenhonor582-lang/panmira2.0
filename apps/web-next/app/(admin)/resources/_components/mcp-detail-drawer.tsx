"use client";

import {
  Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Trash2, Plug, Activity, Calendar, RefreshCw, Loader2 } from "lucide-react";
import type { McpServer } from "./types";

interface Props {
  server: McpServer | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: (server: McpServer) => void;
  onHealth: (server: McpServer) => Promise<{ status: string; latencyMs?: number; error?: string }>;
}

export function McpDetailDrawer({ server, open, onOpenChange, onDelete, onHealth }: Props) {
  if (!server) return null;

  return (
    <Drawer open={open} onOpenChange={onOpenChange} swipeDirection="right">
      <DrawerContent className="max-w-xl w-full">
        <DrawerHeader className="border-b">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <DrawerTitle className="flex items-center gap-2">
                <span className="size-7 rounded-md bg-rose-500/10 text-rose-500 grid place-items-center">
                  <Plug className="size-4" />
                </span>
                {server.name}
              </DrawerTitle>
              <DrawerDescription className="font-mono text-xs">
                {server.url}
              </DrawerDescription>
            </div>
            <HealthBadge status={server.healthStatus} />
          </div>
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
          <section className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Transport</p>
              <p className="text-xs font-mono">{server.transport ?? "http"}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Auth</p>
              <p className="text-xs font-mono">{server.authType ?? "none"}</p>
            </div>
            <div className="space-y-1 col-span-2">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">上次检查</p>
              <p className="flex items-center gap-1.5 text-xs">
                <Calendar className="size-3 text-muted-foreground" />
                {server.lastCheckAt ? new Date(server.lastCheckAt).toLocaleString("zh-CN") : "—"}
              </p>
            </div>
            <div className="space-y-1 col-span-2">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">UUID</p>
              <p className="font-mono text-[11px] text-muted-foreground break-all">{server.id}</p>
            </div>
          </section>
        </div>

        <DrawerFooter className="border-t flex-row justify-between">
          <Button variant="destructive" size="icon-sm" onClick={() => onDelete(server)} aria-label="删除">
            <Trash2 className="size-3.5" />
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>关闭</Button>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

function HealthBadge({ status }: { status?: string }) {
  if (status === "healthy") return <Badge className="bg-emerald-500/15 text-emerald-500">healthy</Badge>;
  if (status === "degraded") return <Badge variant="secondary">degraded</Badge>;
  if (status === "down") return <Badge variant="destructive">down</Badge>;
  return <Badge variant="outline">unknown</Badge>;
}
