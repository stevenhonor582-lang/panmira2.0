// KPI tile - 大数字 + 副标签 + sparkline
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sparkline } from "./sparkline";

interface Props {
  label: string;
  value: string | number;
  hint?: string;
  delta?: { value: number; positive: boolean };
  trend?: number[];
  icon: LucideIcon;
  accent?: "primary" | "chart-1" | "chart-2" | "chart-3" | "chart-4";
  className?: string;
}

const ACCENT_VAR: Record<NonNullable<Props["accent"]>, string> = {
  primary: "var(--primary)",
  "chart-1": "var(--chart-1)",
  "chart-2": "var(--chart-2)",
  "chart-3": "var(--chart-3)",
  "chart-4": "var(--chart-4)",
};

export function KpiTile({
  label,
  value,
  hint,
  delta,
  trend,
  icon: Icon,
  accent = "chart-1",
  className,
}: Props) {
  const color = ACCENT_VAR[accent];
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border border-border bg-card p-5",
        "transition-colors hover:bg-card/80",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
            <Icon className="size-3" />
            <span>{label}</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-heading text-3xl font-semibold tracking-tight tabular-nums">
              {value}
            </span>
            {delta && (
              <span
                className={cn(
                  "text-[11px] font-medium font-mono",
                  delta.positive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
                )}
              >
                {delta.positive ? "+" : "-"}{Math.abs(delta.value)}
              </span>
            )}
          </div>
          {hint && (
            <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
          )}
        </div>
        {trend && trend.length > 0 && (
          <div className="shrink-0 text-foreground" style={{ color }}>
            <Sparkline data={trend} width={88} height={32} stroke={color} fill={color} />
          </div>
        )}
      </div>
    </div>
  );
}
