"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Pencil, Trash2, Bot, Calendar, Hash, Power, GitBranch, Plug, ExternalLink } from "lucide-react";
import type { Agent, TriggerStrategy } from "./types";
import { api } from "@/lib/api";

interface ChannelBinding {
  id: string;
  groupId: string | null;
  pattern: string | null;
  targetBots: string[];
  priority: number;
  enabled: boolean;
}

interface Props {
  agent: Agent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (agent: Agent) => void;
  onDelete: (agent: Agent) => void;
}

const STRATEGY_LABEL: Record<TriggerStrategy, string> = {
  first: "first · 跑首 pipeline",
  all: "all · 并行跑全部",
  race: "race · 先完胜",
};

const STRATEGY_DESCRIPTION: Record<TriggerStrategy, string> = {
  first: "默认 · 单 pipeline 行为 · Phase 3 兼容",
  all: "返回数组 (各 pipeline 独立回复)",
  race: "首响优先 (最快完成的 pipeline)",
};

function readStrategy(a: Agent): TriggerStrategy {
  const raw = (a.orchestration as { triggerStrategy?: unknown } | undefined)?.triggerStrategy;
  return raw === "all" || raw === "race" || raw === "first" ? raw : "first";
}

export function AgentDetailDrawer({
  agent,
  open,
  onOpenChange,
  onEdit,
  onDelete,
}: Props) {
  const [channels, setChannels] = useState<ChannelBinding[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(false);

  useEffect(() => {
    if (!agent || !open) return;
    setChannelsLoading(true);
    api<{ channels: ChannelBinding[] }>("/api/v2/admin/channels")
      .then((r) => {
        const matched = (r.channels ?? []).filter((c) =>
          Array.isArray(c.targetBots) && c.targetBots.includes(agent.name)
        );
        setChannels(matched);
      })
      .catch(() => setChannels([]))
      .finally(() => setChannelsLoading(false));
  }, [agent, open]);

  if (!agent) return null;
  const strategy = readStrategy(agent);

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
              Pipeline 触发策略
              <span className="ml-2 text-[10px] font-normal normal-case text-muted-foreground/80">
                (bot 命中多 pipeline 时)
              </span>
            </p>
            <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
              <GitBranch className="size-4 text-muted-foreground" />
              <div className="flex-1">
                <p className="font-mono text-xs">{STRATEGY_LABEL[strategy]}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {STRATEGY_DESCRIPTION[strategy]}
                </p>
              </div>
            </div>
          </section>

          <section className="space-y-2">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              能力 ({agent.capabilities?.length ?? 0})
            </p>
            {agent.capabilities && agent.capabilities.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {agent.capabilities.map((c) => (
                  <Badge key={c} variant="secondary">{c}</Badge>
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
                  <Badge key={t} variant="outline">{t}</Badge>
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
                  <li key={i} className="rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-1.5">
                    {law}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <Separator />

          {/* Channels — 逻辑反转：在这个 agent 上下文里管理 channel，不再单独的 Bot 配置页 */}
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Channels ({channelsLoading ? "…" : channels.length})
              </p>
              <Link
                href="/channels"
                className="text-[11px] text-primary hover:underline inline-flex items-center gap-1"
              >
                <Plus className="size-3" />
                新建路由
                <ExternalLink className="size-2.5" />
              </Link>
            </div>
            {channelsLoading ? (
              <Skeleton className="h-12 w-full" />
            ) : channels.length === 0 ? (
              <p className="text-muted-foreground text-xs">
                暂无 channel 路由到此 agent · 在
                <Link href="/channels" className="ml-1 text-primary hover:underline">Channel 接入</Link>
                中创建(targetBots 加上 <code className="font-mono">{agent.name}</code>)
              </p>
            ) : (
              <div className="space-y-1.5">
                {channels.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5"
                  >
                    <Plug className="size-3 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0 text-xs">
                      <div className="flex items-center gap-2">
                        {c.groupId && <Badge variant="outline" className="text-[10px]">{c.groupId}</Badge>}
                        {c.pattern && <span className="font-mono text-[11px] truncate">{c.pattern}</span>}
                      </div>
                      <p className="text-[10px] text-muted-foreground font-mono mt-0.5">id: {c.id} · priority {c.priority}</p>
                    </div>
                    <Badge variant={c.enabled ? "default" : "secondary"} className="text-[10px]">
                      {c.enabled ? "启用" : "停用"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </section>

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
          <Button variant="destructive" onClick={() => onDelete(agent)} className="gap-1.5">
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
