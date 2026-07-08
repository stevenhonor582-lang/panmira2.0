"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusPill } from "@/components/channels/status-pill";
import { ChannelsPageShell, PageMeta } from "@/components/channels/page-shell";
import { DenseTable, MonoCell, KeyCell } from "@/components/channels/dense-table";
import {
  Download,
  Code,
  HardDrive,
  Package,
  Plus,
  Search,
  Wrench,
  GitBranch,
  Inbox,
} from "lucide-react";
import type { Skill } from "@/lib/channels/types";
import { useFetch } from "@/lib/channels/use-fetch";
import { cn } from "@/lib/utils";

type SourceFilter = "all" | Skill["source"];

const SOURCE_TONE: Record<Skill["source"], string> = {
  "built-in": "ok",
  github: "info",
  local: "muted",
  custom: "warn",
};

const SOURCE_ICON: Record<Skill["source"], React.ComponentType<{ className?: string }>> = {
  "built-in": Package,
  github: Code,
  local: HardDrive,
  custom: Wrench,
};

export default function SkillsPage() {
  const { data, loading, error } = useFetch<{ skills: Skill[] }>("/api/skills");
  const [q, setQ] = React.useState("");
  const [source, setSource] = React.useState<SourceFilter>("all");

  const skills: Skill[] = data?.skills ?? [];
  const sources: SourceFilter[] = ["all", "built-in", "github", "local", "custom"];

  if (loading) {
    return <ChannelsPageShell meta={<PageMeta items={[{ label: "loading", value: "…" }]} />} toolbar={<></>}>
      <div className="h-64 rounded-2xl bg-muted/30 animate-pulse" />
    </ChannelsPageShell>;
  }
  if (error?.code === "not_implemented") {
    return <EmptyShell kind="Skills" />;
  }
  if (error) {
    return <ChannelsPageShell meta={<PageMeta items={[{ label: "error", value: error.message.slice(0, 24) }]} />} toolbar={<></>}>
      <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-6 text-sm text-rose-700 dark:text-rose-300">
        加载失败 · {error.message}
      </div>
    </ChannelsPageShell>;
  }

  const enabledCount = skills.filter((s) => s.enabled).length;
  const disabledCount = skills.length - enabledCount;

  const filtered = skills.filter((s) => {
    if (source !== "all" && s.source !== source) return false;
    if (!q.trim()) return true;
    const t = q.trim().toLowerCase();
    return (
      s.name.toLowerCase().includes(t) ||
      s.description.toLowerCase().includes(t) ||
      s.tags.some((tag) => tag.toLowerCase().includes(t))
    );
  });

  return (
    <ChannelsPageShell
      meta={
        <PageMeta
          items={[
            { label: "total", value: skills.length },
            { label: "enabled", value: enabledCount },
            { label: "disabled", value: disabledCount },
            {
              label: "tags",
              value: Array.from(new Set(skills.flatMap((s) => s.tags))).length,
            },
          ]}
          footnote={
            <>
              Skills 是 bot 可调用的最小能力单元。Source 区分内置 / GitHub 拉取 /
              本地文件系统 / 自定义。Toggle 立即生效,影响全部调用此 skill 的 bot。
            </>
          }
        />
      }
      toolbar={
        <>
          <div className="flex items-center gap-2">
            <Wrench className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold tracking-tight">Skills</h2>
            <span className="text-[11px] text-muted-foreground font-mono">
              {filtered.length}/{skills.length}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="搜索 name / desc / tag…"
                className="h-8 pl-7 w-56 text-xs"
              />
            </div>
            <div className="flex items-center gap-0.5 ring-1 ring-border rounded-sm p-0.5">
              {sources.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSource(s)}
                  className={cn(
                    "px-2 py-1 rounded-sm text-[11px] font-mono uppercase tracking-wide transition-colors",
                    source === s
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
            <Button size="sm" variant="outline" className="gap-1.5">
              <GitBranch className="size-3.5" />
              从 GitHub 安装
            </Button>
            <Button size="sm" className="gap-1.5">
              <Plus className="size-3.5" />
              新增 Skill
            </Button>
          </div>
        </>
      }
    >
      <DenseTable
        head={["Skill", "Source", "Tags", "Installed", "Enabled", ""]}
        rows={filtered.map((s) => {
          const Icon = SOURCE_ICON[s.source] ?? Inbox;
          return {
            cells: [
              <div key="n" className="flex items-center gap-2.5">
                <div className="size-7 rounded-sm bg-foreground/5 ring-1 ring-border grid place-items-center">
                  <Icon className="size-3.5 text-muted-foreground" />
                </div>
                <div className="leading-tight">
                  <div className="text-[13px] font-medium font-mono">
                    {s.name}
                  </div>
                  <div className="text-[10.5px] text-muted-foreground max-w-[28rem] truncate">
                    {s.description}
                  </div>
                </div>
              </div>,
              <StatusPill
                key="src"
                tone={SOURCE_TONE[s.source] as any}
                label={s.source}
                dot={false}
                className="font-mono"
              />,
              <div key="tags" className="flex items-center gap-1 flex-wrap">
                {s.tags.map((t) => (
                  <span
                    key={t}
                    className="text-[10px] font-mono uppercase tracking-wide bg-muted text-muted-foreground px-1.5 py-0.5 rounded-sm"
                  >
                    {t}
                  </span>
                ))}
              </div>,
              <MonoCell key="at" className="text-muted-foreground">
                {s.installedAt ?? "—"}
              </MonoCell>,
              <span
                key="en"
                className={cn(
                  "inline-flex h-5 w-9 items-center rounded-full transition-colors",
                  s.enabled ? "bg-emerald-500" : "bg-muted-foreground/30",
                )}
                aria-checked={s.enabled}
                role="switch"
              >
                <span
                  className={cn(
                    "inline-block size-3.5 rounded-full bg-background shadow transition-transform",
                    s.enabled ? "translate-x-4.5" : "translate-x-0.5",
                  )}
                />
              </span>,
              <div key="a" className="flex items-center justify-end gap-1">
                <Button size="icon-xs" variant="ghost" aria-label="详情">
                  <Download className="size-3.5" />
                </Button>
              </div>,
            ],
          };
        })}
        empty={
          q.trim() || source !== "all"
            ? "没有匹配的 skills,清空筛选试试。"
            : skills.length === 0
            ? "后端未返回任何 skill (空状态)。"
            : "尚未安装任何 skill."
        }
      />

      <div className="mt-3 flex items-center gap-3 text-[10.5px] text-muted-foreground font-mono">
        <KeyCell>NOTE</KeyCell>
        <span>toggle 立即生效 · 全部调用方共享同一开关位</span>
      </div>
    </ChannelsPageShell>
  );
}

function EmptyShell({ kind }: { kind: string }) {
  return (
    <ChannelsPageShell
      meta={
        <PageMeta
          items={[{ label: "backend", value: "not_implemented" }]}
          footnote={`后端未实装 ${kind} 端点 · 已废弃 mock.ts 引用,改为显示空状态。`}
        />
      }
      toolbar={<></>}
    >
      <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-border py-24 text-center">
        <Inbox className="size-6 text-foreground/35" />
        <span className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-foreground/40">
          empty state
        </span>
        <p className="max-w-[44ch] text-sm text-foreground/60">
          {kind} 数据接口后端未实装。
          <br />
          一旦后端上线,刷新页面即可看到真实数据。
        </p>
      </div>
    </ChannelsPageShell>
  );
}
