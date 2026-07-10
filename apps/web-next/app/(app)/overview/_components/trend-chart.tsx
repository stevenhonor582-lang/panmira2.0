// 30 天趋势 — 4 metric tab + AreaChart
import * as React from "react";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

export interface TrendPoint {
  day: string;
}
export interface TrendErrorsPoint extends TrendPoint {
  total: number;
  errors: number;
  rate: number;
}
export interface TrendTokensPoint extends TrendPoint {
  input: number;
  output: number;
}
export interface TrendCostPoint extends TrendPoint {
  total: number;
}

interface Props {
  calls: Array<TrendPoint & { count: number }>;
  errors: TrendErrorsPoint[];
  tokens: TrendTokensPoint[];
  cost: TrendCostPoint[];
}

type Metric = "calls" | "errors" | "tokens" | "cost";

const TABS: Array<{ key: Metric; label: string; color: string }> = [
  { key: "calls", label: "调用量", color: "oklch(0.67 0.15 248.92)" },
  { key: "errors", label: "错误率", color: "oklch(0.60 0.18 19.98)" },
  { key: "tokens", label: "Token 消耗", color: "oklch(0.67 0.15 41.62)" },
  { key: "cost", label: "成本", color: "oklch(0.79 0.13 83.70)" },
];

function dayLabel(d: string): string {
  return d.slice(5); // MM-DD
}

function fmt(n: number, metric: Metric): string {
  if (metric === "errors") return `${n.toFixed(2)}%`;
  if (metric === "cost") return `$${n.toFixed(4)}`;
  if (metric === "tokens") return n.toLocaleString();
  return n.toLocaleString();
}

export function TrendChart({ calls, errors, tokens, cost }: Props) {
  const [metric, setMetric] = React.useState<Metric>("calls");
  const active = TABS.find((t) => t.key === metric)!;
  const color = active.color;

  const data = React.useMemo(() => {
    if (metric === "calls") {
      return calls.map((d) => ({ day: d.day, value: d.count }));
    }
    if (metric === "errors") {
      return errors.map((d) => ({ day: d.day, value: d.rate }));
    }
    if (metric === "tokens") {
      return tokens.map((d) => ({ day: d.day, value: d.input + d.output, input: d.input, output: d.output }));
    }
    return cost.map((d) => ({ day: d.day, value: d.total }));
  }, [metric, calls, errors, tokens, cost]);

  const total = React.useMemo(() => {
    if (metric === "errors") {
      const sum = errors.reduce((acc, d) => acc + d.errors, 0);
      const sumTotal = errors.reduce((acc, d) => acc + d.total, 0);
      return sumTotal > 0 ? `${((sum / sumTotal) * 100).toFixed(2)}% / ${sumTotal}` : "0 / 0";
    }
    if (metric === "tokens") {
      const sum = tokens.reduce((acc, d) => acc + d.input + d.output, 0);
      return sum.toLocaleString();
    }
    if (metric === "cost") {
      const sum = cost.reduce((acc, d) => acc + d.total, 0);
      return `$${sum.toFixed(4)}`;
    }
    return calls.reduce((acc, d) => acc + d.count, 0).toLocaleString();
  }, [metric, calls, errors, tokens, cost]);

  const gradId = `trend-grad-${metric}`;

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-heading text-base font-semibold tracking-tight">30 天趋势</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            按 metric 切换 · 30 日聚合 · 顶部数字为当前周期合计
          </p>
        </div>
        <div className="text-right">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">合计</div>
          <div className="font-mono text-lg font-semibold tabular-nums" style={{ color }}>{total}</div>
        </div>
      </div>

      <div
        role="tablist"
        aria-label="趋势 metric"
        className="mt-4 inline-flex rounded-lg border border-border bg-muted/30 p-0.5"
      >
        {TABS.map((t) => {
          const isActive = t.key === metric;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={isActive}
              onClick={() => setMetric(t.key)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                isActive
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              style={isActive ? { color: t.color } : undefined}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="mt-4 h-64">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.42} />
                <stop offset="100%" stopColor={color} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} opacity={0.6} />
            <XAxis
              dataKey="day"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              tickFormatter={dayLabel}
              minTickGap={28}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              width={48}
              tickFormatter={(v: number) => metric === "errors" ? `${v}%` : metric === "cost" ? `$${v}` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
            />
            <Tooltip
              contentStyle={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 12,
                color: "var(--foreground)",
              }}
              labelStyle={{ color: "var(--muted-foreground)", fontSize: 11 }}
              formatter={(value: number, name: string) => [fmt(value, metric), name === "value" ? active.label : name]}
              labelFormatter={(label: string) => `日期 ${dayLabel(label)}`}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              fill={`url(#${gradId})`}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
