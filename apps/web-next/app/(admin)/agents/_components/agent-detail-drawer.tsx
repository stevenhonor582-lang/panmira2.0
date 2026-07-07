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
import {
  Plus,
  Pencil,
  Trash2,
  Bot,
  Calendar,
  Hash,
  GitBranch,
  Plug,
  ExternalLink,
  Database,
  Wrench,
  Link as LinkIcon,
} from "lucide-react";
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

interface KBRef {
  id: string;
  name: string;
  type: string;
  documentCount: number;
  indexStatus: string;
}

interface SkillRef {
  id: string;
  name: string;
  kind: "skill" | "mcp";
  description?: string;
}

interface ApiEnvelope<T> {
  success?: boolean;
  data?: T;
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

function readRefs<T = string>(a: Agent, key: string): T[] {
  const orch = a.orchestration as Record<string, unknown> | undefined;
  const raw = orch?.[key];
  return Array.isArray(raw) ? (raw as T[]) : [];
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
  const [kbs, setKbs] = useState<KBRef[]>([]);
  const [kbsLoading, setKbsLoading] = useState(false);
  const [skills, setSkills] = useState<SkillRef[]>([]);
  const [mcps, setMcps] = useState<SkillRef[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);

  useEffect(() => {
    if (!agent || !open) return;
    setChannelsLoading(true);
    api<{ channels: ChannelBinding[] }>("/api/v2/admin/channels")
      .then((r) => {
        const matched = (r.channels ?? []).filter((c) =>
          Array.isArray(c.targetBots) && c.targetBots.includes(agent.name),
        );
        setChannels(matched);
      })
      .catch(() => setChannels([]))
      .finally(() => setChannelsLoading(false));
  }, [agent, open]);

  useEffect(() => {
    if (!agent || !open) return;
    setKbsLoading(true);
    api<ApiEnvelope<KBRef[]>>("/api/v2/admin/knowledge-bases")
      .then((r) => setKbs(r.data ?? []))
      .catch(() => setKbs([]))
      .finally(() => setKbsLoading(false));
  }, [agent, open]);

  useEffect(() => {
    if (!agent || !open) return;
    setSkillsLoading(true);
    Promise.all([
      api<ApiEnvelope<SkillRef[]>>("/api/v2/admin/skills").catch(() => ({ data: [] })),
      api<ApiEnvelope<SkillRef[]>>("/api/v2/admin/mcps").catch(() => ({ data: [] })),
    ])
      .then(([s, m]) => {
        setSkills(s.data ?? []);
        setMcps(m.data ?? []);
      })
      .finally(() => setSkillsLoading(false));
  }, [agent, open]);

  if (!agent) return null;
  const strategy = readStrategy(agent);
  const boundKbIds = new Set(readRefs(agent, "kbRefs"));
  const boundSkillIds = new Set(readRefs(agent, "skillRefs"));
  const boundMcpIds = new Set(readRefs(agent, "mcpRefs"));
  const boundKbs = kbs.filter((k) => boundKbIds.has(k.id));
  const boundSkills = skills.filter((s) => boundSkillIds.has(s.id));
  const boundMcps = mcps.filter((s) => boundMcpIds.has(s.id));

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

          {/* RAG 知识库绑定 */}
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                RAG 知识库 ({kbsLoading ? "…" : boundKbs.length})
              </p>
              <Link
                href="/knowledge"
                className="text-[11px] text-primary hover:underline inline-flex items-center gap-1"
              >
                <Plus className="size-3" />
                管理 KB
                <ExternalLink className="size-2.5" />
              </Link>
            </div>
            {kbsLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : boundKbs.length === 0 ? (
              <p className="text-muted-foreground text-xs">
                未绑定 RAG · 编辑 Agent → "RAG" tab 添加 KB
              </p>
            ) : (
              <div className="space-y-1.5">
                {boundKbs.map((k) => (
                  <div
                    key={k.id}
                    className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5"
                  >
                    <Database className="size-3 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0 text-xs">
                      <p className="font-medium truncate">{k.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        <Badge variant="outline" className="text-[9px] mr-1">{k.type}</Badge>
                        {k.documentCount} 文档 · {k.indexStatus}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Skill 地图绑定 */}
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Skill 地图 ({skillsLoading ? "…" : boundSkills.length + boundMcps.length})
              </p>
              <Link
                href="/resources"
                className="text-[11px] text-primary hover:underline inline-flex items-center gap-1"
              >
                <Plus className="size-3" />
                管理 Skill
                <ExternalLink className="size-2.5" />
              </Link>
            </div>
            {skillsLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : boundSkills.length === 0 && boundMcps.length === 0 ? (
              <p className="text-muted-foreground text-xs">
                未绑定 Skill · 编辑 Agent → "Skill" tab 添加
              </p>
            ) : (
              <div className="space-y-1.5">
                {boundSkills.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5"
                  >
                    <Wrench className="size-3 text-muted-foreground shrink-0" />
                    <p className="font-mono text-xs truncate flex-1">{s.name}</p>
                    <Badge variant="outline" className="text-[9px]">skill</Badge>
                  </div>
                ))}
                {boundMcps.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5"
                  >
                    <LinkIcon className="size-3 text-muted-foreground shrink-0" />
                    <p className="font-mono text-xs truncate flex-1">{s.name}</p>
                    <Badge variant="outline" className="text-[9px]">mcp</Badge>
                  </div>
                ))}
              </div>
            )}
          </section>

          <Separator />

          {/* Channels */}
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
