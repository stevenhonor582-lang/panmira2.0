"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Bot, MessageSquare, Search, RefreshCcw, Pin, Filter, Clock, Zap, Loader2, AlertCircle,
} from "lucide-react";
import { api } from "@/lib/api";
import { mf } from "@/lib/foundation/api";
import { MemoryDetailSheet } from "@/lib/foundation/memory-detail-sheet";
import { MemoryAddDialog } from "@/lib/foundation/memory-add-dialog";
import { Plus } from "lucide-react";

interface MemoryItem {
  id: string;
  layer: number;
  subject: string | null;
  content: string | null;
  preview: string | null;
  importance: number | null;
  botId: string | null;
  tenantId: string | null;
  hitCount: number;
  type: string | null;
  polarity: string | null;
  tags: string[];
  createdAt: string | null;
  updatedAt: string | null;
}

function SourceLabel({ tenantId, type }: { tenantId: string | null; type: string | null }) {
  // memories.tenant_id 用 legacy 格式 — 推断来源
  let source: "channel" | "task" | "dm" | "backfill" = "dm";
  if (tenantId?.startsWith("group:")) source = "channel";
  else if (tenantId?.startsWith("batch:")) source = "backfill";
  else if (tenantId?.startsWith("tenant:")) source = "task";
  const label = source === "channel" ? "频道"
    : source === "backfill" ? "回填"
    : source === "task" ? "租户" : "用户";
  return (
    <Badge variant="outline" className="ml-auto text-[10px] font-mono uppercase tracking-wider">
      {label}{type ? ` · ${type}` : ""}
    </Badge>
  );
}

