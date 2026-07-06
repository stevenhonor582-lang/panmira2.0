"use client";

import { useEffect, useMemo, useState } from "react";
import { DollarSign, TrendingUp } from "lucide-react";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api";
import type { CostResponse } from "./_components/types";

export default function CostPage() {
  const [data, setData] = useState<CostResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<CostResponse>("/api/v2/admin/cost")
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  // 按 dimension 聚合
  const byDim = useMemo(() => {
    if (!data) return [];
    const m = new Map<string, number>();
    for (const r of data.breakdown) {
      m.set(r.dimension, (m.get(r.dimension) ?? 0) + Number(r.cost));
    }
    return Array.from(m.entries())
      .map(([dimension, total]) => ({ dimension, total }))
      .sort((a, b) => b.total - a.total);
  }, [data]);

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
          <DollarSign className="size-5 text-muted-foreground" />
          成本分析
        </h2>
        <p className="text-sm text-muted-foreground">
          近 30 天 · 按维度聚合
        </p>
      </header>

      {loading ? (
        <Skeleton className="h-24" />
      ) : (
        <>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="size-12 rounded-md bg-emerald-500/10 text-emerald-500 grid place-items-center shrink-0">
                <DollarSign className="size-6" />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                  近 30 天总成本
                </p>
                <p className="text-3xl font-semibold tabular-nums">
                  ${(data?.totalLast30d ?? 0).toFixed(2)}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Top dimensions */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="size-4 text-muted-foreground" />
                按维度分布
              </CardTitle>
              <CardDescription>Top-N 维度排序</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {byDim.length === 0 ? (
                <p className="text-sm text-muted-foreground p-6 text-center">暂无成本数据</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>维度</TableHead>
                      <TableHead className="text-right">成本</TableHead>
                      <TableHead className="text-right">占比</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byDim.map((d) => (
                      <TableRow key={d.dimension}>
                        <TableCell className="font-medium">{d.dimension}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          ${d.total.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {(data && data.totalLast30d > 0
                            ? ((d.total / data.totalLast30d) * 100).toFixed(1)
                            : 0
                          ) + "%"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Daily breakdown */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">每日明细</CardTitle>
              <CardDescription>近 30 天 · 按维度</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {data?.breakdown && data.breakdown.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>日期</TableHead>
                      <TableHead>维度</TableHead>
                      <TableHead className="text-right">成本</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.breakdown.slice(0, 30).map((r, i) => (
                      <TableRow key={`${r.date}-${r.dimension}-${i}`}>
                        <TableCell className="font-mono text-xs">{r.date}</TableCell>
                        <TableCell>{r.dimension}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          ${Number(r.cost).toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground p-6 text-center">暂无每日明细</p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
