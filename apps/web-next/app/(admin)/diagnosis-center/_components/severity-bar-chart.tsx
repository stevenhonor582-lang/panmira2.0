"use client";

import { BarChart3 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import type { WeeklyBucket } from "./types";

const chartConfig = {
  alert:  { label: "Alert 告警",  color: "oklch(0.65 0.22 25)" },
  error:  { label: "Error 异常",  color: "oklch(0.6 0.22 0)" },
  warning:{ label: "Warning 警告", color: "oklch(0.75 0.18 75)" },
  info:   { label: "Info 信息",   color: "oklch(0.65 0.15 230)" },
} satisfies ChartConfig;

interface Props {
  buckets: WeeklyBucket[];
}

export function SeverityBarChart({ buckets }: Props) {
  const data = buckets.map((b) => ({
    week: b.weekStart.slice(5), // MM-DD
    alert: b.alert,
    error: b.error,
    warning: b.warning,
    info: b.info,
  }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <BarChart3 className="size-4 text-muted-foreground" />
          按周横轴 · 异常数堆叠
        </CardTitle>
        <CardDescription>最近 8 周 · alert / error / warning / info</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="h-56 grid place-items-center text-sm text-muted-foreground">
            暂无告警数据
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="h-56 w-full">
            <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="week" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} allowDecimals={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="alert"   stackId="s" fill="var(--color-alert)"   radius={[0, 0, 0, 0]} />
              <Bar dataKey="error"   stackId="s" fill="var(--color-error)"   radius={[0, 0, 0, 0]} />
              <Bar dataKey="warning" stackId="s" fill="var(--color-warning)" radius={[0, 0, 0, 0]} />
              <Bar dataKey="info"    stackId="s" fill="var(--color-info)"    radius={[3, 3, 0, 0]} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
