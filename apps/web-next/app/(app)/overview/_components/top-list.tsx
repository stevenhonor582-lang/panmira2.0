// 通用 Top 5 排行 — rank 1-5,头部图标 + 名字 + 数值
import * as React from "react";
import { ArrowUpRight, type LucideIcon } from "lucide-react";

export interface TopItem {
  id: string;
  name: string;
  value: number;
  sub?: string | null;
  avatarUrl?: string | null;
}

interface Props {
  title: string;
  hint?: string;
  icon: LucideIcon;
  accent: string;
  items: TopItem[];
  unit?: string;
  emptyHint?: string;
}

const RANK_TONE = [
  "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  "bg-slate-400/15 text-slate-700 dark:text-slate-200 border-slate-400/30",
  "bg-orange-700/15 text-orange-800 dark:text-orange-300 border-orange-700/30",
  "bg-muted text-muted-foreground border-border",
  "bg-muted text-muted-foreground border-border",
];

function initials(name: string): string {
  if (!name) return "?";
  const trimmed = name.trim();
  // 中文取前 1 字,英文取首字母
  if (/[一-龥]/.test(trimmed)) return trimmed.slice(0, 1);
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function TopList({ title, hint, icon: Icon, accent, items, unit, emptyHint }: Props) {
  const max = items.length > 0 ? Math.max(...items.map((i) => i.value), 1) : 1;

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-center gap-1.5 min-w-0">
          <Icon className="size-3.5" style={{ color: accent }} />
          <h3 className="font-heading text-sm font-semibold tracking-tight">{title}</h3>
        </div>
        {hint && <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{hint}</span>}
      </div>

      <ol className="mt-3 space-y-2">
        {items.length === 0 ? (
          <li className="py-6 text-center text-xs text-muted-foreground">{emptyHint ?? "暂无数据"}</li>
        ) : (
          items.map((item, idx) => {
            const rank = idx + 1;
            const pct = max > 0 ? (item.value / max) * 100 : 0;
            return (
              <li
                key={item.id}
                className="group grid grid-cols-[auto_auto_1fr_auto] items-center gap-2.5 rounded-md px-1 py-1.5 transition-colors hover:bg-muted/30"
              >
                <span
                  className={`grid size-5 place-items-center rounded-full border text-[10px] font-bold tabular-nums ${RANK_TONE[idx] ?? RANK_TONE[3]}`}
                >
                  {rank}
                </span>
                <span
                  className="grid size-7 place-items-center rounded-full text-[10px] font-semibold border border-border"
                  style={{ background: `color-mix(in oklch, ${accent} 12%, transparent)`, color: accent }}
                >
                  {initials(item.name)}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-xs font-medium">{item.name}</span>
                    {idx === 0 && item.value > 0 && (
                      <ArrowUpRight className="size-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    )}
                  </div>
                  {item.sub && (
                    <div className="truncate text-[10px] text-muted-foreground">{item.sub}</div>
                  )}
                  <div className="mt-1 h-0.5 rounded-full bg-muted/60 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, background: accent }}
                    />
                  </div>
                </div>
                <span className="font-mono text-xs font-semibold tabular-nums" style={{ color: accent }}>
                  {item.value.toLocaleString()}{unit ?? ""}
                </span>
              </li>
            );
          })
        )}
      </ol>
    </div>
  );
}
