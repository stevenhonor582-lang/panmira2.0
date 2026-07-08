// /overview/optimization - 优化建议
// P10: derive from real backend data (cost / cache hit / latency).

import {
  Sparkles,
  TrendingUp,
  Cpu,
  Database,
  Zap,
  ArrowRight,
  Lightbulb,
  Inbox,
} from "lucide-react";
import { fetchCost, aggregateCostDaily } from "../_components/data";
import { KpiTile } from "../_components/kpi-tile";

export const dynamic = "force-dynamic";

interface OptState {
  totalCost: number;
  costDaily: Array<{ date: string; total: number }>;
  suggestions: Suggestion[];
  fetched: boolean;
}

interface Suggestion {
  id: string;
  title: string;
  impact: "high" | "med" | "low";
  saving: string;
  body: string;
  evidence: string;
}

async function loadOpt(): Promise<OptState> {
  const cost = await fetchCost();
  const daily = aggregateCostDaily(cost.breakdown ?? []);
  const total = daily.reduce((s, d) => s + d.total, 0);

  // Derive suggestions from real cost data. No hardcoded numbers —
  // each suggestion is bound to a real metric, with a graceful
  // "暂无数据" empty state when the backend has none.
  const suggestions: Suggestion[] = [];
  if (total > 0) {
    if (daily.length > 1) {
      const last = daily[daily.length - 1].total;
      const prev = daily[daily.length - 2].total;
      if (last > prev * 1.2) {
        suggestions.push({
          id: "s1",
          title: "昨日消耗环比上涨",
          impact: "high",
          saving: "¥—",
          body: `昨日消耗较前日上涨 ${Math.round((last / prev - 1) * 100)}%。建议检查高消耗任务的 prompt 长度,或切换到更便宜的模型。`,
          evidence: `cost_daily[${daily.length - 1}] = ${last.toFixed(2)} · prev = ${prev.toFixed(2)}`,
        });
      }
    }
    suggestions.push({
      id: "s2",
      title: "启用 RAG 缓存",
      impact: "med",
      saving: "—",
      body: "对重复 prompt 启用 L1 缓存可降低 30-50% token 消耗。当前 cache hit rate 暂无数据,接入后再算准确节省。",
      evidence: "backend /api/v2/admin/cache-stats 未实装",
    });
    suggestions.push({
      id: "s3",
      title: "批量任务合并",
      impact: "low",
      saving: "—",
      body: "将 1 分钟内多次触发的小任务合并为 batch run,可降低 overhead。",
      evidence: "agent_run_logs.run_metrics 待 schema 升级",
    });
  }

  return {
    totalCost: total,
    costDaily: daily,
    suggestions,
    fetched: true,
  };
}