function fmtRel(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";
  const diff = Date.now() - then;
  const min = Math.floor(diff / 60000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

export default function L1Page() {
  const [items, setItems] = React.useState<MemoryItem[]>([]);
  const [total, setTotal] = React.useState(0);
  const [selected, setSelected] = React.useState<string>("");
  const [query, setQuery] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [minImportance, setMinImportance] = React.useState<number>(0);
  const [detailId, setDetailId] = React.useState<string | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);
  const [addOpen, setAddOpen] = React.useState(false);

  const load = React.useCallback(() => {
    setLoading(true);
    setError(null);
    const qs = query.trim() ? `?q=${encodeURIComponent(query.trim())}&limit=100` : "?limit=100";
    api<{ memories: MemoryItem[]; total: number; hasMore: boolean }>(`/api/v2/foundation/memory/l1${qs}`)
      .then((d) => {
        setItems(d.memories ?? []);
        setTotal(d.total ?? 0);
        if ((d.memories?.[0]?.id) && !selected) setSelected(d.memories[0].id);
      })
      .catch((e: any) => setError(String(e?.message ?? e)))
      .finally(() => setLoading(false));
  }, [query, minImportance]);

  React.useEffect(() => {
    const t = setTimeout(load, query.trim() ? 300 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const active = items.find((i) => i.id === selected) ?? items[0];

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 py-3 border-b border-border bg-muted/30 flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-2 size-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索 L1 短期上下文 content / subject…"
            className="pl-7 h-7 text-xs"
          />
        </div>
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={load}>
          <RefreshCcw className="size-3" />
          刷新
        </Button>
        <select
          value={minImportance}
          onChange={(e) => setMinImportance(parseFloat(e.target.value))}
          className="h-7 rounded border border-border bg-background px-1.5 text-[11px] font-mono"
          title="最小重要度过滤"
        >
          <option value={0}>imp ≥ 0</option>
          <option value={0.5}>imp ≥ 0.5</option>
          <option value={0.7}>imp ≥ 0.7</option>
          <option value={0.8}>imp ≥ 0.8</option>
        </select>
        <Button size="sm" className="h-7 text-xs gap-1" onClick={() => setAddOpen(true)}>
          <Plus className="size-3" />
          新增
        </Button>
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
          <Filter className="size-3" />
          来源
        </Button>
        <div className="ml-auto flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono">
          <Zap className="size-3" />
          {loading ? "loading…" : `${total} total · showing ${items.length}`}
        </div>
      </div>

      <div className="flex-1 grid grid-cols-[1fr_1.4fr] min-h-0 divide-x divide-border">
        <ScrollArea className="h-full">
          {error && (
            <div className="m-4 rounded-md border border-rose-500/30 bg-rose-500/5 p-3 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
              <AlertCircle className="size-3.5 mt-0.5 shrink-0" />
              <div>{error}</div>
            </div>
          )}
          {!error && items.length === 0 && !loading && (
            <div className="m-4 rounded-md border border-dashed border-border p-6 text-xs text-muted-foreground text-center">
              L1 短期记忆为空。memory pipeline 未活跃时正常 (最新一条可能超过 24h)。
            </div>
          )}
          <ul className="divide-y divide-border/60">
            {items.map((item) => {
              const isActive = item.id === active?.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => { setSelected(item.id); setDetailId(item.id); setDetailOpen(true); }}
                    className={cn(
                      "w-full text-left px-5 py-3 transition-colors",
                      isActive ? "bg-muted" : "hover:bg-muted/40",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Bot className="size-3 text-muted-foreground shrink-0" />
                      <span className="text-xs font-medium truncate max-w-[16ch]">
                        {item.subject || item.botId?.slice(0, 8) || "—"}
                      </span>
                      <SourceLabel tenantId={item.tenantId} type={item.type} />
                    </div>
                    <p className={cn(
                      "mt-1.5 text-xs leading-relaxed line-clamp-2",
                      isActive ? "text-foreground" : "text-muted-foreground",
                    )}>
                      {item.preview || "(empty)"}
                    </p>
                    <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground/80 font-mono">
                      <span className="flex items-center gap-1">
                        <MessageSquare className="size-2.5" />
                        hits {item.hitCount}
                      </span>
                      {item.importance !== null && (
                        <span>imp {item.importance.toFixed(2)}</span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock className="size-2.5" />
                        {fmtRel(item.createdAt)}
                      </span>
                      {item.polarity === "negate" && (
                        <Pin className="size-2.5 ml-auto text-amber-500 fill-amber-500/30" />
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </ScrollArea>

        <ScrollArea className="h-full">
          {active ? (
            <div className="p-6 space-y-5">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Bot className="size-4" />
                  <h2 className="text-sm font-semibold">
                    {active.subject || "(no subject)"}
                  </h2>
                  <SourceLabel tenantId={active.tenantId} type={active.type} />
                  {active.importance !== null && (
                    <Badge variant="secondary" className="text-[10px] font-mono">
                      imp {active.importance.toFixed(2)}
                    </Badge>
                  )}
                  <span className="ml-auto text-[10px] text-muted-foreground font-mono">
                    {fmtRel(active.createdAt)}
                  </span>
                </div>
                <p className="mt-2 text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap">
                  {active.content || "(empty content)"}
                </p>
              </div>

              {active.tags.length > 0 && (
                <>
                  <Separator />
                  <section>
                    <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono">
                      tags
                    </h3>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {active.tags.map((t) => (
                        <span key={t} className="text-[10px] font-mono uppercase tracking-wide bg-muted text-muted-foreground px-1.5 py-0.5 rounded-sm">
                          {t}
                        </span>
                      ))}
                    </div>
                  </section>
                </>
              )}

              <Separator />

              <section>
                <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono">
                  memory meta
                </h3>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
                  <dt className="text-muted-foreground">memory id</dt>
                  <dd className="font-mono truncate">{active.id}</dd>
                  <dt className="text-muted-foreground">layer</dt>
                  <dd className="font-mono uppercase">l1</dd>
                  <dt className="text-muted-foreground">type</dt>
                  <dd className="font-mono">{active.type ?? "—"}</dd>
                  <dt className="text-muted-foreground">polarity</dt>
                  <dd className="font-mono">{active.polarity ?? "—"}</dd>
                  <dt className="text-muted-foreground">hit count</dt>
                  <dd className="font-mono">{active.hitCount}</dd>
                  <dt className="text-muted-foreground">bot id</dt>
                  <dd className="font-mono truncate">{active.botId ?? "—"}</dd>
                  <dt className="text-muted-foreground">tenant</dt>
                  <dd className="font-mono truncate">{active.tenantId ?? "—"}</dd>
                  <dt className="text-muted-foreground">created</dt>
                  <dd className="font-mono">{fmtRel(active.createdAt)}</dd>
                  <dt className="text-muted-foreground">updated</dt>
                  <dd className="font-mono">{fmtRel(active.updatedAt)}</dd>
                </dl>
              </section>
            </div>
          ) : (
            <div className="p-6 grid place-items-center h-full text-xs text-muted-foreground">
              {loading ? <Loader2 className="size-4 animate-spin" /> : "select a memory"}
            </div>
          )}
        </ScrollArea>
      </div>
          <MemoryDetailSheet
        open={detailOpen}
        onOpenChange={setDetailOpen}
        memoryId={detailId}
        layer={1 as 1 | 2 | 3}
        onChanged={load}
      />
      <MemoryAddDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        defaultLayer={1 as 1 | 2 | 3}
        onCreated={load}
      />
    </div>
  );
}
