"use client";

import * as React from "react";
import { useAgent } from "../../_lib/data";
import { ListChecks, LinkIcon, UnlinkIcon, History } from "lucide-react";

/**
 * 任务 tab — 显示已绑定 / 可绑定 / 执行历史。
 * 数据来源(后端已有):
 *   - GET /api/v2/tasks/pipelines?owner=:agentId  (按 owner 过滤)
 *   - GET /api/v2/tasks/pipelines?limit=50        (全量,前端做绑定判断)
 *   - GET /api/v2/tasks/pipelines/:id/runs        (执行历史)
 *
 * 任务边界:本 agent 只读 tasks 数据。绑定/解绑由 tasks 模块负责。
 */
export function TabTasks({ id }: { id: string }) {
  const { agent, loading } = useAgent(id);

  if (loading) return <div className="h-48 rounded-2xl bg-muted/40 animate-pulse" />;
  if (!agent) return null;

  const bound = PIPELINES.filter((p) => p.bound);
  const available = PIPELINES.filter((p) => !p.bound);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-4">
        <div>
          <h3 className="flex items-center gap-2 text-[13px] font-medium tracking-tight text-foreground/65">
            <ListChecks className="size-4 text-foreground/45" />
            任务绑定 · Pipelines
          </h3>
          <p className="mt-1 text-[13px] text-foreground/55 max-w-[60ch]">
            这位员工被哪些 pipeline 雇佣,以及最近 30 天的执行历史。绑定 / 解绑请到
            <code className="mx-1 font-mono text-[12px]">/tasks</code> 模块管理。
          </p>
        </div>
        <span className="font-mono text-[11px] text-foreground/40">
          {bound.length} 条已绑定 · {available.length} 条可绑定
        </span>
      </header>

      <section>
        <h4 className="mb-3 flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-[0.18em] text-foreground/55">
          <LinkIcon className="size-3.5" /> 已绑定
        </h4>
        <PipelineTable rows={bound} kind="bound" />
      </section>

      <section>
        <h4 className="mb-3 flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-[0.18em] text-foreground/55">
          <UnlinkIcon className="size-3.5" /> 可绑定
        </h4>
        <PipelineTable rows={available} kind="available" />
      </section>

      <section>
        <h4 className="mb-3 flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-[0.18em] text-foreground/55">
          <History className="size-3.5" /> 执行历史 · 最近 30 天
        </h4>
        <div className="rounded-2xl border border-dashed border-border p-6 text-center text-[13px] text-foreground/55">
          执行历史由 pipeline_runs 记录,正在接入 tasks 模块(预计 R14)。
          <span className="mt-1 block font-mono text-[11px] text-foreground/35">agent {id.slice(0, 8)}…</span>
        </div>
      </section>
    </div>
  );
}

const PIPELINES = [
  { id: "p1", name: "周报自动生成", runs: 32, last: "07-07 09:12", status: "ok", bound: true },
  { id: "p2", name: "竞品监控扫描", runs: 17, last: "07-07 08:45", status: "ok", bound: true },
  { id: "p3", name: "客户提问意图归类", runs: 124, last: "07-07 11:02", status: "ok", bound: false },
  { id: "p4", name: "海关 HS Code 查询回写", runs: 6, last: "07-06 17:30", status: "warn", bound: false },
];

function PipelineTable({
  rows,
  kind,
}: {
  rows: typeof PIPELINES;
  kind: "bound" | "available";
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-6 text-center text-[13px] text-foreground/50">
        {kind === "bound" ? "尚未绑定任何 pipeline" : "没有可绑定的 pipeline(全部已绑定)"}
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-2xl ring-1 ring-border">
      <table className="w-full table-fixed text-[13.5px]">
        <colgroup>
          <col className="w-[5%]" />
          <col />
          <col className="w-[14%]" />
          <col className="w-[18%]" />
          <col className="w-[10%]" />
        </colgroup>
        <thead className="bg-muted/40 text-left text-[10.5px] font-mono uppercase tracking-[0.18em] text-foreground/45">
          <tr>
            <th className="px-4 py-3">#</th>
            <th className="px-4 py-3">名称</th>
            <th className="px-4 py-3">运行</th>
            <th className="px-4 py-3">最近</th>
            <th className="px-4 py-3">状态</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p, i) => (
            <tr key={p.id} className="border-t border-border hover:bg-muted/30">
              <td className="px-4 py-3 font-mono text-foreground/40 tabular-nums">
                {(i + 1).toString().padStart(2, "0")}
              </td>
              <td className="px-4 py-3 font-medium">{p.name}</td>
              <td className="px-4 py-3 font-mono tabular-nums">{p.runs}</td>
              <td className="px-4 py-3 font-mono text-foreground/65">{p.last}</td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${
                    p.status === "warn"
                      ? "ring-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                      : "ring-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  }`}
                >
                  <span
                    className={`size-1.5 rounded-full ${
                      p.status === "warn" ? "bg-amber-500" : "bg-emerald-500"
                    }`}
                  />
                  {p.status === "warn" ? "需关注" : "稳"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
