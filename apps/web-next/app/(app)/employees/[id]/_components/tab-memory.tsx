"use client";

import * as React from "react";
import { useAgent } from "../../_lib/data";
import { api } from "@/lib/api";
import { Brain, Clock, Database, Archive, Lock } from "lucide-react";

/**
 * R24: 记忆 tab — 接真实 memories。
 * 从 GET /api/v2/foundation/memory/l1|l2|l3?bot_id=<agent.id> 拉最近 3 条。
 * 没数据 → "暂无记忆",不显示 mock。
 */

interface MemoryItem {
  id: string;
  layer: number;
  subject: string | null;
  content: string | null;
  preview: string | null;
  importance: number | null;
  createdAt: string | null;
}

interface MemoryLayerData {
  count: number;
  items: MemoryItem[];
  loading: boolean;
}

function useMemoryLayer(layer: 1 | 2 | 3, botId: string | null): MemoryLayerData {
  const [data, setData] = React.useState<MemoryLayerData>({ count: 0, items: [], loading: true });

  React.useEffect(() => {
    if (!botId) {
      setData({ count: 0, items: [], loading: false });
      return;
    }
    let alive = true;
    setData((d) => ({ ...d, loading: true }));
    (async () => {
      try {
        const res = await api<{ total?: number; memories?: MemoryItem[] } | MemoryItem[]>(
          `/api/v2/foundation/memory/l${layer}?bot_id=${encodeURIComponent(botId)}&limit=3`,
        );
        if (!alive) return;
        const items = (res as any)?.memories ?? (Array.isArray(res) ? res : []);
        const total = (res as any)?.total ?? items.length;
        setData({ count: total, items, loading: false });
      } catch {
        if (alive) setData({ count: 0, items: [], loading: false });
      }
    })();
    return () => { alive = false; };
  }, [layer, botId]);

  return data;
}

export function TabMemory({ id }: { id: string }) {
  const { agent, loading } = useAgent(id);

  const l1 = useMemoryLayer(1, agent?.id ?? null);
  const l2 = useMemoryLayer(2, agent?.id ?? null);
  const l3 = useMemoryLayer(3, agent?.id ?? null);

  if (loading) return <div className="h-48 rounded-2xl bg-muted/40 animate-pulse" />;
  if (!agent) return null;

  const total = l1.count + l2.count + l3.count;
  const layers = [
    { key: "L1", label: "短期 · L1", icon: Clock, count: l1.count, color: "amber", data: l1 },
    { key: "L2", label: "长期 · L2", icon: Database, count: l2.count, color: "indigo", data: l2 },
    { key: "L3", label: "永久 · L3", icon: Archive, count: l3.count, color: "emerald", data: l3 },
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
                {l.data.loading ? (
                  <span className="text-[12px] text-foreground/40">加载中…</span>
                ) : (
                  <>
                    <span className="font-mono text-4xl font-semibold tabular-nums tracking-tight">
                      {l.count}
                    </span>
                    <span className="text-[12px] text-foreground/50">条</span>
                  </>
                )}
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

      <SampleList layers={layers} agentId={agent.id} />
    </div>
  );
}

function SampleList({
  layers,
  agentId,
}: {
  layers: Array<{ key: string; label: string; data: MemoryLayerData }>;
  agentId: string;
}) {
  const hasAny = layers.some((l) => l.data.items.length > 0);
  if (!hasAny) {
    return (
      <section>
        <h4 className="mb-3 text-[12px] font-medium text-foreground/55">最近的记忆样本(只读)</h4>
        <div className="rounded-2xl border border-dashed border-border p-6 text-center text-[13px] text-foreground/50">
          暂无记忆 — 这个员工还没有产生记忆数据。
          <span className="mt-1 block font-mono text-[11px] text-foreground/35">agent {agentId.slice(0, 8)}…</span>
        </div>
      </section>
    );
  }

  return (
    <section>
      <h4 className="mb-3 text-[12px] font-medium text-foreground/55">最近的记忆样本(只读)</h4>
      <div className="space-y-4">
        {layers.map((l) => {
          if (l.data.items.length === 0) return null;
          return (
            <div key={l.key}>
              <h5 className="mb-2 flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.18em] text-foreground/45">
                <span>{l.label}</span>
                <span className="text-foreground/30">· {l.data.items.length} 条样本</span>
              </h5>
              <ul className="divide-y divide-border rounded-2xl ring-1 ring-border">
                {l.data.items.map((m) => (
                  <li key={m.id} className="flex items-start gap-4 px-5 py-3">
                    <span className="mt-0.5 w-6 shrink-0 font-mono text-[11px] uppercase tracking-[0.18em] text-foreground/40">
                      {l.key}
                    </span>
                    <div className="flex-1 min-w-0">
                      {m.subject && (
                        <p className="text-[12.5px] font-medium text-foreground/75">{m.subject}</p>
                      )}
                      <p className="text-[13.5px] leading-relaxed text-foreground/85">
                        {(m.preview || m.content || "—").slice(0, 120)}
                      </p>
                      <div className="mt-1 flex items-center gap-3 text-[11px] text-foreground/40">
                        {m.importance !== null && (
                          <span className="font-mono">重要度 {m.importance.toFixed(2)}</span>
                        )}
                        {m.createdAt && (
                          <span className="font-mono">
                            {new Date(m.createdAt).toLocaleString("zh-CN", { hour12: false })}
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] font-mono text-foreground/30">
        refs: agent={agentId.slice(0, 8)}…
      </p>
    </section>
  );
}
