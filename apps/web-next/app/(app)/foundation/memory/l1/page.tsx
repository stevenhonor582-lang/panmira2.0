"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Bot, MessageSquare, Search, RefreshCcw, Pin, Filter, Clock, Zap } from "lucide-react";

interface L1Item {
  id: string;
  bot: string;
  preview: string;
  turns: number;
  ttl: string;
  pinned: boolean;
  source: "channel" | "task" | "dm";
}

const SEED: L1Item[] = [
  { id: "m1", bot: "销售助手", preview: "跟进 ACME 的 RFQ 进度,客户要求周三前回方案", turns: 14, ttl: "12h 41m", pinned: true, source: "task" },
  { id: "m2", bot: "采购助手", preview: "M5 螺栓询价 3 家供应商对比,等待回盘", turns: 7, ttl: "08h 12m", pinned: false, source: "channel" },
  { id: "m3", bot: "调度员", preview: "今日 14:00 排程冲突:物流组与生产组同时段占用", turns: 3, ttl: "21h 02m", pinned: false, source: "dm" },
  { id: "m4", bot: "客服台", preview: "客户 ID 4421 反馈型号 X 缺货替代方案咨询", turns: 9, ttl: "02h 17m", pinned: false, source: "channel" },
  { id: "m5", bot: "财务", preview: "6 月发票清单核对,等待最终一批回单", turns: 22, ttl: "06h 48m", pinned: false, source: "task" },
  { id: "m6", bot: "法务", preview: "供应商 NDA 模板 v3 修订讨论, 5 处条款待确认", turns: 11, ttl: "18h 23m", pinned: true, source: "dm" },
];

const SOURCE_LABEL = { channel: "频道", task: "任务", dm: "私聊" } as const;

export default function L1Page() {
  const [selected, setSelected] = React.useState<string>(SEED[0].id);
  const [query, setQuery] = React.useState("");
  const active = SEED.find((i) => i.id === selected) ?? SEED[0];

  return (
    <div className="flex h-full flex-col">
      {/* Page-level filter bar */}
      <div className="px-6 py-3 border-b border-border bg-muted/30 flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-2 size-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索 L1 短期上下文..."
            className="pl-7 h-7 text-xs"
          />
        </div>
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
          <Filter className="size-3" />
          来源
        </Button>
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
          <RefreshCcw className="size-3" />
          60s
        </Button>
        <div className="ml-auto flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono">
          <Zap className="size-3" />
          {SEED.length} active · auto decay
        </div>
      </div>

      {/* List + detail (mini finder) */}
      <div className="flex-1 grid grid-cols-[1fr_1.4fr] min-h-0 divide-x divide-border">
        {/* List */}
        <ScrollArea className="h-full">
          <ul className="divide-y divide-border/60">
            {SEED.map((item) => {
              const isActive = item.id === selected;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(item.id)}
                    className={cn(
                      "w-full text-left px-5 py-3 transition-colors",
                      isActive ? "bg-muted" : "hover:bg-muted/40",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Bot className="size-3 text-muted-foreground" />
                      <span className="text-xs font-medium">{item.bot}</span>
                      <Badge
                        variant="outline"
                        className="ml-auto text-[10px] font-mono uppercase tracking-wider"
                      >
                        {SOURCE_LABEL[item.source]}
                      </Badge>
                    </div>
                    <p
                      className={cn(
                        "mt-1.5 text-xs leading-relaxed line-clamp-2",
                        isActive ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {item.preview}
                    </p>
                    <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground/80 font-mono">
                      <span className="flex items-center gap-1">
                        <MessageSquare className="size-2.5" />
                        {item.turns} turns
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="size-2.5" />
                        TTL {item.ttl}
                      </span>
                      {item.pinned && (
                        <Pin className="size-2.5 ml-auto text-amber-500 fill-amber-500/30" />
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </ScrollArea>

        {/* Detail */}
        <ScrollArea className="h-full">
          <div className="p-6 space-y-5">
            <div>
              <div className="flex items-center gap-2">
                <Bot className="size-4" />
                <h2 className="text-sm font-semibold">{active.bot}</h2>
                <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-mono">
                  {SOURCE_LABEL[active.source]}
                </Badge>
                <Badge variant="secondary" className="text-[10px] font-mono">
                  {active.turns} turns
                </Badge>
                <span className="ml-auto text-[10px] text-muted-foreground font-mono">
                  TTL {active.ttl}
                </span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground leading-relaxed">{active.preview}</p>
            </div>

            <Separator />

            <section>
              <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono">
                conversation excerpt
              </h3>
              <div className="mt-2 rounded-md border border-border bg-muted/20 divide-y divide-border/60">
                {[
                  { role: "user", text: "ACME 的 RFQ 进度如何,客户要周三回方案。" },
                  { role: "assistant", text: "已发送询价邮件给 3 家供应商,目前 1 家回盘,价格偏高 8%。" },
                  { role: "user", text: "另外两家什么时候能回?" },
                  { role: "assistant", text: "供应商 B 预计周二上午,供应商 C 周三下午。需要我催 B 吗?" },
                ].map((m, i) => (
                  <div key={i} className="px-3 py-2 flex gap-2 text-[11px] leading-relaxed">
                    <span
                      className={cn(
                        "shrink-0 font-mono text-[9px] uppercase mt-0.5 tracking-wider",
                        m.role === "user" ? "text-sky-600" : "text-emerald-600",
                      )}
                    >
                      {m.role}
                    </span>
                    <span className="text-foreground/90">{m.text}</span>
                  </div>
                ))}
              </div>
            </section>

            <Separator />

            <section>
              <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono">
                memory meta
              </h3>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
                <dt className="text-muted-foreground">memory id</dt>
                <dd className="font-mono">{active.id}</dd>
                <dt className="text-muted-foreground">layer</dt>
                <dd className="font-mono uppercase">l1</dd>
                <dt className="text-muted-foreground">created</dt>
                <dd className="font-mono">just now</dd>
                <dt className="text-muted-foreground">tokens</dt>
                <dd className="font-mono">~{active.turns * 120}</dd>
                <dt className="text-muted-foreground">policy</dt>
                <dd className="font-mono">rolling-window-24h</dd>
              </dl>
            </section>

            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                <Pin className="size-3" />
                pin
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                promote to L2
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 ml-auto text-destructive">
                discard
              </Button>
            </div>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}