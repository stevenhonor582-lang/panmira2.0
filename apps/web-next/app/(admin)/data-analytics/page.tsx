"use client";

import { useState, useEffect, useMemo } from "react";
import { BarChart3, DollarSign, ScrollText, Calendar } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";

type Dimension = "token" | "skill" | "mcp" | "channel" | "knowledge";
type GroupBy = "day" | "dimension_key";

interface ReportRowDay { date: string; count: number; }
interface ReportRowKey { dimensionKey: string; count: number; }
type ReportRow = ReportRowDay | ReportRowKey;
interface ReportResponse { dimension: Dimension; from: string; to: string; groupBy: GroupBy; rows: ReportRow[]; }
interface ApiEnvelope<T> { success: boolean; data: T; }
interface CostBreakdown { date: string; dimension: string; cost: number; }
interface CostResponse { totalLast30d: number; breakdown: CostBreakdown[]; }

const DIMENSIONS: { value: Dimension; label: string }[] = [
  { value: "token", label: "Token 用量" },
  { value: "skill", label: "Skill 调用" },
  { value: "mcp", label: "MCP 调用" },
  { value: "channel", label: "Channel" },
  { value: "knowledge", label: "KB 检索" },
];

function todayStr(): string { return new Date().toISOString().slice(0, 10); }
function daysAgo(n: number): string { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); }

