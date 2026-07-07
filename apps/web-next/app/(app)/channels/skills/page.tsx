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
} from "lucide-react";
import { MOCK_SKILLS } from "@/lib/channels/mock";
import type { Skill } from "@/lib/channels/types";
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
  const [skills, setSkills] = React.useState<Skill[]>(MOCK_SKILLS);
  const [q, setQ] = React.useState("");
  const [source, setSource] = React.useState<SourceFilter>("all");

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

  function toggle(id: string) {
    setSkills((ss) =>
      ss.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)),
    );
  }

  const sources: SourceFilter[] = ["all", "built-in", "github", "local", "custom"];

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
          const Icon = SOURCE_ICON[s.source];
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
              <button
                key="en"
                type="button"
                role="switch"
                aria-checked={s.enabled}
                onClick={() => toggle(s.id)}
                className={cn(
                  "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                  s.enabled ? "bg-emerald-500" : "bg-muted-foreground/30",
                )}
              >
                <span
                  className={cn(
                    "inline-block size-3.5 rounded-full bg-background shadow transition-transform",
                    s.enabled ? "translate-x-4.5" : "translate-x-0.5",
                  )}
                />
              </button>,
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