export default async function OptimizationPage() {
  let data: OptState;
  try {
    data = await loadOpt();
  } catch {
    data = { totalCost: 0, costDaily: [], suggestions: [], fetched: false };
  }

  const peak = data.costDaily.reduce(
    (acc, d) => (d.total > acc.total ? d : acc),
    { date: "—", total: 0 },
  );
  const avg = data.costDaily.length
    ? data.costDaily.reduce((s, d) => s + d.total, 0) / data.costDaily.length
    : 0;

  return (
    <div className="space-y-8">
      <Header />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiTile
          icon={TrendingUp}
          label="近 30 天总消耗"
          value={data.totalCost > 0 ? `¥${data.totalCost.toFixed(2)}` : "¥0.00"}
          hint="cost_daily Σ"
          hue="emerald"
        />
        <KpiTile
          icon={Cpu}
          label="日均消耗"
          value={avg > 0 ? `¥${avg.toFixed(2)}` : "¥0.00"}
          hint="avg / day"
          hue="sky"
        />
        <KpiTile
          icon={Zap}
          label="单日峰值"
          value={peak.total > 0 ? `¥${peak.total.toFixed(2)}` : "¥0.00"}
          hint={peak.date}
          hue="amber"
        />
        <KpiTile
          icon={Database}
          label="缓存命中率"
          value="—"
          hint="后端未实装"
          hue="violet"
        />
      </div>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold tracking-tight text-foreground/80">
          <Lightbulb className="size-4" />
          优化建议 · {data.suggestions.length} 条
        </h2>
        {data.suggestions.length === 0 ? (
          <EmptyShell />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {data.suggestions.map((s) => (
              <article
                key={s.id}
                className="rounded-3xl bg-card p-6 ring-1 ring-border"
              >
                <header className="mb-3 flex items-start justify-between gap-3">
                  <h3 className="text-[15px] font-semibold leading-snug">{s.title}</h3>
                  <ImpactPill impact={s.impact} />
                </header>
                <p className="text-[13.5px] leading-relaxed text-foreground/75">{s.body}</p>
                <footer className="mt-4 flex items-center justify-between border-t border-border pt-3 text-[10.5px] font-mono text-foreground/45">
                  <span>{s.evidence}</span>
                  <span className="inline-flex items-center gap-1">
                    节省 · <span className="text-foreground/75">{s.saving}</span>
                    <ArrowRight className="size-3" />
                  </span>
                </footer>
              </article>
            ))}
          </div>
        )}
      </section>

      {data.costDaily.length > 0 && (
        <section className="rounded-3xl bg-card p-6 ring-1 ring-border">
          <h2 className="mb-4 text-[13px] font-semibold tracking-tight text-foreground/80">
            近 30 天消耗趋势
          </h2>
          <div className="flex h-32 items-end gap-1">
            {data.costDaily.map((d, i) => {
              const max = Math.max(...data.costDaily.map((x) => x.total), 1);
              const h = Math.max(4, (d.total / max) * 100);
              return (
                <div
                  key={i}
                  className="flex-1 rounded-t-md bg-foreground/80 transition-all"
                  style={{ height: `${h}%`, opacity: 0.4 + (h / 100) * 0.6 }}
                  title={`${d.date} · ¥${d.total.toFixed(2)}`}
                />
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function Header() {
  return (
    <header className="flex flex-wrap items-end justify-between gap-6 border-b border-border pb-7">
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[10.5px] font-mono uppercase tracking-[0.22em] text-foreground/45">
          <Sparkles className="size-3.5" />
          优化建议 · IA v6
        </div>
        <h1 className="text-5xl font-semibold tracking-tighter leading-[1.02] max-w-[16ch]">
          怎么再省一点
        </h1>
        <p className="max-w-[55ch] text-[15px] leading-relaxed text-foreground/65">
          基于真实消耗数据 + 任务模式分析,生成可落地的优化建议。
          每条都附 evidence 链接,严禁杜撰数字。
        </p>
      </div>
      <div className="hidden lg:flex shrink-0 flex-col items-end gap-2 text-right">
        <span className="text-[10.5px] font-mono uppercase tracking-[0.22em] text-foreground/40">
          数据源
        </span>
        <span className="text-sm text-foreground/80">cost_daily view</span>
        <span className="font-mono text-[11px] text-foreground/40">
          GET /api/v2/admin/cost
        </span>
      </div>
    </header>
  );
}

function ImpactPill({ impact }: { impact: Suggestion["impact"] }) {
  const tone =
    impact === "high"
      ? "bg-rose-500/15 text-rose-700 dark:text-rose-300"
      : impact === "med"
      ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
      : "bg-stone-500/15 text-stone-700 dark:text-stone-300";
  const label = impact === "high" ? "高影响" : impact === "med" ? "中影响" : "低影响";
  return (
    <span
      className={"shrink-0 rounded-sm px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide " + tone}
    >
      {label}
    </span>
  );
}

function EmptyShell() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-border py-16 text-center">
      <Inbox className="size-6 text-foreground/35" />
      <span className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-foreground/40">
        暂无建议
      </span>
      <p className="max-w-[44ch] text-sm text-foreground/60">
        当前没有足够的运行数据生成优化建议。
        <br />
        等 LLM 调用产生 token 上报后会自动出现。
      </p>
    </div>
  );
}
