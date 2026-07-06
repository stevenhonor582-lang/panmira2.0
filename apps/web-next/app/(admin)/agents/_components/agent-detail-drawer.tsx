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
import { Pencil, Trash2, Bot, Calendar, Hash, Power } from "lucide-react";
import type { Agent } from "./types";

interface Props {
  agent: Agent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (agent: Agent) => void;
  onDelete: (agent: Agent) => void;
}

export function AgentDetailDrawer({
  agent,
  open,
  onOpenChange,
  onEdit,
  onDelete,
}: Props) {
  if (!agent) return null;

  return (
    <Drawer open={open} onOpenChange={onOpenChange} swipeDirection="right">
      <DrawerContent className="max-w-2xl w-full">
        <DrawerHeader className="border-b">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <DrawerTitle className="flex items-center gap-2">
                <span className="size-7 rounded-md bg-primary/10 text-primary grid place-items-center">
                  <Bot className="size-4" />
                </span>
                {agent.displayName || agent.name}
              </DrawerTitle>
              <DrawerDescription>
                {agent.description || "—"}
              </DrawerDescription>
            </div>
            <Badge variant={agent.isActive ? "default" : "secondary"}>
              {agent.isActive ? "已启用" : "已停用"}
            </Badge>
          </div>
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
          <section className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                角色模板
              </p>
              <p className="font-mono">{agent.roleTemplate}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                版本
              </p>
              <p className="font-mono flex items-center gap-1.5">
                <Hash className="size-3 text-muted-foreground" />
                v{agent.version}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                创建时间
              </p>
              <p className="flex items-center gap-1.5 text-xs">
                <Calendar className="size-3 text-muted-foreground" />
                {new Date(agent.createdAt).toLocaleString("zh-CN")}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                更新时间
              </p>
              <p className="flex items-center gap-1.5 text-xs">
                <Calendar className="size-3 text-muted-foreground" />
                {new Date(agent.updatedAt).toLocaleString("zh-CN")}
              </p>
            </div>
          </section>

          <Separator />

          <section className="space-y-2">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              能力 ({agent.capabilities?.length ?? 0})
            </p>
            {agent.capabilities && agent.capabilities.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {agent.capabilities.map((c) => (
                  <Badge key={c} variant="secondary">
                    {c}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-xs">未配置</p>
            )}
          </section>

          <section className="space-y-2">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              工具 ({agent.tools?.length ?? 0})
            </p>
            {agent.tools && agent.tools.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {agent.tools.map((t) => (
                  <Badge key={t} variant="outline">
                    {t}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-xs">未配置</p>
            )}
          </section>

          {agent.ironLaws && agent.ironLaws.length > 0 && (
            <section className="space-y-2">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                铁律 ({agent.ironLaws.length})
              </p>
              <ul className="space-y-1 text-xs">
                {agent.ironLaws.map((law, i) => (
                  <li
                    key={i}
                    className="rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-1.5"
                  >
                    {law}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <Separator />

          <section className="space-y-2">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              系统提示词
            </p>
            <pre className="rounded-md border border-border bg-muted/40 p-3 text-xs font-mono whitespace-pre-wrap break-words max-h-72 overflow-y-auto">
              {agent.systemPrompt || "—"}
            </pre>
          </section>

          <section className="space-y-2">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              ID
            </p>
            <p className="font-mono text-[11px] text-muted-foreground break-all">
              {agent.id}
            </p>
          </section>
        </div>

        <DrawerFooter className="border-t flex-row justify-between">
          <Button
            variant="destructive"
            onClick={() => onDelete(agent)}
            className="gap-1.5"
          >
            <Trash2 className="size-3.5" />
            删除
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              关闭
            </Button>
            <Button onClick={() => onEdit(agent)} className="gap-1.5">
              <Pencil className="size-3.5" />
              编辑
            </Button>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
