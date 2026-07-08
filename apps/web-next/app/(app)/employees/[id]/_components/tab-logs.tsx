"use client";
import * as React from "react";
import { fetchLogSeries, type LogEntry } from "../../_lib/data";
import { ScrollText } from "lucide-react";

export function TabLogs({ id }: { id: string }) {
  const [series, setSeries] = React.useState<LogEntry[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchLogSeries(id)
      .then((rows) => {
        if (alive) setSeries(rows);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [id]);

  if (loading) {
    return <LoadingShell />;
  }

  if (series.length === 0) {
    return <EmptyState id={id} />;
  }

  const okCount = series.filter((s) => s.ok).length;
  const failCount = series.length - okCount;
  const avg = Math.round(series.reduce((s, x) => s + x.ms, 0) / series.length);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-4">
        <div>
          <h3 className="flex items-center gap-2 text-[13px] font-medium tracking-tight text-foreground/65">
            <ScrollText className="size-4 text-foreground/45" />
            执行历史 · 最近 12 小时
          </h3>
          <p className="mt-1 text-[13px] text-foreground/55">
            时间序列的柱高代表耗时,颜色代表成功 / 失败。
          </p>
        </div>
        <div className="flex items-center gap-3 text-[12px] text-foreground/55">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            {okCount} 成功
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-rose-500" />
            {failCount} 失败
          </span>
          <span className="font-mono tabular-nums">avg {avg} ms</span>
        </div>
      </header>

      <Chart series={series} />

      <div className="overflow-hidden rounded-2xl ring-1 ring-border">
        <table className="w-full text-[13px]">
          <thead className="bg-muted/40 text-left text-[10.5px] font-mono uppercase tracking-[0.18em] text-foreground/45">
            <tr>
              <th className="px-4 py-2.5">时间</th>
              <th className="px-4 py-2.5">任务</th>
              <th className="px-4 py-2.5 text-right">耗时</th>
              <th className="px-4 py-2.5 text-right">结果</th>
            </tr>
          </thead>
          <tbody>
            {[...series].reverse().slice(0, 12).map((s, i) => (
              <tr key={i} className="border-t border-border">
                <td className="px-4 py-2.5 font-mono text-foreground/70">
                  {new Date(s.ts).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })}
                </td>
                <td className="px-4 py-2.5">{s.task}</td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums">{s.ms} ms</td>
                <td className="px-4 py-2.5 text-right">
                  <span className={s.ok ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
                    {s.ok ? "ok" : "fail"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Chart({ series }: { series: LogEntry[] }) {
  const max = Math.max(...series.map((s) => s.ms), 100);
  return (
    <div className="rounded-2xl bg-card p-6 ring-1 ring-border">
      <div className="flex items-end gap-1 h-40">
        {series.map((s, i) => {
          const h = Math.max(8, (s.ms / max) * 100);
          return (
            <div
              key={i}
              className={`flex-1 rounded-t-md transition-all duration-500 ease-out ${s.ok ? "bg-emerald-500/85" : "bg-rose-500/85"}`}
              style={{ height: `${h}%`, animationDelay: `${i * 15}ms` }}
              title={`${s.task} · ${s.ms} ms`}
            />
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-between text-[10.5px] font-mono text-foreground/40">
        <span>{new Date(series[0].ts).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })}</span>
        <span>{new Date(series[series.length - 1].ts).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })}</span>
      </div>
    </div>
  );
}

function LoadingShell() {
  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between border-b border-border pb-4">
        <div className="space-y-2">
          <div className="h-4 w-32 rounded bg-muted/60 animate-pulse" />
          <div className="h-3 w-64 rounded bg-muted/40 animate-pulse" />
        </div>
      </header>
      <div className="h-40 rounded-2xl bg-muted/40 animate-pulse" />
      <div className="h-48 rounded-2xl bg-muted/40 animate-pulse" />
    </div>
  );
}

function EmptyState({ id }: { id: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-border py-20 text-center">
      <ScrollText className="size-6 text-foreground/35" />
      <span className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-foreground/40">
        暂无日志数据
      </span>
      <p className="max-w-[44ch] text-sm text-foreground/60">
        后端尚无 per-agent log series endpoint (预计 P10 后续接入)。
        {id ? (
          <span className="block mt-1 font-mono text-[11px] text-foreground/35">
            agent id · {id.slice(0, 8)}…
          </span>
        ) : null}
      </p>
    </div>
  );
}
