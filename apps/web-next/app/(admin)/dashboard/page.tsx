"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Line,
  LineChart,
  CartesianGrid,
  XAxis,
  YAxis,
  ResponsiveContainer,
} from "recharts";
import {
  Bot,
  Database,
  Cpu,
  Plug,
  KeyRound,
  Wrench,
  Hash,
  type LucideIcon,
} from "lucide-react";

interface DashboardStats {
  counts: {
    llm: number;
    embedding: number;
    mcp: number;
    knowledgeBases: number;
    agents: number;
    oauthClients: number;
    skills: number;
  };
  trends: Array<{
    date: string;
    token: number;
    skill: number;
    mcp: number;
    knowledge: number;
  }>;
}

interface CountCard {
  key: keyof DashboardStats["counts"];
  label: string;
  desc: string;
  icon: LucideIcon;
  tone: "primary" | "blue" | "emerald" | "amber" | "violet" | "rose" | "slate";
}

const COUNT_CARDS: CountCard[] = [
  { key: "agents", label: "Agent", desc: "业务 Agent 数量", icon: Bot, tone: "primary" },
  { key: "llm", label: "LLM 模型", desc: "LLM Provider 池", icon: Cpu, tone: "blue" },
  { key: "knowledgeBases", label: "数智底座 KB", desc: "知识库数量", icon: Database, tone: "emerald" },
  { key: "oauthClients", label: "OAuth Client", desc: "外部接入凭证", icon: KeyRound, tone: "amber" },
  { key: "skills", label: "Skill", desc: "Skill 池", icon: Wrench, tone: "violet" },
  { key: "mcp", label: "MCP Server", desc: "已注册 MCP", icon: Plug, tone: "rose" },
  { key: "embedding", label: "Embedding", desc: "向量模型", icon: Hash, tone: "slate" },
];

const TONE_CLASSES: Record<CountCard["tone"], { bg: string; fg: string; ring: string }> = {
  primary: { bg: "bg-primary/10", fg: "text-primary", ring: "ring-primary/20" },
  blue: { bg: "bg-blue-500/10", fg: "text-blue-500", ring: "ring-blue-500/20" },
  emerald: { bg: "bg-emerald-500/10", fg: "text-emerald-500", ring: "ring-emerald-500/20" },
  amber: { bg: "bg-amber-500/10", fg: "text-amber-500", ring: "ring-amber-500/20" },
  violet: { bg: "bg-violet-500/10", fg: "text-violet-500", ring: "ring-violet-500/20" },
  rose: { bg: "bg-rose-500/10", fg: "text-rose-500", ring: "ring-rose-500/20" },
  slate: { bg: "bg-slate-500/10", fg: "text-slate-500", ring: "ring-slate-500/20" },
};

const chartConfig = {
  token: { label: "Token 用量", color: "oklch(0.642 0.169 38.58)" },
  skill: { label: "Skill 调用", color: "oklch(0.6 0.18 280)" },
  mcp: { label: "MCP 调用", color: "oklch(0.65 0.2 145)" },
  knowledge: { label: "KB 检索", color: "oklch(0.62 0.18 230)" },
} satisfies ChartConfig;

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api<DashboardStats>("/api/v2/admin/dashboard/stats")
      .then((data) => alive && setStats(data))
      .catch((err) => alive && setError(err instanceof Error ? err.message : "未知错误"));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="space-y-5">
      {/* Header */}
      <header className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">总览 Dashboard</h2>
        <p className="text-sm text-muted-foreground">
          数智资源总览 · 实时数据 · 每 60s 自动刷新
        </p>
      </header>

      {/* Status cards */}
      <section className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {COUNT_CARDS.map((card) => {
          const Icon = card.icon;
          const tone = TONE_CLASSES[card.tone];
          const value = stats?.counts[card.key];
          return (
            <Card key={card.key} className="gap-1 py-3.5">
              <CardContent className="px-3.5 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                    {card.label}
                  </p>
                  <div
                    className={`size-6 grid place-items-center rounded-md ${tone.bg} ${tone.fg}`}
                  >
                    <Icon className="size-3.5" />
                  </div>
                </div>
                {value === undefined ? (
                  <Skeleton className="h-8 w-12" />
                ) : (
                  <p className="text-2xl font-semibold tracking-tight tabular-nums">
                    {value}
                  </p>
                )}
                <p className="text-[11px] text-muted-foreground leading-tight">
                  {card.desc}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </section>

      {/* Trend chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">近 7 天用量趋势</CardTitle>
          <CardDescription>
            按日聚合 · token / skill / mcp / knowledge
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="h-72 grid place-items-center text-sm text-destructive">
              加载失败:{error}
            </div>
          ) : !stats ? (
            <Skeleton className="h-72 w-full" />
          ) : stats.trends.length === 0 ? (
            <div className="h-72 grid place-items-center text-sm text-muted-foreground">
              暂无数据 — 等用量上报后会自动出现
            </div>
          ) : (
            <ChartContainer config={chartConfig} className="h-72 w-full">
              <LineChart
                data={stats.trends}
                margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: string) => v.slice(5)}
                />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Line
                  type="monotone"
                  dataKey="token"
                  stroke="var(--color-token)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="skill"
                  stroke="var(--color-skill)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="mcp"
                  stroke="var(--color-mcp)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="knowledge"
                  stroke="var(--color-knowledge)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
