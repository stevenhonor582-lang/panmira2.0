"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, Calendar, Loader2 } from "lucide-react";
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
  Bar, BarChart, CartesianGrid, XAxis, YAxis, ResponsiveContainer,
} from "recharts";
import { api } from "@/lib/api";
import {
  type Dimension, type GroupBy, type ReportResponse, type ApiEnvelope, DIMENSIONS,
} from "./_components/types";

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export default function ReportsPage() {
  const [dimension, setDimension] = useState<Dimension>("token");
  const [from, setFrom] = useState<string>(daysAgo(7));
  const [to, setTo] = useState<string>(todayStr());
  const [groupBy, setGroupBy] = useState<GroupBy>("day");
  const [data, setData] = useState<ReportResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api<ApiEnvelope<ReportResponse>>(
      `/api/v2/admin/reports/${dimension}?from=${from}&to=${to}&groupBy=${groupBy}`,
    )
      .then((r) => setData(r.data ?? null))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [dimension, from, to, groupBy]);

  const total = useMemo(() => {
    if (!data) return 0;
    return data.rows.reduce((s, r) => s + Number(r.count ?? 0), 0);
  }, [data]);

  const chartConfig: ChartConfig = {
    count: { label: "count", color: "oklch(0.642 0.169 38.58)" },
  };

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
          <BarChart3 className="size-5 text-muted-foreground" />
          资源报表
        </h2>
        <p className="text-sm text-muted-foreground">
          5 维度按日 / 按 key 聚合 — {data ? `总计 ${total.toLocaleString()}` : "加载中"}
        </p>
      </header>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Calendar className="size-3.5 text-muted-foreground" />
            时间范围
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
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
            <Label className="text-xs">分组</Label>
            <div className="flex gap-1">
              {(["day", "dimension_key"] as GroupBy[]).map((g) => (
                <button
                  key={g}
                  onClick={() => setGroupBy(g)}
                  className={`px-3 h-8 rounded-md text-xs border transition-colors ${
                    groupBy === g
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-border hover:bg-muted"
                  }`}
                >
                  {g === "day" ? "按日" : "按 key"}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dimension tabs */}
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
                <CardTitle className="text-base">{d.label} 趋势</CardTitle>
                <CardDescription>
                  {from} ~ {to} · {groupBy === "day" ? "按日" : "按 key"} · {data?.rows?.length ?? 0} 条
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-72 w-full" />
                ) : !data || data.rows.length === 0 ? (
                  <div className="h-72 grid place-items-center text-sm text-muted-foreground">
                    所选时间范围无数据
                  </div>
                ) : (
                  <ChartContainer config={chartConfig} className="h-72 w-full">
                    <BarChart
                      data={data.rows.map((r: any) => ({
                        key: r.date ?? r.dimensionKey ?? "—",
                        count: Number(r.count ?? 0),
                      }))}
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
                      <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>

            {/* Table */}
            {data && data.rows.length > 0 && (
              <Card className="mt-3">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">数据明细</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left px-4 py-2 text-xs text-muted-foreground font-medium">
                            {groupBy === "day" ? "日期" : "Key"}
                          </th>
                          <th className="text-right px-4 py-2 text-xs text-muted-foreground font-medium">
                            计数
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.rows.map((r: any, i: number) => (
                          <tr key={i} className="border-b border-border/50">
                            <td className="px-4 py-2 font-mono text-xs">
                              {r.date ?? r.dimensionKey ?? "—"}
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums">
                              {Number(r.count ?? 0).toLocaleString()}
                            </td>
                          </tr>
                        ))}
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
