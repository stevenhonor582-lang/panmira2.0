"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  ShieldCheck, GitCommit, History, AlertTriangle, Lock,
  Search, AlertCircle, Loader2, RefreshCcw,
} from "lucide-react";
import { api } from "@/lib/api";

interface IronLaw {
  id: string;
  subject: string | null;
  content: string | null;
  preview: string | null;
  importance: number | null;
  hitCount: number;
  type: string | null;
  polarity: string | null;
  tags: string[];
  botId: string | null;
  tenantId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
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

export default function L3Page() {
  const [laws, setLaws] = React.useState<IronLaw[]>([]);
  const [total, setTotal] = React.useState(0);
  const [query, setQuery] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    setLoading(true);
    setError(null);
    const qs = query.trim() ? `?q=${encodeURIComponent(query.trim())}&limit=200` : "?limit=200";
    api<{ memories: IronLaw[]; total: number }>(`/api/v2/foundation/memory/l3${qs}`)
      .then((d) => {
        setLaws(d.memories ?? []);
        setTotal(d.total ?? 0);
      })
      .catch((e: any) => setError(String(e?.message ?? e)))
      .finally(() => setLoading(false));
  }, [query]);

  React.useEffect(() => {
    const t = setTimeout(load, query.trim() ? 300 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 py-3 border-b border-border bg-muted/30 flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-2 size-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索 L3 永久原则…"
            className="pl-7 h-7 text-xs"
          />
        </div>
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={load}>
          <RefreshCcw className="size-3" />
          刷新
        </Button>
        <div className="ml-auto flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono">
          <Lock className="size-3" />
          {loading ? "loading…" : `${total} iron laws · showing ${laws.length}`}
        </div>
      </div>

      <ScrollArea className="flex-1">
        {error && (
          <div className="m-4 rounded-md border border-rose-500/30 bg-rose-500/5 p-3 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
            <AlertCircle className="size-3.5 mt-0.5 shrink-0" />
            <div>{error}</div>
          </div>
        )}
        {!error && laws.length === 0 && !loading && (
          <div className="m-4 rounded-md border border-dashed border-border p-6 text-xs text-muted-foreground text-center">
            L3 永久记忆为空。
          </div>
        )}
        <div className="p-6 space-y-4">
          {laws.map((law) => (
            <div key={law.id} className="rounded-md border border-border bg-background overflow-hidden">
              <div className="px-4 py-3 border-b border-border/60 bg-muted/30 flex items-center gap-2 flex-wrap">
                <ShieldCheck className="size-3.5 text-emerald-500" />
                <span className="text-xs font-medium truncate max-w-[40ch]">
                  {law.subject || "(untitled)"}
                </span>
                {law.type && (
                  <Badge variant="outline" className="text-[10px] font-mono uppercase tracking-wider">
                    {law.type}
                  </Badge>
                )}
                {law.polarity === "negate" && (
                  <Badge variant="destructive" className="text-[10px] font-mono uppercase tracking-wider">
                    negate
                  </Badge>
                )}
                <span className="ml-auto text-[10px] text-muted-foreground/80 font-mono flex items-center gap-1">
                  <History className="size-2.5" />
                  {fmtRel(law.createdAt)}
                </span>
              </div>
              <div className="px-4 py-3">
                <p className="text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap">
                  {law.content || "(empty)"}
                </p>
                {law.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {law.tags.map((t) => (
                      <span key={t} className="text-[10px] font-mono uppercase tracking-wide bg-muted text-muted-foreground px-1.5 py-0.5 rounded-sm">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
                <Separator className="my-3" />
                <dl className="grid grid-cols-3 gap-x-4 gap-y-1.5 text-[10px] font-mono">
                  <dt className="text-muted-foreground">id</dt>
                  <dd className="col-span-2 truncate text-foreground/80">{law.id}</dd>
                  <dt className="text-muted-foreground">hits</dt>
                  <dd className="col-span-2 text-foreground/80">{law.hitCount}</dd>
                  {law.importance !== null && (
                    <>
                      <dt className="text-muted-foreground">importance</dt>
                      <dd className="col-span-2 text-foreground/80">{law.importance.toFixed(2)}</dd>
                    </>
                  )}
                  <dt className="text-muted-foreground">bot</dt>
                  <dd className="col-span-2 truncate text-foreground/80">{law.botId ?? "—"}</dd>
                </dl>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
