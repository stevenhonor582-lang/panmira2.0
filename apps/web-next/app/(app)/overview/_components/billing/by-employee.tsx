// 区域② 按正式员工统计 (财务最关心)
// 表格 + 每行占比条
"use client";

import * as React from "react";
import { Users } from "lucide-react";
import { InitialsAvatar } from "../avatar";
import type { BillingEmployee } from "./types";
import { formatTokens, formatCost, formatPct } from "./types";

interface Props {
  rows: BillingEmployee[];
}

export function ByEmployee({ rows }: Props) {
  const hasData = rows.some((r) => r.tokens30d > 0);

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <header className="flex items-center gap-2">
        <Users className="size-4 text-primary" />
        <div>
          <h2 className="font-heading text-base font-semibold tracking-tight">
            按正式员工统计
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            财务最关心 · 每个员工名下数字员工产生的 Token 总量
          </p>
        </div>
      </header>

      {!hasData ? (
        <div className="mt-6 grid place-items-center py-10 text-sm text-muted-foreground">
          暂无消耗数据 — 数字员工运行后,Token 会自动归属到所属员工
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">员工</th>
                <th className="px-4 py-2.5 text-left font-medium">部门</th>
                <th className="px-4 py-2.5 text-right font-medium">今日 Token</th>
                <th className="px-4 py-2.5 text-right font-medium">30 天 Token</th>
                <th className="px-4 py-2.5 text-right font-medium">费用 (USD)</th>
                <th className="px-4 py-2.5 text-left font-medium w-40">占比</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const inactive = r.tokens30d === 0;
                return (
                  <tr
                    key={r.id}
                    className="border-t border-border/60 hover:bg-muted/30"
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <InitialsAvatar name={r.name} size="xs" />
                        <span className={inactive ? "text-muted-foreground" : ""}>
                          {r.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {r.department ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {r.tokensToday > 0 ? formatTokens(r.tokensToday) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                      {r.tokens30d > 0 ? formatTokens(r.tokens30d) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                      {r.cost > 0 ? formatCost(r.cost) : "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="relative h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                          <div
                            className="absolute inset-y-0 left-0 rounded-full"
                            style={{
                              width: `${Math.min(100, Math.max(0, r.pct))}%`,
                              background: "var(--chart-1)",
                            }}
                          />
                        </div>
                        <span className="text-[11px] tabular-nums text-muted-foreground w-10 text-right">
                          {formatPct(r.pct)}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
