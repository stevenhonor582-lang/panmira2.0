"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, Calendar, ChevronLeft, ChevronRight, Loader2, Sparkles } from "lucide-react";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig,
} from "@/components/ui/chart";
import {
  Bar, BarChart, CartesianGrid, XAxis, YAxis, ResponsiveContainer, Legend,
} from "recharts";
import { api } from "@/lib/api";
import {
  type Dimension, type Granularity, type ReportResponse, type ApiEnvelope,
  DIMENSIONS, GRANULARITIES, PROVIDERS,
} from "./_components/types";

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function bucketKey(date: Date, gran: Granularity): string {
  if (gran === "day") {
    return date.toISOString().slice(0, 10);
  }
  if (gran === "month") {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function buildBuckets(from: string, to: string, gran: Granularity): string[] {
  const start = new Date(from);
  const end = new Date(to);
  const buckets = new Set<string>();
  const stepDays = gran === "day" ? 1 : gran === "week" ? 7 : 31;
  const cur = new Date(start);
  while (cur <= end) {
    buckets.add(bucketKey(cur, gran));
    cur.setDate(cur.getDate() + stepDays);
  }
  return Array.from(buckets).sort();
}

export default function ReportsPage() {
  const [dimension, setDimension] = useState<Dimension>("token");
  const [from, setFrom] = useState<string>(daysAgo(56));
  const [to, setTo] = useState<string>(todayStr());
  const [granularity, setGranularity] = useState<Granularity>("week");
  const [loading, setLoading] = useState(false);
  const [rawDayData, setRawDayData] = useState<Record<string, number> | null>(null);
  const [rawProviderData, setRawProviderData] = useState<Record<string, Record<string, number>> | null>(null);

  useEffect(() => {
    setLoading(true);
    const loadDay = async () => {
      try {
        const r = await api<ApiEnvelope<ReportResponse>>(
          `/api/v2/admin/reports/${dimension}?from=${from}&to=${to}&groupBy=day`,
        );
        const map: Record<string, number> = {};
        (r.data?.rows ?? []).forEach((row: any) => {
          map[row.date] = Number(row.count ?? 0);
        });
        setRawDayData(map);
      } catch {
        setRawDayData({});
      }
    };
    loadDay();
  }, [dimension, from, to]);

  useEffect(() => {
    if (dimension !== "token") {
      setRawProviderData(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await api<ApiEnvelope<ReportResponse>>(
          `/api/v2/admin/reports/${dimension}?from=${from}&to=${to}&groupBy=provider`,
        );
        if (cancelled) return;
        const grouped: Record<string, Record<string, number>> = {};
        (r.data?.rows ?? []).forEach((row: any) => {
          const date = row.date ?? row.dimensionKey ?? "—";
          const provider = row.provider ?? "custom";
          grouped[date] ??= {};
          grouped[date][provider] = Number(row.count ?? 0);
        });
        setRawProviderData(grouped);
      } catch {
        if (!cancelled) setRawProviderData({});
      }
    })();
    return () => { cancelled = true; };
  }, [dimension, from, to]);

  useEffect(() => {
    if (rawDayData === null) {
      setLoading(true);
    } else {
      setLoading(false);
    }
  }, [rawDayData]);

  const aggregated = useMemo(() => {
    if (!rawDayData) return null;
    if (granularity === "day") {
      return rawDayData;
    }
    const buckets = buildBuckets(from, to, granularity);
    const out: Record<string, number> = {};
    Object.entries(rawDayData).forEach(([date, count]) => {
      const k = bucketKey(new Date(date), granularity);
      out[k] = (out[k] ?? 0) + count;
    });
    buckets.forEach((b) => { out[b] ??= 0; });
    return out;
  }, [rawDayData, granularity, from, to]);

  const stackedByProvider = useMemo(() => {
    if (dimension !== "token" || !rawProviderData) return null;
    if (granularity === "day") {
      return rawProviderData;
    }
    const buckets = buildBuckets(from, to, granularity);
    const out: Record<string, Record<string, number>> = {};
    Object.entries(rawProviderData).forEach(([date, providers]) => {
      const k = bucketKey(new Date(date), granularity);
      out[k] ??= {};
      Object.entries(providers).forEach(([p, v]) => {
        out[k][p] = (out[k][p] ?? 0) + v;
      });
    });
    buckets.forEach((b) => { out[b] ??= {}; });
    return out;
  }, [dimension, rawProviderData, granularity, from, to]);

  const total = useMemo(() => {
    if (!aggregated) return 0;
    return Object.values(aggregated).reduce((s, v) => s + v, 0);
  }, [aggregated]);

  const chartData = useMemo(() => {
    if (!aggregated) return [];
    const useStack = dimension === "token" && stackedByProvider;
    const keys = Object.keys(aggregated).sort();
    return keys.map((k) => {
      if (useStack) {
        const providers = stackedByProvider?.[k] ?? {};
        return { key: k, ...providers };
      }
      return { key: k, count: aggregated[k] };
    });
  }, [aggregated, stackedByProvider, dimension]);

  const chartConfig: ChartConfig = useMemo(() => {
    if (dimension === "token" && stackedByProvider) {
      const cfg: ChartConfig = {};
      PROVIDERS.forEach((p) => {
        cfg[p.key] = { label: p.label, color: p.color };
      });
      cfg.custom = cfg.custom ?? { label: "其他", color: "oklch(0.65 0.05 280)" };
      return cfg;
    }
    return { count: { label: "count", color: "oklch(0.642 0.169 38.58)" } };
  }, [dimension, stackedByProvider]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const updateScrollState = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };
  useEffect(() => {
    updateScrollState();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateScrollState);
    return () => el.removeEventListener("scroll", updateScrollState);
  }, [chartData.length]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollLeft = el.scrollWidth;
    });
  }, [chartData.length, dimension, granularity]);

  const scrollBy = (delta: number) => {
    scrollRef.current?.scrollBy({ left: delta, behavior: "smooth" });
  };

  const applyRange = (days: number) => {
    setFrom(daysAgo(days));
    setTo(todayStr());
  };

  const chartMinWidth = Math.max(chartData.length * 80, 600);

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
          <BarChart3 className="size-5 text-muted-foreground" />
          资源报表
        </h2>
        <p className="text-sm text-muted-foreground">
          {loading ? "加载中" : `总计 ${total.toLocaleString()}`}
          {dimension === "token" && " · 按 AI 服务商堆叠"}
          {" · "}
          {chartData.length} 个{granularity === "day" ? "日" : granularity === "week" ? "周" : "月"}桶
        </p>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Calendar className="size-3.5 text-muted-foreground" />
            时间范围
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="from" className="text-xs">开始</Label>
              <Input id="from" type="date" value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-[160px]" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="to" className="text-xs">结束</Label>
              <Input id="to" type="date" value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-[160px]" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">横轴粒度</Label>
              <div className="flex gap-1">
                {GRANULARITIES.map((g) => (
                  <button
                    key={g.value}
                    onClick={() => setGranularity(g.value)}
                    className={`px-3 h-8 rounded-md text-xs border transition-colors ${
                      granularity === g.value
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background border-border hover:bg-muted"
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">快捷时间段</Label>
              <div className="flex gap-1">
                {[
                  { label: "7 天", days: 7 },
                  { label: "30 天", days: 30 },
                  { label: "8 周", days: 56 },
                  { label: "90 天", days: 90 },
                  { label: "1 年", days: 365 },
                ].map((r) => (
                  <button
                    key={r.label}
                    onClick={() => applyRange(r.days)}
                    className="px-3 h-8 rounded-md text-xs border bg-background border-border hover:bg-muted transition-colors"
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={dimension} onValueChange={(v) => setDimension(v as Dimension)}>
        <TabsList>
          {DIMENSIONS.map((d) => (
            <TabsTrigger key={d.value} value={d.value} className="gap-1.5">
              {d.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {DIMENSIONS.map((d) => (
          <TabsContent key={d.value} value={d.value}>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  {d.label} 趋势
                  {dimension === "token" && (
                    <span className="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground">
                      <Sparkles className="size-3" />
                      按 AI 服务商堆叠
                    </span>
                  )}
                </CardTitle>
                <CardDescription>
                  {from} ~ {to} · {GRANULARITIES.find((g) => g.value === granularity)?.label}
                  {dimension === "token" ? " · 堆叠柱" : " · 单系列"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading || !aggregated ? (
                  <Skeleton className="h-80 w-full" />
                ) : chartData.length === 0 ? (
                  <div className="h-80 grid place-items-center text-sm text-muted-foreground">
                    所选时间范围无数据
                  </div>
                ) : (
                  <div className="relative">
                    {chartData.length > 8 && (
                      <>
                        <button
                          onClick={() => scrollBy(-300)}
                          disabled={!canScrollLeft}
                          aria-label="向左滚动"
                          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 size-7 rounded-full bg-background/90 border shadow-sm grid place-items-center disabled:opacity-30 hover:bg-muted"
                        >
                          <ChevronLeft className="size-4" />
                        </button>
                        <button
                          onClick={() => scrollBy(300)}
                          disabled={!canScrollRight}
                          aria-label="向右滚动"
                          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 size-7 rounded-full bg-background/90 border shadow-sm grid place-items-center disabled:opacity-30 hover:bg-muted"
                        >
                          <ChevronRight className="size-4" />
                        </button>
                      </>
                    )}
                    <div
                      ref={scrollRef}
                      className="overflow-x-auto pb-2"
                      style={{ scrollbarWidth: "thin" }}
                    >
                      <div style={{ minWidth: `${chartMinWidth}px`, height: 320 }}>
                        <ChartContainer config={chartConfig} className="h-full w-full">
                          <BarChart
                            data={chartData}
                            margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                            <XAxis
                              dataKey="key"
                              tickLine={false}
                              axisLine={false}
                              tick={{ fontSize: 10 }}
                              interval={0}
                              angle={-30}
                              textAnchor="end"
                              height={50}
                            />
                            <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                            <ChartTooltip content={<ChartTooltipContent />} />
                            {dimension === "token" && stackedByProvider ? (
                              <>
                                <Legend wrapperStyle={{ fontSize: 11 }} />
                                {PROVIDERS.map((p) => (
                                  <Bar
                                    key={p.key}
                                    dataKey={p.key}
                                    stackId="tokens"
                                    fill={p.color}
                                    radius={[2, 2, 0, 0]}
                                  />
                                ))}
                              </>
                            ) : (
                              <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} />
                            )}
                          </BarChart>
                        </ChartContainer>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {chartData.length > 0 && (
              <Card className="mt-3">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">数据明细</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto max-h-96">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-card z-10">
                        <tr className="border-b border-border">
                          <th className="text-left px-4 py-2 text-xs text-muted-foreground font-medium">
                            {granularity === "day" ? "日期" : granularity === "week" ? "周" : "月"}
                          </th>
                          {dimension === "token" && stackedByProvider ? (
                            PROVIDERS.map((p) => (
                              <th key={p.key} className="text-right px-3 py-2 text-xs text-muted-foreground font-medium">
                                <span className="inline-flex items-center gap-1">
                                  <span
                                    className="inline-block size-2 rounded-sm"
                                    style={{ background: p.color }}
                                  />
                                  {p.label}
                                </span>
                              </th>
                            ))
                          ) : (
                            <th className="text-right px-4 py-2 text-xs text-muted-foreground font-medium">
                              计数
                            </th>
                          )}
                          <th className="text-right px-4 py-2 text-xs text-muted-foreground font-medium">
                            合计
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {chartData.map((row: any, i: number) => {
                          const total = dimension === "token" && stackedByProvider
                            ? PROVIDERS.reduce((s, p) => s + Number(row[p.key] ?? 0), 0)
                            : Number(row.count ?? 0);
                          return (
                            <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                              <td className="px-4 py-2 font-mono text-xs">{row.key}</td>
                              {dimension === "token" && stackedByProvider ? (
                                PROVIDERS.map((p) => (
                                  <td key={p.key} className="px-3 py-2 text-right tabular-nums text-xs">
                                    {Number(row[p.key] ?? 0).toLocaleString()}
                                  </td>
                                ))
                              ) : (
                                <td className="px-4 py-2 text-right tabular-nums">
                                  {total.toLocaleString()}
                                </td>
                              )}
                              <td className="px-4 py-2 text-right tabular-nums font-medium">
                                {total.toLocaleString()}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
