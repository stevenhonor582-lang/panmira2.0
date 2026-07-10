"use client";

/**
 * R13-C · 数智底座 / 抽取 (2026-07-08, R16-4 重构)
 * 真数据: GET /api/v2/foundation/extraction/status (派生)
 *         GET /api/v2/foundation/memory/l1?limit=50 (最近事件流)
 * R16-4 修: recharts ResponsiveContainer(自适应宽度,治溢出) +
 *           容器 overflow-hidden + KPI 响应式 grid + 全中文
 */
import * as React from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Activity, Zap, Layers, Brain, Library, RefreshCcw,
  CheckCircle2, XCircle, AlertTriangle, Play, Loader2, BarChart3,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
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

const LAYER_FILL: Record<number, string> = {
  1: "oklch(0.62 0.18 248.92)",
  2: "oklch(0.62 0.17 152.00)",
  3: "oklch(0.70 0.15 65.00)",
};

const STATE_LABEL: Record<string, string> = {
  running: "运行中",
  paused: "已暂停",
  unknown: "未知",
};

function fmtState(s: string): string {
  return STATE_LABEL[s] ?? s;
}

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
  const chartData = React.useMemo(
    () => daily.map((d) => ({
      day: d.day.slice(5),
      L1: d.l1,
      L2: d.l2,
      L3: d.l3,
    })),
    [daily],
  );

  return (
    <div className="-m-6 flex h-[calc(100vh-3rem)] flex-col overflow-hidden">
      <header className="px-6 pt-5 pb-3 border-b border-border bg-background shrink-0">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>记忆沉淀</span>
          <span>/</span>
          <span className="text-foreground font-medium">抽取</span>
          <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70">
            R13-C · 真数据派生
          </span>
        </div>
        <div className="mt-2 flex items-center gap-2 flex-wrap">
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
            <Play className="size-3" />启动工作进程
          </Button>
          <div className="ml-auto flex items-center gap-1.5 text-[10px] tracking-wider text-muted-foreground/70 font-mono">
            {loading ? "加载中…" : `共 ${totals?.total ?? 0} 条记忆`}
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="p-6 space-y-5 max-w-[1400px] mx-auto min-w-0">
          {err && (
            <div className="rounded-md border border-rose-500/30 bg-rose-500/5 p-3 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
              <AlertTriangle className="size-3.5 mt-0.5 shrink-0" /><div>{err}</div>
            </div>
          )}

          {loading && !status ? (
            <div className="grid place-items-center py-16"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              {/* 工作进程状态 */}
              <section>
                <h3 className="text-[10px] tracking-wider text-muted-foreground/70 font-mono mb-2">工作进程</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <WorkerCard name="extraction-worker" state={status?.workers.extraction_worker ?? "unknown"} desc="从对话/文档抽取事实 → L1/L2 候选" />
                  <WorkerCard name="memory-pipeline" state={status?.workers.memory_pipeline ?? "unknown"} desc="L1 → L2 提升 · 重要性维护" />
                </div>
                {status?.note && (
                  <div className="mt-2 rounded border border-amber-500/40 bg-amber-500/5 p-2 text-[11px] text-amber-700 dark:text-amber-300 flex items-start gap-2">
                    <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
                    <div>{status.note}</div>
                  </div>
                )}
              </section>

              <Separator />

              {/* 记忆总量 KPI */}
              {totals && (
                <section>
                  <h3 className="text-[10px] tracking-wider text-muted-foreground/70 font-mono mb-2">记忆总量</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                    <KpiCard label="合计" value={totals.total} icon={<Library className="size-3" />} />
                    <KpiCard label="L1 短期" value={totals.l1} accent="text-sky-600" icon={<Zap className="size-3" />} />
                    <KpiCard label="L2 长期" value={totals.l2} accent="text-emerald-600" icon={<Brain className="size-3" />} />
                    <KpiCard label="L3 永久" value={totals.l3} accent="text-amber-600" icon={<Layers className="size-3" />} />
                    <KpiCard label="近 24 时" value={totals.last_24h} accent={totals.last_24h === 0 ? "text-rose-600" : "text-emerald-600"} icon={<Activity className="size-3" />} />
                    <KpiCard label="近 7 天" value={totals.last_7d} icon={<BarChart3 className="size-3" />} />
                  </div>
                </section>
              )}

              <Separator />

              {/* 每日新增柱状图 — recharts ResponsiveContainer 自适应 */}
              <section>
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                  <h3 className="text-[10px] tracking-wider text-muted-foreground/70 font-mono">
                    每日新增 · 最近 {daily.length} 天
                  </h3>
                  <div className="flex items-center gap-3 text-[10px] font-mono text-muted-foreground/80">
                    {[1, 2, 3].map((l) => (
                      <span key={l} className="flex items-center gap-1">
                        <span className="inline-block size-2 rounded-sm" style={{ background: LAYER_FILL[l] }} />
                        L{l}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="rounded-md border border-border bg-background p-3 min-w-0">
                  {daily.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-8">尚无数据</p>
                  ) : (
                    <div className="w-full h-[180px]">
                      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                        <BarChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0 0)" vertical={false} />
                          <XAxis dataKey="day" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={8} stroke="oklch(0.55 0 0)" />
                          <YAxis allowDecimals={false} tick={{ fontSize: 10 }} stroke="oklch(0.55 0 0)" />
                          <Tooltip
                            cursor={{ fill: "oklch(0.96 0 0)" }}
                            contentStyle={{
                              fontSize: 11,
                              borderRadius: 6,
                              border: "1px solid oklch(0.88 0 0)",
                              padding: "6px 10px",
                            }}
                            formatter={(value: number, name: string) => [value, name]}
                          />
                          <Bar dataKey="L1" stackId="a" fill={LAYER_FILL[1]} />
                          <Bar dataKey="L2" stackId="a" fill={LAYER_FILL[2]} />
                          <Bar dataKey="L3" stackId="a" fill={LAYER_FILL[3]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              </section>

              <Separator />

              {/* 近期事件 */}
              <section>
                <h3 className="text-[10px] tracking-wider text-muted-foreground/70 font-mono mb-2">
                  近期记忆事件(L1 · 近 50 条)
                </h3>
                <div className="rounded-md border border-border bg-background divide-y divide-border/60 min-w-0">
                  {events.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-6">尚无 L1 短期记忆 · memory pipeline 未运行</p>
                  ) : events.map((m) => (
                    <div key={m.id} className="px-3 py-2 flex items-start gap-2 text-xs min-w-0">
                      <CheckCircle2 className="size-3 text-emerald-500 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-medium truncate max-w-[280px]">{m.subject || "(无主题)"}</span>
                          {m.type && <Badge variant="outline" className="text-[9px] font-mono uppercase">{m.type}</Badge>}
                          {m.polarity === "negate" && <Badge variant="destructive" className="text-[9px] font-mono uppercase">撤销</Badge>}
                          {m.importance !== null && (
                            <span className="text-[10px] font-mono text-muted-foreground">重要度 {m.importance.toFixed(2)}</span>
                          )}
                          <span className="ml-auto text-[10px] font-mono text-muted-foreground/70 shrink-0">{fmtRel(m.createdAt)}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">{m.preview || m.content || "(无内容)"}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function WorkerCard({ name, state, desc }: { name: string; state: string; desc: string }) {
  const color = state === "running" ? "bg-emerald-500" : state === "paused" ? "bg-amber-500" : "bg-zinc-400";
  const Icon = state === "running" ? CheckCircle2 : state === "paused" ? AlertTriangle : XCircle;
  return (
    <div className="rounded-md border border-border bg-background p-3 min-w-0">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={cn("size-2 rounded-full shrink-0", color)} />
        <Icon className={cn("size-3.5 shrink-0", state === "running" ? "text-emerald-500" : state === "paused" ? "text-amber-500" : "text-muted-foreground")} />
        <span className="text-xs font-mono truncate">{name}</span>
        <span className="ml-auto text-[10px] tracking-wider text-muted-foreground">{fmtState(state)}</span>
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground leading-relaxed">{desc}</p>
    </div>
  );
}

function KpiCard({ label, value, accent, icon }: { label: string; value: number; accent?: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-background p-2.5 min-w-0">
      <div className="flex items-center gap-1 text-[9px] tracking-wider text-muted-foreground/70 font-mono">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className={cn("mt-1 text-lg font-mono truncate", accent ?? "text-foreground")}>{value.toLocaleString()}</div>
    </div>
  );
}
