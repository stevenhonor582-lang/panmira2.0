"use client";

/**
 * /tasks — task collaboration list page.
 *
 * - Fetches `/api/v2/admin/pipelines` (the canonical pipeline list).
 * - Filterable by status (ready / running / ...) and bot.
 * - View toggle: grid (cards) ↔ list (rows).
 * - "新建任务" CTA → /tasks/new.
 */

import * as React from "react";
import Link from "next/link";
import {
  ArrowDownUp,
  LayoutGrid,
  List as ListIcon,
  Loader2,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
} from "lucide-react";

import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { TaskCard, type TaskListItem, type ViewMode } from "@/components/tasks/task-card";
import { PipelineRunsSection } from "@/components/r10/sections";
import type { TaskStatus } from "@/components/tasks/types";
import { useToast } from "@/components/toast/toast-provider";

interface RawPipeline {
  id: string;
  name?: string;
  description?: string;
  status?: string;
  updatedAt?: string;
  createdAt?: string;
  ownerId?: string;
  ownerName?: string;
  nodes?: unknown[];
  edges?: unknown[];
  triggerType?: string;
  config?: { botId?: string; nodes?: unknown[]; edges?: unknown[] } | null;
}

function mapPipeline(p: RawPipeline): TaskListItem {
  const cfg = p.config ?? null;
  const nodes = (cfg?.nodes ?? p.nodes ?? []) as unknown[];
  const edges = (cfg?.edges ?? p.edges ?? []) as unknown[];
  const status = normalizeStatus(p.status);
  return {
    id: p.id,
    name: p.name ?? "未命名任务",
    description: p.description,
    status,
    ownerName: p.ownerName,
    botId: cfg?.botId ?? p.triggerType ?? undefined,
    nodeCount: Array.isArray(nodes) ? nodes.length : 0,
    edgeCount: Array.isArray(edges) ? edges.length : 0,
    updatedAt: p.updatedAt ?? p.createdAt,
  };
}

function normalizeStatus(s?: string): TaskStatus {
  switch (s) {
    case "active":
      return "ready";
    case "paused":
      return "paused";
    case "running":
      return "running";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    default:
      return "ready";
  }
}

const STATUS_OPTIONS: Array<{ value: "all" | TaskStatus; label: string }> = [
  { value: "all", label: "全部状态" },
  { value: "ready", label: "待执行" },
  { value: "running", label: "执行中" },
  { value: "completed", label: "已完成" },
  { value: "failed", label: "失败" },
  { value: "paused", label: "已暂停" },
];

