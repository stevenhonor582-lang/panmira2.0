"use client";

/**
 * Task card for the list/grid toggle at /tasks.
 * - Shows name, status badge, owner, node count, updated-at.
 * - Two view variants: `card` (Notion-like) and `row` (Linear-like).
 */

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, Bot, Clock, UserRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  TASK_STATUS_LABEL,
  TASK_STATUS_TONE,
  type TaskStatus,
} from "./types";

export interface TaskListItem {
  id: string;
  name: string;
  description?: string;
  status: TaskStatus;
  ownerName?: string;
  ownerHandle?: string;
  botId?: string;
  nodeCount: number;
  edgeCount: number;
  updatedAt?: string;
}

export type ViewMode = "grid" | "list";

interface TaskCardProps {
  task: TaskListItem;
  view: ViewMode;
}

export function TaskCard({ task, view }: TaskCardProps) {
  const badgeTone = TASK_STATUS_TONE[task.status] ?? TASK_STATUS_TONE.ready;
  const nodeText = `${task.nodeCount} 节点 · ${task.edgeCount} 边`;

  if (view === "list") {
    return (
      <Link
        href={`/tasks/${task.id}`}
        className="group flex items-center gap-4 px-4 py-2.5 border-b hover:bg-muted/40 transition-colors"
      >
        <div className="flex-1 min-w-0 grid grid-cols-12 gap-3 items-center">
          <div className="col-span-5 min-w-0">
            <div className="text-sm font-medium truncate flex items-center gap-2">
              {task.name}
              <ArrowUpRight className="size-3 opacity-0 group-hover:opacity-60 transition-opacity" />
            </div>
            {task.description && (
              <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                {task.description}
              </div>
            )}
          </div>
          <div className="col-span-2 text-[11px] text-muted-foreground font-mono">
            {nodeText}
          </div>
          <div className="col-span-2 text-[11px] text-muted-foreground truncate flex items-center gap-1">
            {task.botId ? (
              <>
                <Bot className="size-3" />
                {task.botId}
              </>
            ) : (
              <span className="text-foreground/30">—</span>
            )}
          </div>
          <div className="col-span-2 text-[11px] text-muted-foreground truncate flex items-center gap-1">
            {task.ownerName ? (
              <>
                <UserRound className="size-3" />
                {task.ownerName}
              </>
            ) : (
              <span className="text-foreground/30">未指派</span>
            )}
          </div>
          <div className="col-span-1 text-right">
            <Badge
              variant="outline"
              className={cn("text-[10px] px-1.5 py-0 ring-1", badgeTone)}
            >
              {TASK_STATUS_LABEL[task.status]}
            </Badge>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={`/tasks/${task.id}`}
      className="group relative flex flex-col rounded-xl ring-1 ring-foreground/10 bg-card hover:ring-foreground/30 hover:-translate-y-px transition-all p-4 gap-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold leading-tight truncate flex items-center gap-1.5">
            {task.name}
            <ArrowUpRight className="size-3 opacity-0 group-hover:opacity-60 transition-opacity" />
          </div>
          {task.description && (
            <div className="text-[11px] text-muted-foreground line-clamp-2 mt-1 leading-snug">
              {task.description}
            </div>
          )}
        </div>
        <Badge
          variant="outline"
          className={cn("text-[10px] px-1.5 py-0 ring-1 shrink-0", badgeTone)}
        >
          {TASK_STATUS_LABEL[task.status]}
        </Badge>
      </div>

      <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-auto pt-2 border-t border-foreground/5">
        <span className="font-mono">{nodeText}</span>
        <span className="text-foreground/30">·</span>
        <span className="flex items-center gap-1">
          {task.botId ? (
            <>
              <Bot className="size-3" />
              <span className="truncate max-w-[80px]">{task.botId}</span>
            </>
          ) : (
            <span className="text-foreground/30">—</span>
          )}
        </span>
        <span className="ml-auto flex items-center gap-1 text-foreground/50">
          <Clock className="size-3" />
          {task.updatedAt ? formatRelative(task.updatedAt) : "—"}
        </span>
      </div>
    </Link>
  );
}

function formatRelative(iso: string): string {
  try {
    const diff = Date.now() - +new Date(iso);
    if (diff < 60_000) return "刚刚";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分前`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
    return `${Math.floor(diff / 86_400_000)} 天前`;
  } catch {
    return "—";
  }
}