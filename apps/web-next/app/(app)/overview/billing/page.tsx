// /overview/billing — 财务 (以 Token 为中心)
// R14-D 重写 (2026-07-08)
//
// 4 大区域:
//   ① Token 消耗总览 (公司公共) — 4 数字卡 + 30 天柱状图
//   ② 按正式员工统计 (财务最关心) — 表格 + 占比条
//   ③ 按数字员工 (专项) — 饼图 + 列表
//   ④ 按使用来源 (专项) — 饼图 + 列表
//
// 数据源: GET /api/v2/admin/billing-aggregate (单次拉取)
// 文案原则: 全中文 (除 "Token" 保留为业务术语)
"use client";

import * as React from "react";
import { AlertCircle } from "lucide-react";
import { api } from "@/lib/api";
import type { BillingAggregate } from "../_components/billing/types";
import { TokenOverview } from "../_components/billing/token-overview";
import { ByEmployee } from "../_components/billing/by-employee";
import { ByAgent } from "../_components/billing/by-agent";
import { BySource } from "../_components/billing/by-source";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "";

export default function BillingPage() {
  const [data, setData] = React.useState<BillingAggregate | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api<{ success: boolean; data: BillingAggregate }>(
      `${API_BASE}/api/v2/admin/billing-aggregate`,
    )
      .then((res) => {
        if (cancelled) return;
        if (res?.success && res.data) {
          setData(res.data);
          setError(null);
        } else {
          setError("返回格式异常");
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
          <span>公司综阅</span>
          <span className="text-border">/</span>
          <span>财务</span>
        </div>
        <h1 className="mt-1.5 font-heading text-2xl font-semibold tracking-tight">
          财务 · Token 消耗
        </h1>
        <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
          以 Token 为中心的资源消耗记录 · 按员工 / 数字员工 / 使用来源三个维度拆解 · 频道与知识库不计费
        </p>
      </header>

      {error ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 flex items-start gap-2 text-sm">
          <AlertCircle className="size-4 text-destructive mt-0.5 shrink-0" />
          <div>
            <div className="font-medium text-destructive">数据加载失败</div>
            <div className="mt-0.5 text-muted-foreground">{error}</div>
          </div>
        </div>
      ) : loading ? (
        <>
          <div className="rounded-xl border border-border bg-card p-5 h-96 grid place-items-center text-sm text-muted-foreground">
            加载中…
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-5 h-64 grid place-items-center text-sm text-muted-foreground">
              加载中…
            </div>
            <div className="rounded-xl border border-border bg-card p-5 h-64 grid place-items-center text-sm text-muted-foreground">
              加载中…
            </div>
          </div>
        </>
      ) : !data ? (
        <div className="rounded-xl border border-border bg-card p-10 grid place-items-center text-sm text-muted-foreground">
          暂无账单数据
        </div>
      ) : (
        <>
          <TokenOverview
            today={data.overview.today}
            week={data.overview.week}
            month={data.overview.month}
            cost30d={data.overview.cost30d}
            daily={data.overview.daily}
          />
          <ByEmployee rows={data.byEmployee} />
          <div className="grid gap-6 lg:grid-cols-2">
            <ByAgent rows={data.byAgent} />
            <BySource rows={data.bySource} />
          </div>
        </>
      )}
    </div>
  );
}