export default function TasksListPage() {
  const toast = useToast();
  const [tasks, setTasks] = React.useState<TaskListItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [view, setView] = React.useState<ViewMode>("grid");
  const [statusFilter, setStatusFilter] = React.useState<"all" | TaskStatus>("all");
  const [botFilter, setBotFilter] = React.useState<"all" | string>("all");
  const [search, setSearch] = React.useState("");
  const [sortKey, setSortKey] = React.useState<"updated" | "name" | "status">("updated");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [batchRunning, setBatchRunning] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = (await api("/api/v2/admin/pipelines")) as {
          data?: { pipelines?: RawPipeline[] } | RawPipeline[];
        };
        if (cancelled) return;
        const list: RawPipeline[] = Array.isArray(res?.data)
          ? (res?.data as RawPipeline[])
          : ((res?.data as { pipelines?: RawPipeline[] })?.pipelines ?? []);
        setTasks(list.map(mapPipeline));
      } catch (e) {
        setError(e instanceof Error ? e.message : "加载失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const botOptions = React.useMemo(() => {
    const set = new Set<string>();
    for (const t of tasks) if (t.botId) set.add(t.botId);
    return Array.from(set).sort();
  }, [tasks]);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = tasks.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (botFilter !== "all" && t.botId !== botFilter) return false;
      if (q && !t.name.toLowerCase().includes(q)) return false;
      return true;
    });
    list.sort((a, b) => {
      if (sortKey === "name") return (a.name || "").localeCompare(b.name || "");
      if (sortKey === "status") return (a.status || "").localeCompare(b.status || "");
      return (+new Date(b.updatedAt ?? 0)) - (+new Date(a.updatedAt ?? 0));
    });
    return list;
  }, [tasks, statusFilter, botFilter, search, sortKey]);

  const summary = React.useMemo(() => {
    const acc: Record<TaskStatus, number> = {
      ready: 0,
      running: 0,
      completed: 0,
      failed: 0,
      paused: 0,
    };
    for (const t of tasks) acc[t.status]++;
    return acc;
  }, [tasks]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">任务列表</h1>
          <p className="text-sm text-muted-foreground mt-1">
            所有任务 · 状态 · 执行历史
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/tasks/templates"
            className="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg text-sm font-medium ring-1 ring-foreground/15 hover:bg-muted transition-all"
          >
            <Sparkles className="size-4 text-primary" />
            模板
          </Link>
          <Link
            href="/tasks/new"
            className="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/80 transition-all active:translate-y-px"
          >
            <Plus className="size-4" />
            新建任务
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-xs flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索任务名"
            className="h-8 pl-8 text-sm"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as TaskStatus | "all")}>
          <SelectTrigger className="h-8 w-[140px] text-sm">
            <SlidersHorizontal className="size-3.5 mr-1 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {botOptions.length > 0 && (
          <Select value={botFilter} onValueChange={(v) => setBotFilter(v ?? "all")}>
            <SelectTrigger className="h-8 w-[160px] text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部 bot</SelectItem>
              {botOptions.map((b) => (
                <SelectItem key={b} value={b}>
                  {b}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={sortKey} onValueChange={(v) => setSortKey(v as "updated" | "name" | "status")}>
          <SelectTrigger className="h-8 w-[120px] text-sm">
            <ArrowDownUp className="size-3.5 mr-1 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="updated">最近更新</SelectItem>
            <SelectItem value="name">名称</SelectItem>
            <SelectItem value="status">状态</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-1 ring-1 ring-foreground/10 rounded-md p-0.5 bg-card">
          <button
            type="button"
            onClick={() => setView("grid")}
            className={`grid place-items-center size-7 rounded transition-colors ${
              view === "grid"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
            aria-label="网格视图"
          >
            <LayoutGrid className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setView("list")}
            className={`grid place-items-center size-7 rounded transition-colors ${
              view === "list"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
            aria-label="列表视图"
          >
            <ListIcon className="size-3.5" />
          </button>
        </div>
      </div>

      {selected.size > 0 && (
        <BatchOpsBar
          selectedCount={selected.size}
          onClear={() => setSelected(new Set())}
          running={batchRunning}
          onAction={async (action) => {
            setBatchRunning(true);
            try {
              await Promise.all(
                Array.from(selected).map((id) =>
                  api(`/api/v2/admin/pipelines/${id}`, {
                    method: action === "delete" ? "DELETE" : "PATCH",
                    body: action === "delete" ? undefined : { enabled: action === "enable" },
                  }),
                ),
              );
              setSelected(new Set());
              window.location.reload();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "批量操作失败");
            } finally {
              setBatchRunning(false);
            }
          }}
        />
      )}
      <div className="flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
        <span>共 <strong className="text-foreground font-mono">{tasks.length}</strong> 个任务</span>
        {summary.ready > 0 && (
          <span>待执行 <strong className="text-foreground font-mono">{summary.ready}</strong></span>
        )}
        {summary.running > 0 && (
          <span>执行中 <strong className="text-sky-600 font-mono">{summary.running}</strong></span>
        )}
        {summary.completed > 0 && (
          <span>已完成 <strong className="text-emerald-600 font-mono">{summary.completed}</strong></span>
        )}
        {summary.failed > 0 && (
          <span>失败 <strong className="text-rose-600 font-mono">{summary.failed}</strong></span>
        )}
      </div>

      {loading ? (
        <div className="grid place-items-center py-16 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin mr-2 inline-block" />
          加载任务中…
        </div>
      ) : error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 text-rose-700 px-4 py-3 text-sm">
          加载失败 · {error}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState />
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filtered.map((t) => (
            <TaskCard key={t.id} task={t} view="grid" />
          ))}
        </div>
      ) : (
        <div className="rounded-md ring-1 ring-foreground/10 bg-card overflow-hidden">
          <ListHeader />
          {filtered.map((t) => (
            <TaskCard key={t.id} task={t} view="list" />
          ))}
        </div>
      )}

      <PipelineRunsSection />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="grid place-items-center py-20 border border-dashed rounded-lg bg-muted/10">
      <div className="text-center space-y-3 max-w-sm">
        <div className="grid place-items-center mx-auto size-12 rounded-full bg-muted">
          <Plus className="size-5 text-muted-foreground" />
        </div>
        <div className="text-sm font-medium">还没有任务</div>
        <div className="text-xs text-muted-foreground">
          从模板一键导入，或在 DAG 编辑器自由编排你的第一个工作流。
        </div>
        <Link
          href="/tasks/new"
          className="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/80 transition-all active:translate-y-px"
        >
          <Plus className="size-3.5" />
          新建任务
        </Link>
      </div>
    </div>
  );
}

function ListHeader() {
  return (
    <div className="px-4 py-2 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground border-b bg-muted/20 grid grid-cols-12 gap-3">
      <div className="col-span-5">任务名</div>
      <div className="col-span-2">规模</div>
      <div className="col-span-2">Bot</div>
      <div className="col-span-2">负责人</div>
      <div className="col-span-1 text-right">状态</div>
    </div>
  );
}

interface BatchOpsBarProps {
  selectedCount: number;
  onClear: () => void;
  running: boolean;
  onAction: (action: "enable" | "disable" | "delete") => void;
}

function BatchOpsBar({ selectedCount, onClear, running, onAction }: BatchOpsBarProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-md ring-1 ring-primary/30 bg-primary/5 text-xs">
      <span className="font-medium">
        已选 <span className="font-mono text-primary">{selectedCount}</span> 个任务
      </span>
      <button
        type="button"
        disabled={running}
        onClick={() => onAction("enable")}
        className="h-7 px-2.5 rounded-md bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100 disabled:opacity-50"
      >启用</button>
      <button
        type="button"
        disabled={running}
        onClick={() => onAction("disable")}
        className="h-7 px-2.5 rounded-md bg-amber-50 text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100 disabled:opacity-50"
      >停用</button>
      <button
        type="button"
        disabled={running}
        onClick={() => {
          const ok = window.confirm(
            "确认删除 " + selectedCount + " 个任务? 此操作不可撤销。",
          );
          if (ok) onAction("delete");
        }}
        className="h-7 px-2.5 rounded-md bg-rose-50 text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100 inline-flex items-center gap-1 disabled:opacity-50"
      >
        <Trash2 className="size-3" />
        删除
      </button>
      {running && <Loader2 className="size-3 animate-spin" />}
      <button
        type="button"
        onClick={onClear}
        className="ml-auto text-[10px] text-muted-foreground hover:text-foreground"
      >取消选择</button>
    </div>
  );
}