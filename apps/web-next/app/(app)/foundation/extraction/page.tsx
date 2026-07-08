"use client";

/**
 * R13-C · 数智底座 / 抽取 (2026-07-08)
 * 真数据: GET /api/v2/foundation/extraction/status (派生)
 *         GET /api/v2/foundation/memory/l1?limit=50 (最近事件流)
 */
import * as React from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Activity, Zap, Layers, Brain, Library, RefreshCcw,
  CheckCircle2, XCircle, AlertTriangle, Play, Loader2, BarChart3,
} from "lucide-react";
import { api } from "@/lib/api";
import { fmtRel, type MemoryItem } from "@/lib/foundation/api";

interface Totals { total: number; l1: number; l2: number; l3: number; last_24h: number; last_7d: number; }
interface DailyRow { day: string; n: number; l1: number; l2: number; l3: number; }

interface StatusResponse {
  success: boolean;
  workers: { extraction_worker: string; memory_pipeline: string };
  totals: Totals;
  daily: DailyRow[];
  extractedMemories: number;
  note: string | null;
}

const LAYER_COLOR: Record<number, string> = {
  1: "fill-sky-500",
  2: "fill-emerald-500",
  3: "fill-amber-500",
};

export default function ExtractionPage() {
  const [status, setStatus] = React.useState<StatusResponse | null>(null);
  const [events, setEvents] = React.useState<MemoryItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [s, e] = await Promise.all([
        api<StatusResponse>("/api/v2/foundation/extraction/status"),
        api<{ memories: MemoryItem[] }>("/api/v2/foundation/memory/l1?limit=50"),
      ]);
      setStatus(s);
      setEvents(e.memories ?? []);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const totals = status?.totals;
  const daily = status?.daily ?? [];
  const maxN = Math.max(1, ...daily.map((d) => d.n));

  return (
    <div className="-m-6 flex h-[calc(100vh-3rem)] flex-col">
      <header className="px-6 pt-5 pb-3 border-b border-border bg-background">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>数智底座</span>
          <span>/</span>
          <span className="text-foreground font-medium">抽取</span>
          <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70">
            R13-C · 真数据派生
          </span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={load}>
            <RefreshCcw className="size-3" />刷新
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs gap-1 opacity-60"
            disabled
            title="需在服务器启动 extraction-worker (pm2 start extraction-worker)"
          >
            <Play className="size-3" />启动 worker
          </Button>
          <div className="ml-auto flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono">
            {loading ? "loading…" : `${totals?.total ?? 0} memories total`}
          </div>
        </div>
      </header>

      <ScrollArea className="flex-1">
        <div className="p-6 space-y-5 max-w-[1400px] mx-auto">
          {err && (
            <div className="rounded-md border border-rose-500/30 bg-rose-500/5 p-3 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
              <AlertTriangle className="size-3.5 mt-0.5 shrink-0" /><div>{err}</div>
            </div>
          )}

          {loading && !status ? (
            <div className="grid place-items-center py-16"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              {/* Worker state */}
              <section>
                <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono mb-2">workers</h3>
                <div className="grid grid-cols-2 gap-3">
                  <WorkerCard name="extraction-worker" state={status?.workers.extraction_worker ?? "unknown"} desc="从对话/文档抽取事实 → L1/L2 候选" />
                  <WorkerCard name="memory-pipeline" state={status?.workers.memory_pipeline ?? "unknown"} desc="L1 → L2 promote · 重要性维护" />
                </div>
                {status?.note && (
                  <div className="mt-2 rounded border border-amber-500/40 bg-amber-500/5 p-2 text-[11px] text-amber-700 dark:text-amber-300 flex items-start gap-2">
                    <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
                    <div>{status.note}</div>
                  </div>
                )}
              </section>

              <Separator />

              {/* Totals */}
              {totals && (
                <section>
                  <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono mb-2">memory totals</h3>
                  <div className="grid grid-cols-6 gap-2">
                    <KpiCard label="total" value={totals.total} icon={<Library className="size-3" />} />
                    <KpiCard label="L1 短期" value={totals.l1} accent="text-sky-600" icon={<Zap className="size-3" />} />
                    <KpiCard label="L2 长期" value={totals.l2} accent="text-emerald-600" icon={<Brain className="size-3" />} />
                    <KpiCard label="L3 永久" value={totals.l3} accent="text-amber-600" icon={<Layers className="size-3" />} />
                    <KpiCard label="last 24h" value={totals.last_24h} accent={totals.last_24h === 0 ? "text-rose-600" : "text-emerald-600"} icon={<Activity className="size-3" />} />
                    <KpiCard label="last 7d" value={totals.last_7d} icon={<BarChart3 className="size-3" />} />
                  </div>
                </section>
              )}

              <Separator />

              {/* Daily chart */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono">
                    daily creation · last {daily.length} days
                  </h3>
                  <div className="flex items-center gap-2 text-[9px] font-mono text-muted-foreground/70">
                    {[1, 2, 3].map((l) => (
                      <span key={l} className="flex items-center gap-1">
                        <svg width="8" height="8"><rect width="8" height="8" className={LAYER_COLOR[l]} /></svg>
                        L{l}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="rounded-md border border-border bg-background p-3">
                  {daily.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">尚无数据</p>
                  ) : (
                    <div className="flex items-end gap-[2px] h-[120px]">
                      {daily.map((d) => {
                        const totalH = (d.n / maxN) * 100;
                        const l1H = d.l1 / d.n * totalH;
                        const l2H = d.l2 / d.n * totalH;
                        const l3H = d.l3 / d.n * totalH;
                        return (
                          <div key={d.day} className="flex-1 group relative flex flex-col justify-end" style={{ height: "100%" }}>
                            <div className="flex flex-col-reverse w-full">
                              <svg viewBox="0 0 10 100" preserveAspectRatio="none" className="w-full" style={{ height: `${totalH}%`, minHeight: totalH > 0 ? "2px" : "0" }}>
                                <rect x="0" y={100 - l1H} width="10" height={l1H} className="fill-sky-500" />
                                <rect x="0" y={100 - l1H - l2H} width="10" height={l2H} className="fill-emerald-500" />
                                <rect x="0" y={100 - l1H - l2H - l3H} width="10" height={l3H} className="fill-amber-500" />
                              </svg>
                            </div>
                            <div className="absolute -top-12 left-1/2 -translate-x-1/2 hidden group-hover:block bg-foreground text-background text-[10px] font-mono px-2 py-1 rounded whitespace-nowrap z-10">
                              {d.day}: {d.n} (L1:{d.l1} L2:{d.l2} L3:{d.l3})
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </section>

              <Separator />

              {/* Recent events */}
              <section>
                <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono mb-2">
                  recent memory events (L1, last 50)
                </h3>
                <div className="rounded-md border border-border bg-background divide-y divide-border/60">
                  {events.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-6">尚无 L1 短期记忆 · memory pipeline 未运行</p>
                  ) : events.map((m) => (
                    <div key={m.id} className="px-3 py-2 flex items-start gap-2 text-xs">
                      <CheckCircle2 className="size-3 text-emerald-500 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium truncate max-w-[300px]">{m.subject || "(no subject)"}</span>
                          {m.type && <Badge variant="outline" className="text-[9px] font-mono uppercase">{m.type}</Badge>}
                          {m.polarity === "negate" && <Badge variant="destructive" className="text-[9px] font-mono uppercase">negate</Badge>}
                          {m.importance !== null && (
                            <span className="text-[10px] font-mono text-muted-foreground">imp {m.importance.toFixed(2)}</span>
                          )}
                          <span className="ml-auto text-[10px] font-mono text-muted-foreground/70 shrink-0">{fmtRel(m.createdAt)}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">{m.preview || m.content || "(empty)"}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function WorkerCard({ name, state, desc }: { name: string; state: string; desc: string }) {
  const color = state === "running" ? "bg-emerald-500" : state === "paused" ? "bg-amber-500" : "bg-zinc-400";
  const Icon = state === "running" ? CheckCircle2 : state === "paused" ? AlertTriangle : XCircle;
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="flex items-center gap-2">
        <span className={cn("size-2 rounded-full", color)} />
        <Icon className={cn("size-3.5", state === "running" ? "text-emerald-500" : state === "paused" ? "text-amber-500" : "text-muted-foreground")} />
        <span className="text-xs font-mono">{name}</span>
        <span className="ml-auto text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{state}</span>
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground leading-relaxed">{desc}</p>
    </div>
  );
}

function KpiCard({ label, value, accent, icon }: { label: string; value: number; accent?: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-background p-2.5">
      <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-muted-foreground/70 font-mono">
        {icon}
        {label}
      </div>
      <div className={cn("mt-1 text-lg font-mono", accent ?? "text-foreground")}>{value.toLocaleString()}</div>
    </div>
  );
}
