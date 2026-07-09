// 区域① Token 消耗总览 (公司公共)
// 4 个数字卡 (今日/本周/本月/预估费用) + 30 天柱状图 (输入/输出 Token)
"use client";

import * as React from "react";
import { Activity, CalendarRange, CalendarDays, DollarSign } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import type { BillingDailyPoint } from "./types";
import { formatTokens, formatCost } from "./types";

interface Props {
  today: number;
  week: number;
  month: number;
  cost30d: number;
  daily: BillingDailyPoint[];
}

const KPIS = [
  { key: "today", label: "今日消耗", icon: Activity, accent: "var(--chart-1)" },
  { key: "week", label: "本周消耗", icon: CalendarRange, accent: "var(--chart-2)" },
  { key: "month", label: "本月消耗 (30 天)", icon: CalendarDays, accent: "var(--chart-3)" },
  { key: "cost", label: "预估费用 (30 天)", icon: DollarSign, accent: "var(--chart-4)" },
] as const;

export function TokenOverview({ today, week, month, cost30d, daily }: Props) {
  const cards = [
    { ...KPIS[0], value: formatTokens(today), hint: "近 24 小时 Token" },
    { ...KPIS[1], value: formatTokens(week), hint: "近 7 天 Token" },
    { ...KPIS[2], value: formatTokens(month), hint: "输入 + 输出合计" },
    { ...KPIS[3], value: formatCost(cost30d), hint: "按平台成本上报" },
  ];

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="font-heading text-base font-semibold tracking-tight">
            Token 消耗总览
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            公司全部数字员工产生的 Token 消耗 · 仅 Token 计费 (频道 / 知识库不计费)
          </p>
        </div>
      </header>

      <div className="mt-4 grid gap-3 grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div
              key={c.key}
              className="rounded-lg border border-border bg-background/40 p-4"
            >
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                <Icon className="size-3" style={{ color: c.accent }} />
                <span>{c.label}</span>
              </div>
              <div className="mt-1.5 font-heading text-2xl font-semibold tracking-tight tabular-nums">
                {c.value}
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">{c.hint}</div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 h-64">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <BarChart data={daily} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="day"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              tickFormatter={(v: string) => v.slice(5)}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              width={44}
              tickFormatter={(v: number) => formatTokens(v)}
            />
            <Tooltip
              cursor={{ fill: "var(--muted)" , opacity: 0.3 }}
              contentStyle={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelFormatter={(v: string) => `${v}`}
              formatter={(value: number, name: string) => [
                `${value.toLocaleString()} Token`,
                name === "input" ? "输入 Token" : "输出 Token",
              ]}
            />
            <Legend
              formatter={(value: string) =>
                value === "input" ? "输入 Token" : "输出 Token"
              }
              wrapperStyle={{ fontSize: 12 }}
            />
            <Bar dataKey="input" stackId="t" fill="var(--chart-1)" radius={[0, 0, 0, 0]} />
            <Bar dataKey="output" stackId="t" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
