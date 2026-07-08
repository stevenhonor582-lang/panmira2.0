// /overview/dashboard — 公司运营全景仪表盘 (R12)
// 5 大区域: KPI 8 / 30d 趋势 / 系统健康 / Top 5 / 最近活动
// 单次 fetch 拉 aggregate payload,避免并发 N 个请求
"use client";

import * as React from "react";
import { RefreshCw, AlertCircle } from "lucide-react";
import {
  fetchDashboardAggregate,
  type DashboardAggregate,
} from "../_components/data";
import { DashboardKpis } from "../_components/dashboard-kpis";
import { TrendChart } from "../_components/trend-chart";
import { HealthMeters } from "../_components/health-meters";
import { TopList } from "../_components/top-list";
import { RecentActivity } from "../_components/recent-activity";
import { Bot, Users, FileText } from "lucide-react";

export default function DashboardPage() {
  const [data, setData] = React.useState<DashboardAggregate | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [updatedAt, setUpdatedAt] = React.useState<Date | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const agg = await fetchDashboardAggregate();
      if (!agg) {
        throw new Error("aggregate 接口返回空 (可能后端未启动或权限不足)");
      }
      setData(agg);
      setUpdatedAt(new Date());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  // sparkline 数据 — 用 trend.calls 末 7 天 / trend.errors rate 末 7 天
  const callsSpark = React.useMemo(() => {
    return (data?.trend?.calls ?? []).slice(-7).map((d) => d.count);
  }, [data?.trend?.calls]);
  const errorSpark = React.useMemo(() => {
    return (data?.trend?.errors ?? []).slice(-7).map((d) => d.rate);
  }, [data?.trend?.errors]);

  return (
    <div className="space-y-5">
      {/* ─── Header ─── */}
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
            <span>公司综阅</span>
            <span className="text-border">/</span>
            <span>仪表盘</span>
          </div>
          <h1 className="mt-1.5 font-heading text-2xl font-semibold tracking-tight">
            公司运营全景
          </h1>
          <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
            员工 · 数字员工 · 流水线 · KB · 30 天调用 · 系统健康 · 排行 · 最近活动 — 一屏看完平台运行态。
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {updatedAt && (
            <span className="font-mono">
              更新于 {updatedAt.toLocaleTimeString("zh-CN", { hour12: false })}
            </span>
          )}
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1.5 hover:bg-muted/40 transition-colors disabled:opacity-50"
            aria-label="刷新"
          >
            <RefreshCw className={`size-3 ${loading ? "animate-spin" : ""}`} />
            <span>刷新</span>
          </button>
        </div>
      </header>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-500/40 bg-rose-500/5 p-4 text-sm text-rose-700 dark:text-rose-300">
          <AlertCircle className="size-4 mt-0.5 shrink-0" />
          <div>
            <div className="font-medium">数据加载失败</div>
            <div className="mt-0.5 text-xs font-mono opacity-80">{error}</div>
          </div>
        </div>
      )}

      {/* ─── ① 8 KPI ─── */}
      <section aria-label="核心指标">
        {data ? (
          <DashboardKpis
            kpis={data.kpis}
            callsSpark={callsSpark}
            errorSpark={errorSpark}
          />
        ) : (
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-[112px] rounded-xl border border-border bg-card animate-pulse" />
            ))}
          </div>
        )}
      </section>

      {/* ─── ② 30d trend + ③ health ─── 8/4 split */}
      <section className="grid gap-5 lg:grid-cols-12">
        <div className="lg:col-span-8">
          {data ? (
            <TrendChart
              calls={data.trend.calls}
              errors={data.trend.errors}
              tokens={data.trend.tokens}
              cost={data.trend.cost}
            />
          ) : (
            <div className="h-[420px] rounded-xl border border-border bg-card animate-pulse" />
          )}
        </div>
        <div className="lg:col-span-4">
          {data ? (
            <HealthMeters items={data.health} />
          ) : (
            <div className="h-[420px] rounded-xl border border-border bg-card animate-pulse" />
          )}
        </div>
      </section>

      {/* ─── ④ Top 5 三列 ─── */}
      <section aria-label="排行">
        {data ? (
          <div className="grid gap-3 lg:grid-cols-3">
            <TopList
              title="Top 5 数字员工"
              hint="24h 调用"
              icon={Bot}
              accent="oklch(0.67 0.15 41.62)"
              items={data.topAgents.map((a) => ({
                id: a.id,
                name: a.name,
                value: a.calls,
              }))}
              unit=" 次"
              emptyHint="近 24h 暂无调用"
            />
            <TopList
              title="Top 5 正式员工"
              hint="任务数"
              icon={Users}
              accent="oklch(0.67 0.15 248.92)"
              items={data.topEmployees.map((u) => ({
                id: u.id,
                name: u.name,
                value: u.tasks,
                avatarUrl: u.avatarUrl,
              }))}
              unit=" 任务"
              emptyHint="暂无员工数据"
            />
            <TopList
              title="Top 5 KB 文档"
              hint="命中次数"
              icon={FileText}
              accent="oklch(0.79 0.13 83.70)"
              items={data.topDocuments.map((d) => ({
                id: d.id,
                name: d.title,
                value: d.hitCount,
                sub: d.lastHitAt ? `最近命中 ${new Date(d.lastHitAt).toLocaleDateString("zh-CN")}` : null,
              }))}
              unit=" 命中"
              emptyHint="暂无被命中的文档"
            />
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-[260px] rounded-xl border border-border bg-card animate-pulse" />
            ))}
          </div>
        )}
      </section>

      {/* ─── ⑤ 最近活动 三列 ─── */}
      <section aria-label="最近活动">
        {data ? (
          <RecentActivity
            pipelines={data.recentPipelines}
            audit={data.recentAudit}
            sessions={data.recentSessions}
          />
        ) : (
          <div className="grid gap-3 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-[300px] rounded-xl border border-border bg-card animate-pulse" />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