export default function DataAnalyticsPage() {
  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
          <BarChart3 className="size-5 text-muted-foreground" />数据分析
        </h2>
        <p className="text-sm text-muted-foreground">资源报表 + 成本分析 — 一个入口查全部</p>
      </header>
      <Tabs defaultValue="reports" className="space-y-5">
        <TabsList>
          <TabsTrigger value="reports" className="gap-1.5"><ScrollText className="size-3.5" />资源报表</TabsTrigger>
          <TabsTrigger value="cost" className="gap-1.5"><DollarSign className="size-3.5" />成本分析</TabsTrigger>
        </TabsList>
        <TabsContent value="reports"><ReportsTab /></TabsContent>
        <TabsContent value="cost"><CostTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function ReportsTab() {
  const [dimension, setDimension] = useState<Dimension>("token");
  const [from, setFrom] = useState<string>(daysAgo(7));
  const [to, setTo] = useState<string>(todayStr());
  const [groupBy, setGroupBy] = useState<GroupBy>("day");
  const [data, setData] = useState<ReportResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api<ApiEnvelope<ReportResponse>>(`/api/v2/admin/reports/${dimension}?from=${from}&to=${to}&groupBy=${groupBy}`)
      .then((r) => setData(r.data ?? null)).catch(() => setData(null)).finally(() => setLoading(false));
  }, [dimension, from, to, groupBy]);

  const total = useMemo(() => data ? data.rows.reduce((s, r) => s + Number(r.count ?? 0), 0) : 0, [data]);
  const chartConfig: ChartConfig = { count: { label: "count", color: "oklch(0.642 0.169 38.58)" } };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Calendar className="size-3.5 text-muted-foreground" />时间范围</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5"><Label htmlFor="from" className="text-xs">开始</Label><Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-[160px]" /></div>
          <div className="space-y-1.5"><Label htmlFor="to" className="text-xs">结束</Label><Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-[160px]" /></div>
          <div className="space-y-1.5">
            <Label className="text-xs">分组</Label>
            <div className="flex gap-1">
              {(["day", "dimension_key"] as GroupBy[]).map((g) => (
                <button key={g} onClick={() => setGroupBy(g)}
                  className={`px-3 h-8 rounded-md text-xs border transition-colors ${groupBy === g ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:bg-muted"}`}>
                  {g === "day" ? "按日" : "按 key"}
                </button>
              ))}
            </div>
          </div>
          <p className="ml-auto text-sm text-muted-foreground self-end">总计 <span className="font-medium text-foreground tabular-nums">{total.toLocaleString()}</span></p>
        </CardContent>
      </Card>

      <Tabs value={dimension} onValueChange={(v) => setDimension(v as Dimension)}>
        <TabsList>
          {DIMENSIONS.map((d) => <TabsTrigger key={d.value} value={d.value} className="gap-1.5">{d.label}</TabsTrigger>)}
        </TabsList>
        {DIMENSIONS.map((d) => (
          <TabsContent key={d.value} value={d.value}>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{d.label} 趋势</CardTitle>
                <CardDescription>{from} ~ {to} · {groupBy === "day" ? "按日" : "按 key"} · {data?.rows?.length ?? 0} 条</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? <Skeleton className="h-72 w-full" /> : !data || data.rows.length === 0 ? (
                  <div className="h-72 grid place-items-center text-sm text-muted-foreground">所选时间范围无数据</div>
                ) : (
                  <ChartContainer config={chartConfig} className="h-72 w-full">
                    <BarChart data={data.rows.map((r: any) => ({ key: r.date ?? r.dimensionKey ?? "—", count: Number(r.count ?? 0) }))} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="key" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                      <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="count" fill="var(--color-count)" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function CostTab() {
  const [data, setData] = useState<CostResponse | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api<CostResponse>("/api/v2/admin/cost").then(setData).catch(() => setData(null)).finally(() => setLoading(false)); }, []);
  const byDim = useMemo(() => {
    if (!data) return [];
    const m = new Map<string, number>();
    for (const r of data.breakdown) m.set(r.dimension, (m.get(r.dimension) ?? 0) + Number(r.cost));
    return Array.from(m.entries()).map(([dimension, total]) => ({ dimension, total })).sort((a, b) => b.total - a.total);
  }, [data]);

  return (
    <div className="space-y-5">
      {loading ? <Skeleton className="h-24" /> : (
        <>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="size-12 rounded-md bg-emerald-500/10 text-emerald-500 grid place-items-center shrink-0"><DollarSign className="size-6" /></div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">近 30 天总成本</p>
                <p className="text-3xl font-semibold tabular-nums">${(data?.totalLast30d ?? 0).toFixed(2)}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">按维度分布</CardTitle><CardDescription>Top-N 维度排序</CardDescription></CardHeader>
            <CardContent className="p-0">
              {byDim.length === 0 ? <p className="text-sm text-muted-foreground p-6 text-center">暂无成本数据</p> : (
                <Table>
                  <TableHeader><TableRow><TableHead>维度</TableHead><TableHead className="text-right">成本</TableHead><TableHead className="text-right">占比</TableHead></TableRow></TableHeader>
                  <TableBody>{byDim.map((d) => (
                    <TableRow key={d.dimension}>
                      <TableCell className="font-medium">{d.dimension}</TableCell>
                      <TableCell className="text-right tabular-nums">${d.total.toFixed(2)}</TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">{(data && data.totalLast30d > 0 ? ((d.total / data.totalLast30d) * 100).toFixed(1) : 0) + "%"}</TableCell>
                    </TableRow>
                  ))}</TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">每日明细</CardTitle><CardDescription>近 30 天 · 按维度</CardDescription></CardHeader>
            <CardContent className="p-0">
              {data?.breakdown && data.breakdown.length > 0 ? (
                <Table>
                  <TableHeader><TableRow><TableHead>日期</TableHead><TableHead>维度</TableHead><TableHead className="text-right">成本</TableHead></TableRow></TableHeader>
                  <TableBody>{data.breakdown.slice(0, 30).map((r, i) => (
                    <TableRow key={`${r.date}-${r.dimension}-${i}`}>
                      <TableCell className="font-mono text-xs">{r.date}</TableCell>
                      <TableCell>{r.dimension}</TableCell>
                      <TableCell className="text-right tabular-nums">${Number(r.cost).toFixed(2)}</TableCell>
                    </TableRow>
                  ))}</TableBody>
                </Table>
              ) : <p className="text-sm text-muted-foreground p-6 text-center">暂无每日明细</p>}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
