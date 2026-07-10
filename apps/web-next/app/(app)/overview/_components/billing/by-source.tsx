// 区域④ 按使用来源 (替代"按频道/任务" — activity_events.user_id 分组)
// 饼图 + 列表
"use client";

import * as React from "react";
import { Signal } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import type { BillingSource } from "./types";
import { formatTokens, formatPct } from "./types";

interface Props {
  rows: BillingSource[];
}

const PALETTE = [
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--primary)",
];

export function BySource({ rows }: Props) {
  const data = rows.filter((r) => r.tokens > 0);
  const hasData = data.length > 0;

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <header className="flex items-center gap-2">
        <Signal className="size-4 text-primary" />
        <div>
          <h2 className="font-heading text-base font-semibold tracking-tight">
            按使用来源
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Token 由哪些入口产生 (飞书会话 / Web 控制台 / API 调用) · 30 天合计
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
                  nameKey="label"
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
                  formatter={(value: number, _name: string, item: { payload?: { label?: string } }) => [
                    `${Number(value).toLocaleString()} Token`,
                    item?.payload?.label ?? "",
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="space-y-1.5">
            {data.map((r, i) => (
              <li key={r.key} className="flex items-center gap-2 text-sm">
                <span
                  className="size-2.5 rounded-sm shrink-0"
                  style={{ background: PALETTE[i % PALETTE.length] }}
                />
                <span className="flex-1 truncate">{r.label}</span>
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
