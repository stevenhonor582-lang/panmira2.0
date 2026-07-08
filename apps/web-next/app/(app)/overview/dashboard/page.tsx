// /overview/dashboard - 4 KPI + 趋势 + 事件流
"use client";

import * as React from "react";
import Link from "next/link";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Users,
  Bot,
  ListChecks,
  Coins,
  ArrowUpRight,
  RefreshCw,
} from "lucide-react";
import {
  fetchAgents,
  fetchCost,
  fetchPeople,
  fetchPipelines,
  fetchTasksStats,
  fetchActivityEvents,
  aggregateCostDaily,
} from "../_components/data";
import { KpiTile } from "../_components/kpi-tile";
import { EventStream } from "../_components/event-stream";

interface DashboardState {
  people: number;
  agents: number;
  agentsActive: number;
  pipelines: number;
  pipelinesActive: number;
  running: number;
  totalTokens: number;
  todayCost: number;
  costDaily: Array<{ date: string; total: number }>;
  events: Awaited<ReturnType<typeof fetchActivityEvents>>;
}

export default function DashboardPage() {
  const [state, setState] = React.useState<DashboardState | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [updatedAt, setUpdatedAt] = React.useState<Date | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [people, agents, pipelines, stats, cost, events] = await Promise.all([
        fetchPeople(),
        fetchAgents(),
        fetchPipelines(),
        fetchTasksStats(),
        fetchCost(),
        fetchActivityEvents(20),
      ]);
      const agentsActive = agents.filter((a) => a.isActive).length;
      const pipelinesActive = pipelines.filter((p) => p.enabled).length;
      const costDaily = cost ? aggregateCostDaily(cost.breakdown) : [];
      const todayStr = new Date().toISOString().slice(0, 10);
      const todayCost = costDaily.find((d) => d.date === todayStr)?.total ?? 0;
      const totalTokens = cost
        ? cost.breakdown
            .filter((b) => b.dimension === "token")
            .reduce((acc, b) => {
              const v = typeof b.cost === "string" ? parseFloat(b.cost) : b.cost;
              return acc + (Number.isFinite(v) ? v : 0);
            }, 0)
        : 0;

      setState({
        people: people.length,
        agents: agents.length,
        agentsActive,
        pipelines: pipelines.length,
        pipelinesActive,
        running: stats?.running ?? 0,
        totalTokens,
        todayCost,
        costDaily,
        events,
      });
      setUpdatedAt(new Date());
    } catch (err: any) {
      setError(err && typeof err.message === "string" ? err.message : (typeof err === "string" ? err : "数据加载失败,稍后重试"));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  // 构造 sparkline 数据 (从 costDaily 末尾取 7 个数据点)
  const tokenTrend = React.useMemo(() => {
    if (!state?.costDaily?.length) return [];
    return state.costDaily.slice(-7).map((d) => d.total);
  }, [state?.costDaily]);

  const peopleTrend = React.useMemo(() => {
    // 真人数量按周分布只能给一个静态 4 周示意 (数据无 history)
    return state ? [state.people - 1, state.people, state.people, state.people] : [];
  }, [state]);

  return (
    <div className="space-y-6">
      {/* 头部: 大标题 + 实时数据信号 */}
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
            <span>公司综阅</span>
            <span className="text-border">/</span>
            <span>仪表盘</span>
          </div>
          <h1 className="mt-1.5 font-heading text-2xl font-semibold tracking-tight">
            数字员工平台全景
          </h1>
          <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
            真人 · 数字员工 · 任务 · 资源消耗 · 最近事件 — 一屏看完平台运行态。
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
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/5 p-4 text-sm text-rose-700 dark:text-rose-400">
          数据加载失败: {error}。请检查后端连接或稍后重试。
        </div>
      )}

      {/* KPI 4-列 editorial grid (宽窄不一) */}
      <section
        aria-label="关键指标"
        className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-12"
      >
        <div className="lg:col-span-3">
          <KpiTile
            label="真人"
            value={state?.people ?? "-"}
            hint={state ? `其中 ${state.people === 1 ? "唯一" : ""}admin` : "加载中"}
            icon={Users}
            accent="chart-1"
            trend={peopleTrend}
          />
        </div>
        <div className="lg:col-span-3">
          <KpiTile
            label="数字员工"
            value={state?.agents ?? "-"}
            hint={state ? `${state.agentsActive} 活跃 · ${state.agents - state.agentsActive} 暂停` : "加载中"}
            icon={Bot}
            accent="chart-2"
          />
        </div>
        <div className="lg:col-span-3">
          <KpiTile
            label="流水线任务"
            value={state?.pipelines ?? "-"}
            hint={state ? `${state.pipelinesActive} 启用 · ${state.running} 运行中` : "加载中"}
            icon={ListChecks}
            accent="chart-3"
          />
        </div>
        <div className="lg:col-span-3">
          <KpiTile
            label="近 30 天消耗"
            value={state ? `${state.totalTokens.toFixed(2)}` : "-"}
            hint={state?.todayCost ? `今日 ${state.todayCost.toFixed(3)} 单位` : "等待首条 token 上报"}
            icon={Coins}
            accent="chart-4"
            trend={tokenTrend}
          />
        </div>
      </section>

      {/* 趋势图 + 事件流: 8/4 split (editorial) */}
      <section className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-8 rounded-xl border border-border bg-card p-5">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <h2 className="font-heading text-base font-semibold tracking-tight">
                资源消耗趋势
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                按日聚合 token / channel / knowledge 维度 (近 30 天)
              </p>
            </div>
            <Link
              href="/overview/billing"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              查看完整账目 <ArrowUpRight className="size-3" />
            </Link>
          </div>

          <div className="mt-4 h-72">
            {loading && !state?.costDaily?.length ? (
              <div className="h-full grid place-items-center text-sm text-muted-foreground">
                加载趋势数据…
              </div>
            ) : !state?.costDaily?.length ? (
              <div className="h-full grid place-items-center text-sm text-muted-foreground">
                暂无消耗数据 — token / channel 上报后会渲染趋势线
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={state.costDaily} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                  <defs>
                    <linearGradient id="costArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="oklch(0.67 0.15 41)" stopOpacity={0.4} />
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
                    labelStyle={{ color: "var(--muted-foreground)" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke="oklch(0.67 0.15 41)"
                    strokeWidth={2}
                    fill="url(#costArea)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="lg:col-span-4">
          <div className="flex items-baseline justify-between mb-3 px-1">
            <h2 className="font-heading text-base font-semibold tracking-tight">
              最近事件
            </h2>
            <Link
              href="/overview/logs"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              全部 <ArrowUpRight className="size-3" />
            </Link>
          </div>
          <EventStream events={state?.events ?? []} />
        </div>
      </section>
    </div>
  );
}
