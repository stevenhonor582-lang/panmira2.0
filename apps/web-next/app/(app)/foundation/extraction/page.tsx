"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Play,
  Pause,
  Square,
  RotateCw,
  ChevronRight,
  Zap,
  Layers,
  Brain,
  Library,
  ListTree,
  CheckCircle2,
  XCircle,
  Loader2,
  Activity,
} from "lucide-react";

interface WorkerState {
  id: string;
  name: string;
  state: "running" | "paused" | "stopped";
  processed: number;
  queue: number;
  rate: string;
  uptime: string;
}

interface Extractor {
  id: string;
  name: string;
  scope: string;
  cadence: string;
  progress: number;
  eta: string;
  processed: number;
  total: number;
  status: "active" | "idle" | "error";
}

const WORKERS: WorkerState[] = [
  { id: "w1", name: "interaction-extractor", state: "running", processed: 1247, queue: 84, rate: "12.4/s", uptime: "03h 14m" },
  { id: "w2", name: "feedback-promoter", state: "running", processed: 92, queue: 6, rate: "0.8/s", uptime: "03h 14m" },
  { id: "w3", name: "kb-indexer", state: "paused", processed: 318, queue: 142, rate: "—", uptime: "01h 02m" },
  { id: "w4", name: "embedding-refresh", state: "stopped", processed: 0, queue: 0, rate: "—", uptime: "—" },
];

const EXTRACTORS: Extractor[] = [
  { id: "ex-1", name: "对话事实抽取", scope: "所有 bot · 24h 窗口", cadence: "5 min", progress: 64, eta: "00:02:14", processed: 847, total: 1325, status: "active" },
  { id: "ex-2", name: "客户偏好聚合", scope: "销售/客服", cadence: "30 min", progress: 32, eta: "00:08:47", processed: 124, total: 388, status: "active" },
  { id: "ex-3", name: "工艺知识提取", scope: "knowledge_bases.product", cadence: "1 h", progress: 100, eta: "—", processed: 218, total: 218, status: "idle" },
  { id: "ex-4", name: "Iron law 候选筛选", scope: "L2 → L3 promotion", cadence: "manual", progress: 18, eta: "等待人工", processed: 3, total: 17, status: "active" },
  { id: "ex-5", name: "供应商网络关系", scope: "采购对话", cadence: "1 h", progress: 0, eta: "—", processed: 0, total: 0, status: "error" },
];

interface Event {
  ts: string;
  level: "info" | "ok" | "warn" | "error";
  source: string;
  msg: string;
}

const EVENTS: Event[] = [
  { ts: "14:32:18", level: "ok", source: "interaction-extractor", msg: "batch #1342 完成 · 41 facts · promote 6 → L2" },
  { ts: "14:32:11", level: "info", source: "feedback-promoter", msg: "扫描到 3 条 ≥0.7 importance 候选" },
  { ts: "14:31:55", level: "warn", source: "kb-indexer", msg: "queue 长度超过阈值 100 · 已 pause" },
  { ts: "14:31:42", level: "ok", source: "interaction-extractor", msg: "batch #1341 完成 · 38 facts" },
  { ts: "14:31:08", level: "error", source: "supplier-network", msg: "embedding API rate-limited · retry in 60s" },
  { ts: "14:30:55", level: "info", source: "scheduler", msg: "iron-law 候选 3 条已加入审阅队列" },
  { ts: "14:30:42", level: "ok", source: "interaction-extractor", msg: "batch #1340 完成 · 47 facts · promote 2 → L2" },
  { ts: "14:30:01", level: "info", source: "embedding-refresh", msg: "停止 · 维护窗口开始" },
];

const STATE_DOT = {
  running: "bg-emerald-500",
  paused: "bg-amber-500",
  stopped: "bg-zinc-400",
} as const;

function LevelIcon({ level }: { level: Event["level"] }) {
  if (level === "ok") return <CheckCircle2 className="size-3 text-emerald-600" />;
  if (level === "error") return <XCircle className="size-3 text-rose-600" />;
  if (level === "warn") return <Activity className="size-3 text-amber-600" />;
  return <Activity className="size-3 text-sky-600" />;
}

