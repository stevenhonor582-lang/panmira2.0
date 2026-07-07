import * as React from "react";
import { findAgent } from "../../_lib/data";
import { ListChecks } from "lucide-react";

const PIPELINES = [
  { id: "p1", name: "周报自动生成", runs: 32, last: "07-07 09:12", status: "ok" },
  { id: "p2", name: "竞品监控扫描", runs: 17, last: "07-07 08:45", status: "ok" },
  { id: "p3", name: "客户提问意图归类", runs: 124, last: "07-07 11:02", status: "ok" },
  { id: "p4", name: "海关 HS Code 查询回写", runs: 6, last: "07-06 17:30", status: "warn" },
];

export function TabTasks({ id }: { id: string }) {
  const agent = findAgent(id);
  if (!agent) return null;

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4 border-b border-border pb-4">
        <div>
          <h3 className="flex items-center gap-2 text-[13px] font-medium tracking-tight text-foreground/65">
            <ListChecks className="size-4 text-foreground/45" />
            参与的 Pipeline
          </h3>
          <p className="mt-1 text-[13px] text-foreground/55">
            这位 bot 被哪些编排链路雇佣过,可点击查看每条链路。
          </p>
        </div>
        <span className="font-mono text-[11px] text-foreground/40">
          {PIPELINES.length} 条
        </span>
      </header>

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
            {PIPELINES.map((p, i) => (
              <tr key={p.id} className="border-t border-border hover:bg-muted/30">
                <td className="px-4 py-3 font-mono text-foreground/40 tabular-nums">
                  {(i + 1).toString().padStart(2, "0")}
                </td>
                <td className="px-4 py-3 font-medium">{p.name}</td>
                <td className="px-4 py-3 font-mono tabular-nums">{p.runs}</td>
                <td className="px-4 py-3 font-mono text-foreground/65">{p.last}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${p.status === "warn" ? "ring-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300" : "ring-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"}`}>
                    <span className={`size-1.5 rounded-full ${p.status === "warn" ? "bg-amber-500" : "bg-emerald-500"}`} />
                    {p.status === "warn" ? "需关注" : "稳"}
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
