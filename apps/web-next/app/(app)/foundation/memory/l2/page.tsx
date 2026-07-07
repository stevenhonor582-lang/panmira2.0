"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Search, Tag, Hash, Sparkle, Edit3, Trash2, Plus } from "lucide-react";

interface L2Fact {
  id: string;
  subject: string;
  statement: string;
  tags: string[];
  importance: number;
  hit_count: number;
  last_hit: string;
  source: string;
}

const SEED: L2Fact[] = [
  {
    id: "f1",
    subject: "客户偏好",
    statement: "ACME 工业品采购对交期敏感 > 价格, 通常提前 5 天下单。",
    tags: ["客户", "采购偏好"],
    importance: 0.82,
    hit_count: 47,
    last_hit: "2h ago",
    source: "promoted from L1 (12 occurrences)",
  },
  {
    id: "f2",
    subject: "供应商网络",
    statement: "M5/M6 螺栓首选供应商 B (苏杭机电), 平均回盘 18h。",
    tags: ["供应商", "采购"],
    importance: 0.74,
    hit_count: 32,
    last_hit: "yesterday",
    source: "manual",
  },
  {
    id: "f3",
    subject: "合规",
    statement: "出口东南亚订单必须附 CE 声明 + 发票三连。",
    tags: ["合规", "出口"],
    importance: 0.91,
    hit_count: 88,
    last_hit: "1h ago",
    source: "promoted from L1 (24 occurrences)",
  },
  {
    id: "f4",
    subject: "工艺知识",
    statement: "6061-T6 铝板折弯半径下限 = 1.5 × 板厚, 否则开裂。",
    tags: ["工艺", "材料"],
    importance: 0.86,
    hit_count: 23,
    last_hit: "3d ago",
    source: "knowledge-base",
  },
  {
    id: "f5",
    subject: "客户偏好",
    statement: "BETA 制造要求所有报价单 PDF 附原厂出厂单扫描件。",
    tags: ["客户"],
    importance: 0.61,
    hit_count: 11,
    last_hit: "1w ago",
    source: "promoted from L1",
  },
];

const ALL_TAGS = Array.from(new Set(SEED.flatMap((f) => f.tags)));

export default function L2Page() {
  const [selected, setSelected] = React.useState<string>(SEED[0].id);
  const [tag, setTag] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");

  const filtered = SEED.filter((f) => {
    if (tag && !f.tags.includes(tag)) return false;
    if (query && !f.statement.includes(query) && !f.subject.includes(query)) return false;
    return true;
  });
  const active = SEED.find((f) => f.id === selected) ?? SEED[0];

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 py-3 border-b border-border bg-muted/30 space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2.5 top-2 size-3.5 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索事实 · 经验 · 常用知识"
              className="pl-7 h-7 text-xs"
            />
          </div>
          <Button size="sm" variant="default" className="h-7 text-xs gap-1">
            <Plus className="size-3" />
            new fact
          </Button>
          <div className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono">
            {filtered.length}/{SEED.length} facts
          </div>
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          <button
            type="button"
            onClick={() => setTag(null)}
            className={cn(
              "px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider rounded transition-colors",
              tag === null ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
            )}
          >
            all
          </button>
          {ALL_TAGS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTag(t === tag ? null : t)}
              className={cn(
                "px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider rounded transition-colors border",
                tag === t
                  ? "bg-foreground text-background border-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 grid grid-cols-[1fr_1.4fr] min-h-0 divide-x divide-border">
        <ScrollArea className="h-full">
          <ul className="divide-y divide-border/60">
            {filtered.map((f) => {
              const isActive = f.id === selected;
              return (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(f.id)}
                    className={cn(
                      "w-full text-left px-5 py-3 transition-colors",
                      isActive ? "bg-muted" : "hover:bg-muted/40",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Sparkle className="size-3 text-sky-500" />
                      <span className="text-xs font-medium">{f.subject}</span>
                      <span className="ml-auto text-[10px] font-mono text-muted-foreground/70">
                        imp {f.importance.toFixed(2)}
                      </span>
                    </div>
                    <p
                      className={cn(
                        "mt-1.5 text-xs leading-relaxed line-clamp-2",
                        isActive ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {f.statement}
                    </p>
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      {f.tags.map((t) => (
                        <span
                          key={t}
                          className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/80 border border-border/60 rounded px-1.5 py-0.5"
                        >
                          {t}
                        </span>
                      ))}
                      <span className="ml-auto text-[10px] text-muted-foreground/70 font-mono">
                        hits {f.hit_count} · {f.last_hit}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </ScrollArea>

        <ScrollArea className="h-full">
          <div className="p-6 space-y-5">
            <div>
              <div className="flex items-center gap-2">
                <Sparkle className="size-4 text-sky-500" />
                <h2 className="text-sm font-semibold">{active.subject}</h2>
                <Badge variant="secondary" className="text-[10px] font-mono">
                  L2 fact
                </Badge>
              </div>
              <p className="mt-3 text-sm leading-relaxed">{active.statement}</p>
            </div>

            <Separator />

            <section>
              <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono">
                tags
              </h3>
              <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                {active.tags.map((t) => (
                  <Badge key={t} variant="outline" className="text-[10px] font-mono uppercase tracking-wider">
                    <Tag className="size-2.5 mr-1" />
                    {t}
                  </Badge>
                ))}
              </div>
            </section>

            <Separator />

            <section>
              <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono">
                provenance
              </h3>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
                <dt className="text-muted-foreground">fact id</dt>
                <dd className="font-mono">{active.id}</dd>
                <dt className="text-muted-foreground">layer</dt>
                <dd className="font-mono uppercase">l2</dd>
                <dt className="text-muted-foreground">source</dt>
                <dd className="text-[10px] text-muted-foreground">{active.source}</dd>
                <dt className="text-muted-foreground">importance</dt>
                <dd>
                  <div className="flex items-center gap-2">
                    <div className="h-1 flex-1 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-sky-500"
                        style={{ width: `${active.importance * 100}%` }}
                      />
                    </div>
                    <span className="font-mono">{active.importance.toFixed(2)}</span>
                  </div>
                </dd>
                <dt className="text-muted-foreground">hit count</dt>
                <dd className="font-mono">{active.hit_count}</dd>
                <dt className="text-muted-foreground">last hit</dt>
                <dd className="font-mono">{active.last_hit}</dd>
              </dl>
            </section>

            <Separator />

            <section>
              <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono">
                linked records
              </h3>
              <div className="mt-2 space-y-1">
                {[
                  { kind: "knowledge-base", label: "工艺 · 6061-T6 折弯", count: 12 },
                  { kind: "bot", label: "采购助手", count: 8 },
                  { kind: "task", label: "ACME RFQ", count: 3 },
                ].map((r) => (
                  <div
                    key={r.label}
                    className="flex items-center justify-between rounded-md border border-border bg-muted/20 px-3 py-1.5 text-[11px]"
                  >
                    <span className="flex items-center gap-2">
                      <Hash className="size-2.5 text-muted-foreground" />
                      <span className="text-foreground/90">{r.label}</span>
                      <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
                        {r.kind}
                      </span>
                    </span>
                    <span className="font-mono text-muted-foreground">{r.count} refs</span>
                  </div>
                ))}
              </div>
            </section>

            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                <Edit3 className="size-3" />
                edit
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                promote to L3
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 ml-auto text-destructive">
                <Trash2 className="size-3" />
                delete
              </Button>
            </div>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}