"use client";

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
import { Trash2, Plug, Calendar, Power } from "lucide-react";
import type { ChannelBinding } from "./types";

interface Props {
  channel: ChannelBinding | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: (channel: ChannelBinding) => void;
}

export function ChannelDetailDrawer({ channel, open, onOpenChange, onDelete }: Props) {
  if (!channel) return null;

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
                <span className="font-mono text-xs">
                  {channel.groupId || channel.pattern || channel.id.slice(0, 8)}
                </span>
              </DrawerTitle>
              <DrawerDescription className="font-mono text-xs">
                {channel.pattern || "—"}
              </DrawerDescription>
            </div>
            <Badge variant={channel.enabled ? "default" : "secondary"}>
              {channel.enabled ? "启用" : "停用"}
            </Badge>
          </div>
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
          <section className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">优先级</p>
              <p className="text-xs font-mono tabular-nums">{channel.priority}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">状态</p>
              <p className="text-xs flex items-center gap-1.5">
                <Power className="size-3 text-muted-foreground" />
                {channel.enabled ? "启用" : "停用"}
              </p>
            </div>
            <div className="space-y-1 col-span-2">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Group ID</p>
              <p className="font-mono text-xs break-all bg-muted/40 px-2.5 py-1.5 rounded-md border border-border">
                {channel.groupId || "—"}
              </p>
            </div>
          </section>

          <Separator />

          <section className="space-y-2">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Target Bots ({channel.targetBots?.length ?? 0})
            </p>
            {channel.targetBots && channel.targetBots.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {channel.targetBots.map((b) => (
                  <Badge key={b} variant="secondary" className="font-mono text-[10px]">
                    {b}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">未配置 target bot</p>
            )}
          </section>

          <Separator />

          <section className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">创建</p>
              <p className="text-xs flex items-center gap-1.5">
                <Calendar className="size-3 text-muted-foreground" />
                {new Date(channel.createdAt).toLocaleString("zh-CN")}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">更新</p>
              <p className="text-xs flex items-center gap-1.5">
                <Calendar className="size-3 text-muted-foreground" />
                {new Date(channel.updatedAt).toLocaleString("zh-CN")}
              </p>
            </div>
          </section>

          <Separator />

          <section className="space-y-2">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">UUID</p>
            <p className="font-mono text-[11px] text-muted-foreground break-all">{channel.id}</p>
          </section>
        </div>

        <DrawerFooter className="border-t flex-row justify-between">
          <Button
            variant="destructive"
            size="icon-sm"
            onClick={() => onDelete(channel)}
            aria-label="删除"
          >
            <Trash2 className="size-3.5" />
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