export default function ExtractionPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <header>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>数智底座</span>
          <ChevronRight className="size-3" />
          <span className="text-foreground font-medium">提取器</span>
        </div>
        <div className="mt-2 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">提取器状态</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              5 个 worker · 5 个 extractor · 自动 pipeline,可手动触发
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
              <Pause className="size-3" />
              pause all
            </Button>
            <Button size="sm" className="h-8 text-xs gap-1">
              <Zap className="size-3" />
              手动触发抽取
            </Button>
          </div>
        </div>
      </header>

      {/* Workers row */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono">
            workers
          </h2>
          <Badge variant="outline" className="text-[10px] font-mono">
            {WORKERS.filter((w) => w.state === "running").length}/{WORKERS.length} active
          </Badge>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {WORKERS.map((w) => (
            <div
              key={w.id}
              className={cn(
                "rounded-lg border bg-card p-4 space-y-2.5 transition-colors",
                w.state === "running" && "border-emerald-500/30",
                w.state === "paused" && "border-amber-500/30",
                w.state === "stopped" && "border-border opacity-70",
              )}
            >
              <div className="flex items-center gap-2">
                <span className={cn("size-1.5 rounded-full", STATE_DOT[w.state])} />
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  {w.state}
                </span>
                <span className="ml-auto text-[10px] font-mono text-muted-foreground/70">
                  {w.uptime}
                </span>
              </div>
              <p className="text-xs font-medium font-mono truncate">{w.name}</p>
              <dl className="grid grid-cols-3 gap-x-2 gap-y-1 text-[10px] font-mono">
                <dt className="text-muted-foreground">done</dt>
                <dd className="col-span-2 text-right">{w.processed.toLocaleString()}</dd>
                <dt className="text-muted-foreground">queue</dt>
                <dd className="col-span-2 text-right">{w.queue}</dd>
                <dt className="text-muted-foreground">rate</dt>
                <dd className="col-span-2 text-right">{w.rate}</dd>
              </dl>
              <div className="flex items-center gap-1 pt-1">
                {w.state === "running" ? (
                  <Button variant="outline" size="sm" className="h-6 text-[10px] flex-1 gap-1">
                    <Pause className="size-2.5" />
                    pause
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" className="h-6 text-[10px] flex-1 gap-1">
                    <Play className="size-2.5" />
                    start
                  </Button>
                )}
                <Button variant="ghost" size="icon-sm" className="size-6">
                  <RotateCw className="size-3" />
                </Button>
                <Button variant="ghost" size="icon-sm" className="size-6">
                  <Square className="size-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Extractors + Events */}
      <section className="grid grid-cols-[1.4fr_1fr] gap-4">
        {/* Extractors */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono">
              extractors
            </h2>
            <Badge variant="outline" className="text-[10px] font-mono">
              {EXTRACTORS.length}
            </Badge>
          </div>
          <div className="rounded-lg border border-border bg-card divide-y divide-border/60">
            {EXTRACTORS.map((e) => (
              <div key={e.id} className="p-4 space-y-2.5">
                <div className="flex items-center gap-2">
                  {e.status === "active" ? (
                    <Loader2 className="size-3.5 text-sky-600 animate-spin" />
                  ) : e.status === "error" ? (
                    <XCircle className="size-3.5 text-rose-600" />
                  ) : (
                    <CheckCircle2 className="size-3.5 text-muted-foreground" />
                  )}
                  <span className="text-xs font-medium">{e.name}</span>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] font-mono uppercase tracking-wider",
                      e.status === "active" && "border-sky-500/40 text-sky-700 dark:text-sky-300",
                      e.status === "error" && "border-rose-500/40 text-rose-700 dark:text-rose-300",
                    )}
                  >
                    {e.status}
                  </Badge>
                  <span className="ml-auto text-[10px] font-mono text-muted-foreground">
                    {e.cadence}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground font-mono">{e.scope}</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn(
                        "h-full transition-all",
                        e.status === "error" ? "bg-rose-500" : "bg-sky-500",
                      )}
                      style={{ width: `${e.progress}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground shrink-0 w-9 text-right">
                    {e.progress}%
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[10px] font-mono text-muted-foreground">
                  <span>
                    {e.processed.toLocaleString()} / {e.total.toLocaleString()}
                  </span>
                  <span className="ml-auto">eta {e.eta}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Events stream */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono">
              event stream
            </h2>
            <Badge variant="outline" className="text-[10px] font-mono">
              live · 5s poll
            </Badge>
          </div>
          <div className="rounded-lg border border-border bg-card overflow-hidden flex flex-col h-[420px]">
            <div className="px-4 py-2 border-b border-border bg-muted/30 flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono">
              <Activity className="size-3" />
              tail -f
            </div>
            <ScrollArea className="flex-1">
              <ul className="divide-y divide-border/40 font-mono">
                {EVENTS.map((ev, i) => (
                  <li key={i} className="px-4 py-2 flex items-start gap-2 text-[11px]">
                    <span className="text-muted-foreground/70 shrink-0">{ev.ts}</span>
                    <LevelIcon level={ev.level} />
                    <span className="text-foreground/80 shrink-0">{ev.source}</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-foreground/90 flex-1">{ev.msg}</span>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </div>
        </div>
      </section>

      <Separator />

      {/* Pipeline diagram */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono">
            pipeline
          </h2>
          <span className="text-[10px] text-muted-foreground/70">interaction → facts → memory</span>
        </div>
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center gap-2">
            {[
              { label: "interaction", sub: "5 bots · 1.2k/24h", icon: Activity, tone: "text-muted-foreground" },
              { label: "extract", sub: "interaction-extractor", icon: Zap, tone: "text-sky-600" },
              { label: "score", sub: "importance + novelty", icon: Brain, tone: "text-violet-600" },
              { label: "L1", sub: "短期上下文", icon: ListTree, tone: "text-amber-600" },
              { label: "promote", sub: "auto + manual", icon: ChevronRight, tone: "text-muted-foreground" },
              { label: "L2", sub: "长期事实", icon: Library, tone: "text-sky-600" },
              { label: "audit", sub: "双人复核", icon: Layers, tone: "text-emerald-600" },
              { label: "L3", sub: "永久原则", icon: Library, tone: "text-emerald-700" },
            ].map((s, i, arr) => {
              const Icon = s.icon;
              return (
                <React.Fragment key={s.label}>
                  <div className="flex flex-col items-center justify-center rounded-md border border-border bg-background px-3 py-2 min-w-[100px]">
                    <Icon className={cn("size-3.5", s.tone)} />
                    <span className="mt-1 text-[10px] uppercase tracking-wider font-mono">
                      {s.label}
                    </span>
                    <span className="text-[9px] text-muted-foreground mt-0.5 font-mono text-center">
                      {s.sub}
                    </span>
                  </div>
                  {i < arr.length - 1 && (
                    <ChevronRight className="size-4 text-muted-foreground/40 shrink-0" />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}