"use client";

import * as React from "react";
import { useAgent } from "../../_lib/data";
import { Brain, Clock, Database, Archive, Lock } from "lucide-react";

export function TabMemory({ id }: { id: string }) {
  const { agent, loading } = useAgent(id);
  if (loading) return <div className="h-48 rounded-2xl bg-muted/40 animate-pulse" />;
  if (!agent) return null;

  const m = agent.memoryLayers;
  const total = m.short + m.long + m.permanent;
  const layers = [
    { key: "short", label: "短期 · L1", icon: Clock, count: m.short, color: "amber" },
    { key: "long", label: "长期 · L2", icon: Database, count: m.long, color: "indigo" },
    { key: "permanent", label: "永久 · L3", icon: Archive, count: m.permanent, color: "emerald" },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-4">
        <div>
          <h3 className="flex items-center gap-2 text-[13px] font-medium tracking-tight text-foreground/65">
            <Brain className="size-4 text-foreground/45" />
            记忆三层
          </h3>
          <p className="mt-1 text-[13px] text-foreground/55 max-w-[55ch]">
            L1 是本会话,L2 是本 bot 长期积累,L3 是跨 bot 共享的永久记忆。
          </p>
        </div>
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-foreground/40">
          共 {total} 条
        </span>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        {layers.map((l) => {
          const pct = total === 0 ? 0 : Math.round((l.count / total) * 100);
          return (
            <article key={l.key} className="rounded-2xl bg-card p-5 ring-1 ring-border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[12.5px] font-medium text-foreground/80">
                  <l.icon className="size-3.5 text-foreground/40" />
                  {l.label}
                </div>
                <span className="font-mono text-[11px] text-foreground/40 tabular-nums">{pct}%</span>
              </div>
              <div className="mt-4 flex items-baseline gap-1.5">
                <span className="font-mono text-4xl font-semibold tabular-nums tracking-tight">
                  {l.count}
                </span>
                <span className="text-[12px] text-foreground/50">条</span>
              </div>
              <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-muted">
                <div className={`h-full bg-${l.color}-500/80`} style={{ width: `${pct}%` }} />
              </div>
            </article>
          );
        })}
      </div>

      <div className="flex items-start gap-2 rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-3 text-[12.5px] text-foreground/55">
        <Lock className="mt-0.5 size-3.5 shrink-0" />
        <p>
          记忆由系统自动抽取(L1→L2 在每日 consolidate 时落库),<strong className="text-foreground/70">不在此页手工编辑</strong>。
          如需修正记忆,请到 admin memory explorer 或直接 DELETE /api/v2/memory/:id。
        </p>
      </div>

      <SampleList agentId={agent.id} />
    </div>
  );
}

function SampleList({ agentId }: { agentId: string }) {
  const samples = [
    { layer: "L1", text: "用户本轮要求把首页 hero 改成三段叙事" },
    { layer: "L1", text: "客户偏好先发版本二,不要三版同发" },
    { layer: "L2", text: "署名要不要加大字号:历史口径是不要" },
    { layer: "L2", text: "工业品跨境客户最在意海关 HS Code 准确度" },
    { layer: "L3", text: "公司品牌色禁用纯紫,见 brand-v3.md 第 4 段" },
  ];
  return (
    <section>
      <h4 className="mb-3 text-[12px] font-medium text-foreground/55">最近的记忆样本(只读)</h4>
      <ul className="divide-y divide-border rounded-2xl ring-1 ring-border">
        {samples.map((s, i) => (
          <li key={i} className="flex items-start gap-4 px-5 py-3">
            <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-foreground/40 mt-0.5 w-6">
              {s.layer}
            </span>
            <p className="text-[13.5px] text-foreground/85 leading-relaxed">{s.text}</p>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] font-mono text-foreground/30">
        refs: agent={agentId.slice(0, 8)}…
      </p>
    </section>
  );
}
