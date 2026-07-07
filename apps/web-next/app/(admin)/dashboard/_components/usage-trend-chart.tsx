"use client";

import { Activity } from "lucide-react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

interface Trend {
  date: string;
  token: number;
  skill: number;
  mcp: number;
  knowledge: number;
}

const chartConfig = {
  token: { label: "Token 用量", color: "oklch(0.642 0.169 38.58)" },
  skill: { label: "Skill 调用", color: "oklch(0.6 0.18 280)" },
  mcp: { label: "MCP 调用", color: "oklch(0.65 0.2 145)" },
  knowledge: { label: "KB 检索", color: "oklch(0.62 0.18 230)" },
} satisfies ChartConfig;

interface Props {
  trends: Trend[] | null;
  loading: boolean;
}

export function UsageTrendChart({ trends, loading }: Props) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="size-4 text-muted-foreground" />
          近 7 天用量趋势
        </CardTitle>
        <CardDescription>按日聚合 · token / skill / mcp / knowledge</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-72 w-full" />
        ) : !trends || trends.length === 0 ? (
          <div className="h-72 grid place-items-center text-sm text-muted-foreground">
            暂无数据 — 等用量上报后会自动出现
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="h-72 w-full">
            <LineChart data={trends} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} tickFormatter={(v: string) => v.slice(5)} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Line type="monotone" dataKey="token" stroke="var(--color-token)" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="skill" stroke="var(--color-skill)" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="mcp" stroke="var(--color-mcp)" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="knowledge" stroke="var(--color-knowledge)" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
