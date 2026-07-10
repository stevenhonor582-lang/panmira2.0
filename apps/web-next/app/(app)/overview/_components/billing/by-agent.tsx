// 区域③ 按数字员工 (专项)
// 饼图 + 列表
"use client";

import * as React from "react";
import { Bot } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import type { BillingAgent } from "./types";
import { formatTokens, formatPct, shortAgentName } from "./types";

interface Props {
  rows: BillingAgent[];
}

const PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--primary)",
];

export function ByAgent({ rows }: Props) {
  const data = rows.filter((r) => r.tokens > 0);
  const hasData = data.length > 0;

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <header className="flex items-center gap-2">
        <Bot className="size-4 text-primary" />
        <div>
          <h2 className="font-heading text-base font-semibold tracking-tight">
            按数字员工
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            哪些数字员工消耗最多 Token · 30 天合计
          </p>
        </div>
      </header>

      {!hasData ? (
        <div className="mt-6 grid place-items-center py-10 text-sm text-muted-foreground">
          暂无消耗数据
        </div>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-[200px_1fr] items-center">
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <PieChart>
                <Pie
                  data={data}
                  dataKey="tokens"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={48}
                  outerRadius={80}
                  paddingAngle={2}
                  stroke="var(--card)"
                  strokeWidth={2}
                >
                  {data.map((_, i) => (
                    <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(value: number, _name: string, item: { payload?: { name?: string } }) => [
                    `${Number(value).toLocaleString()} Token`,
                    shortAgentName(item?.payload?.name ?? ""),
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="space-y-1.5">
            {data.map((r, i) => (
              <li key={r.id} className="flex items-center gap-2 text-sm">
                <span
                  className="size-2.5 rounded-sm shrink-0"
                  style={{ background: PALETTE[i % PALETTE.length] }}
                />
                <span className="flex-1 truncate">{shortAgentName(r.name)}</span>
                <span className="tabular-nums text-muted-foreground">
                  {formatTokens(r.tokens)}
                </span>
                <span className="tabular-nums text-xs text-muted-foreground w-12 text-right">
                  {formatPct(r.pct)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
