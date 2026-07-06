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
import { Pencil, Trash2, Cpu, Calendar, Power, Star } from "lucide-react";
import type { Model } from "./types";

interface Props {
  model: Model | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (model: Model) => void;
  onDelete: (model: Model) => void;
  onTest: (model: Model) => void;
  onToggleDefault: (model: Model) => void;
  onToggleStatus: (model: Model) => void;
}

export function ModelDetailDrawer({
  model,
  open,
  onOpenChange,
  onEdit,
  onDelete,
  onTest,
  onToggleDefault,
  onToggleStatus,
}: Props) {
  if (!model) return null;

  const isActive = model.status === "active";

  return (
    <Drawer open={open} onOpenChange={onOpenChange} swipeDirection="right">
      <DrawerContent className="max-w-xl w-full">
        <DrawerHeader className="border-b">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <DrawerTitle className="flex items-center gap-2">
                <span className="size-7 rounded-md bg-blue-500/10 text-blue-500 grid place-items-center">
                  <Cpu className="size-4" />
                </span>
                {model.name}
                {model.isDefault && (
                  <Star className="size-3.5 fill-amber-400 text-amber-400" />
                )}
              </DrawerTitle>
              <DrawerDescription>
                {model.type.toUpperCase()} · {model.model}
              </DrawerDescription>
            </div>
            <Badge variant={isActive ? "default" : "secondary"}>
              {isActive ? "已启用" : "已停用"}
            </Badge>
          </div>
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
          <section className="space-y-2">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              端点
            </p>
            <p className="font-mono text-xs break-all bg-muted/40 px-2.5 py-1.5 rounded-md border border-border">
              {model.baseUrl}
            </p>
          </section>

          <Separator />

          <section className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                模型 ID
              </p>
              <p className="font-mono text-xs">{model.model}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                状态
              </p>
              <p className="flex items-center gap-1.5 text-xs">
                <Power className="size-3 text-muted-foreground" />
                {isActive ? "启用" : "停用"}
              </p>
            </div>
            <div className="space-y-1 col-span-2">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                创建时间
              </p>
              <p className="flex items-center gap-1.5 text-xs">
                <Calendar className="size-3 text-muted-foreground" />
                {new Date(model.createdAt).toLocaleString("zh-CN")}
              </p>
            </div>
          </section>

          <Separator />

          <section className="space-y-2">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              UUID
            </p>
            <p className="font-mono text-[11px] text-muted-foreground break-all">
              {model.id}
            </p>
          </section>
        </div>

        <DrawerFooter className="border-t flex-row justify-between">
          <div className="flex gap-2">
            <Button
              variant="destructive"
              size="icon-sm"
              onClick={() => onDelete(model)}
              aria-label="删除"
            >
              <Trash2 className="size-3.5" />
            </Button>
            <Button
              variant={model.isDefault ? "secondary" : "outline"}
              size="sm"
              onClick={() => onToggleDefault(model)}
              className="gap-1.5"
            >
              <Star className="size-3.5" />
              {model.isDefault ? "取消默认" : "设为默认"}
            </Button>
          </div>
          <div className="flex gap-2">
            {model.type === "embedding" && (
              <Button
                variant="outline"
                onClick={() => onToggleStatus(model)}
                className="gap-1.5"
              >
                <Power className="size-3.5" />
                {model.status === "active" ? "停用" : "启用"}
              </Button>
            )}
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              关闭
            </Button>
            <Button variant="secondary" onClick={() => onTest(model)} className="gap-1.5">
              测试调用
            </Button>
            <Button onClick={() => onEdit(model)} className="gap-1.5">
              <Pencil className="size-3.5" />
              编辑
            </Button>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
