// /overview/billing - 财务/积分 (骨架,等待接入真实账单)
"use client";

import { UsageReportsPanel } from "@/components/r10/data-panels";

import * as React from "react";
import { Coins, Receipt } from "lucide-react";
import {
  fetchCost,
  aggregateCostDaily,
  type CostBreakdown,
} from "../_components/data";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

export default function BillingPage() {
  const [cost, setCost] = React.useState<CostBreakdown | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetchCost()
      .then((c) => setCost(c))
      .catch((e) => setError(e?.message ?? "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  const daily = cost ? aggregateCostDaily(cost.breakdown) : [];
  const total = cost?.totalLast30d ?? 0;

  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
          <span>公司综阅</span>
          <span className="text-border">/</span>
          <span>财务</span>
        </div>
        <h1 className="mt-1.5 font-heading text-2xl font-semibold tracking-tight">
          财务 / 积分
        </h1>
        <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
          近 30 天 token / channel / knowledge 维度消耗 · 真实账单接入待 P4。
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
            <Coins className="size-3" />
            <span>近 30 天总消耗</span>
          </div>
          <div className="mt-2 font-heading text-3xl font-semibold tracking-tight tabular-nums">
            {loading ? "—" : total.toFixed(2)}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {error ? `加载失败: ${error}` : "单位: 平台点数 (1 点 ≈ 0.001 元)"}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
            <Receipt className="size-3" />
            <span>计费维度</span>
          </div>
          <div className="mt-3 grid gap-1.5">
            {["token", "channel", "knowledge"].map((d) => {
              const items = cost?.breakdown.filter((b) => b.dimension === d) ?? [];
              const sum = items.reduce((acc, b) => {
                const v = typeof b.cost === "string" ? parseFloat(b.cost) : b.cost;
                return acc + (Number.isFinite(v) ? v : 0);
              }, 0);
              return (
                <div key={d} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground font-mono text-xs uppercase tracking-wider">
                    {d}
                  </span>
                  <span className="font-mono tabular-nums">{sum.toFixed(3)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-heading text-base font-semibold tracking-tight">
          近 30 天日消耗
        </h2>
        <div className="mt-4 h-64">
          {loading ? (
            <div className="h-full grid place-items-center text-sm text-muted-foreground">加载中…</div>
          ) : !daily.length ? (
            <div className="h-full grid place-items-center text-sm text-muted-foreground">
              暂无账单数据 — 计费上报后会自动出现
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={daily} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                <defs>
                  <linearGradient id="billArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.67 0.15 41)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="oklch(0.67 0.15 41)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  tickFormatter={(v: string) => v.slice(5)}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  width={36}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="total"
                  stroke="oklch(0.67 0.15 41)"
                  strokeWidth={2}
                  fill="url(#billArea)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <section className="mt-6">
        <UsageReportsPanel />
      </section>
    </div>
  );
}
