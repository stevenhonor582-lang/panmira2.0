"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Brain, Clock, Library, ShieldCheck, ChevronRight, Timer } from "lucide-react";

interface LayerMeta {
  layer: "l1" | "l2" | "l3";
  href: string;
  title: string;
  blurb: string;
  capacity: string;
  retention: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
}

const LAYERS: LayerMeta[] = [
  {
    layer: "l1",
    href: "/foundation/memory/l1",
    title: "L1 短期记忆",
    blurb: "24h 内所有 bot 交互上下文,自动衰减",
    capacity: "rolling window",
    retention: "24h → L2",
    icon: Clock,
    accent: "text-amber-600 dark:text-amber-400",
  },
  {
    layer: "l2",
    href: "/foundation/memory/l2",
    title: "L2 长期记忆",
    blurb: "事实 · 经验 · 常用知识,人工可编辑",
    capacity: "tenant scoped",
    retention: "人工审阅",
    icon: Library,
    accent: "text-sky-600 dark:text-sky-400",
  },
  {
    layer: "l3",
    href: "/foundation/memory/l3",
    title: "L3 永久记忆",
    blurb: "Iron laws · 核心原则 · 5 个 bot 共享",
    capacity: "immutable",
    retention: "永不衰减",
    icon: ShieldCheck,
    accent: "text-emerald-600 dark:text-emerald-400",
  },
];

function LayerTreeItem({ meta, active }: { meta: LayerMeta; active: boolean }) {
  const Icon = meta.icon;
  return (
    <Link
      href={meta.href}
      className={cn(
        "group block px-3 py-2.5 rounded-md transition-colors",
        active ? "bg-muted" : "hover:bg-muted/60",
      )}
    >
      <div className="flex items-center gap-2">
        <Icon className={cn("size-3.5 shrink-0", meta.accent)} />
        <span className="text-sm font-medium tracking-tight">{meta.title}</span>
        <ChevronRight
          className={cn(
            "size-3 ml-auto text-muted-foreground/40 transition-transform",
            active && "translate-x-0.5 text-foreground/60",
          )}
        />
      </div>
      <p className="mt-1 ml-5 text-[11px] leading-relaxed text-muted-foreground">
        {meta.blurb}
      </p>
      <div className="mt-2 ml-5 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono">
        <Timer className="size-2.5" />
        {meta.retention}
      </div>
    </Link>
  );
}

export default function MemoryLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const activeLayer = LAYERS.find((l) => pathname.endsWith(`/memory/${l.layer}`))?.layer ?? "l1";

  return (
    <div className="-m-6 flex h-[calc(100vh-3rem)] flex-col">
      <header className="px-6 pt-5 pb-4 border-b border-border bg-background">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>数智底座</span>
          <ChevronRight className="size-3" />
          <span>记忆分层</span>
          <ChevronRight className="size-3" />
          <span className="text-foreground font-medium uppercase tracking-wider">
            {activeLayer}
          </span>
        </div>
        <div className="mt-2 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">记忆层级</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              短期上下文 · 长期事实 · 永久原则 — 三层互不污染,分层衰减
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {LAYERS.map((l) => (
              <Badge
                key={l.layer}
                variant={l.layer === activeLayer ? "default" : "outline"}
                className="font-mono text-[10px] uppercase"
              >
                {l.layer}
              </Badge>
            ))}
          </div>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-[260px_1fr_320px] min-h-0 divide-x divide-border">
        <aside className="flex flex-col min-h-0 bg-muted/20">
          <div className="px-4 pt-4 pb-2">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono">
              <Brain className="size-3" />
              layers
            </div>
          </div>
          <Separator />
          <ScrollArea className="flex-1">
            <nav className="p-2 space-y-0.5">
              {LAYERS.map((meta) => (
                <LayerTreeItem
                  key={meta.layer}
                  meta={meta}
                  active={meta.layer === activeLayer}
                />
              ))}
            </nav>
            <Separator className="my-3" />
            <div className="px-4 py-3 space-y-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono">
                pipeline
              </div>
              <div className="rounded-md border border-dashed border-border/60 p-2.5 space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">L1 → L2</span>
                  <span className="font-mono">auto</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">L2 → L3</span>
                  <span className="font-mono">manual</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">L3 → </span>
                  <span className="font-mono">never</span>
                </div>
              </div>
            </div>
          </ScrollArea>
        </aside>

        <section className="min-h-0 overflow-y-auto bg-background">
          {children}
        </section>

        <aside className="flex flex-col min-h-0 bg-muted/20">
          <div className="px-4 pt-4 pb-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono">
              contract
            </div>
          </div>
          <Separator />
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-4">
              <section>
                <h3 className="text-xs font-medium tracking-tight">写入规则</h3>
                <ul className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-muted-foreground">
                  <li className="flex gap-1.5">
                    <span className="text-amber-500">L1</span>
                    <span>每个 bot 24h 滚动窗口,容量上限 4096 token</span>
                  </li>
                  <li className="flex gap-1.5">
                    <span className="text-sky-500">L2</span>
                    <span>仅在多次出现或显式 promote 时固化</span>
                  </li>
                  <li className="flex gap-1.5">
                    <span className="text-emerald-500">L3</span>
                    <span>需要 admin 角色写入,变更进 audit log</span>
                  </li>
                </ul>
              </section>
              <Separator />
              <section>
                <h3 className="text-xs font-medium tracking-tight">查询路径</h3>
                <div className="mt-2 rounded-md border border-border bg-background p-2.5 font-mono text-[10px] leading-relaxed">
                  <div className="text-muted-foreground"># 检索时</div>
                  <div>retrieve(L1 ∪ L2 ∪ L3)</div>
                  <div className="text-muted-foreground mt-1"># 合成 prompt 时</div>
                  <div>synthesize(query, layers=[1,2,3])</div>
                </div>
              </section>
              <Separator />
              <section>
                <h3 className="text-xs font-medium tracking-tight">监控</h3>
                <dl className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                  <dt className="text-muted-foreground">24h 写入</dt>
                  <dd className="font-mono text-right">—</dd>
                  <dt className="text-muted-foreground">promote L1→L2</dt>
                  <dd className="font-mono text-right">—</dd>
                  <dt className="text-muted-foreground">L3 修订</dt>
                  <dd className="font-mono text-right">—</dd>
                </dl>
              </section>
            </div>
          </ScrollArea>
        </aside>
      </div>
    </div>
  );
}