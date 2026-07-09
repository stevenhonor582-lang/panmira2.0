"use client";

import * as React from "react";
import Link from "next/link";
import { useAgent } from "../../_lib/data";
import { api } from "@/lib/api";
import {
  Brain, Clock, Database, Archive, Lock, ChevronDown, ChevronRight, ExternalLink, Loader2, Sparkles,
} from "lucide-react";

/**
 * R28-C: 记忆 tab — 单一顶部统计 + 主题归纳(规则引擎) + 锁当前 Agent。
 *
 * 数据源:
 *   GET /api/v2/foundation/memory/l{1,2,3}?bot_id=<agent.id>&limit=5
 *   返回 { total, memories: [...] }
 *   GET /api/v2/foundation/memory/l1?bot_id=<agent.id>&limit=100  (取最近 100 条做归纳)
 *
 * ⑨ 优化:
 * - 删重复数量:统计只留顶部一处(总计 + 三层卡),折叠区行不再重复"X 条"。
 * - 主题归纳:对近 100 条按关键词聚类(规则引擎,不调 LLM),展示 top 5 主题。
 * - 锁当前 Agent:所有查询带 bot_id,跳转链接带 botId。
 */

interface MemoryItem {
  id: string;
  layer: number;
  subject: string | null;
  content: string | null;
  preview: string | null;
  importance: number | null;
  createdAt: string | null;
  botId?: string | null;
  type?: string | null;
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
          `/api/v2/foundation/memory/l${layer}?bot_id=${encodeURIComponent(botId)}&limit=5`,
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

// ── ⑨ 主题归纳(规则引擎) ─────────────────────────────────────────────────────
// 关键词 → 主题。按文本命中归类,统计 top 5。不调 LLM。
const THEME_RULES: { theme: string; keywords: string[] }[] = [
  { theme: "客户偏好", keywords: ["客户", "偏好", "需求", "买家", "询盘", "买方", "客诉", "用户反馈"] },
  { theme: "技术决策", keywords: ["技术", "架构", "选型", "方案", "代码", "API", "部署", "重构", "bug", "实现"] },
  { theme: "品牌规范", keywords: ["品牌", "规范", "调性", "语气", "风格", "排版", "去 AI", "视觉", "VI"] },
  { theme: "任务进度", keywords: ["任务", "进度", "todo", "待办", "排期", "里程碑", "完成", "推进", "交付"] },
  { theme: "产品知识", keywords: ["产品", "功能", "规格", "参数", "手册", "文档", "知识库"] },
  { theme: "销售转化", keywords: ["销售", "转化", "报价", "跟进", "成单", "线索", "CRM", "话术"] },
  { theme: "复盘反思", keywords: ["复盘", "反思", "总结", "教训", "改进", "经验", "回顾"] },
  { theme: "人事协作", keywords: ["团队", "同事", "分工", "协作", "权限", "角色", "owner"] },
];

interface ThemeStat {
  theme: string;
  count: number;
}

function classifyThemes(memories: MemoryItem[]): ThemeStat[] {
  const counter = new Map<string, number>();
  for (const m of memories) {
    const text = `${m.subject ?? ""} ${m.content ?? ""} ${m.preview ?? ""}`.toLowerCase();
    if (!text.trim()) continue;
    for (const rule of THEME_RULES) {
      if (rule.keywords.some((k) => text.includes(k.toLowerCase()))) {
        counter.set(rule.theme, (counter.get(rule.theme) ?? 0) + 1);
        break; // 一条只归一个主题(优先靠前的规则)
      }
    }
  }
  return Array.from(counter.entries())
    .map(([theme, count]) => ({ theme, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

export function TabMemory({ id }: { id: string }) {
  const { agent, loading } = useAgent(id);

  const l1 = useMemoryLayer(1, agent?.id ?? null);
  const l2 = useMemoryLayer(2, agent?.id ?? null);
  const l3 = useMemoryLayer(3, agent?.id ?? null);

  // ⑨ 拉近 100 条 L1+L2 做主题归纳
  const [recentPool, setRecentPool] = React.useState<MemoryItem[]>([]);
  React.useEffect(() => {
    if (!agent?.id) return;
    let alive = true;
    Promise.all([
      api<{ memories?: MemoryItem[] } | MemoryItem[]>(`/api/v2/foundation/memory/l1?bot_id=${encodeURIComponent(agent.id)}&limit=100`).catch(() => ({ memories: [] })),
      api<{ memories?: MemoryItem[] } | MemoryItem[]>(`/api/v2/foundation/memory/l2?bot_id=${encodeURIComponent(agent.id)}&limit=100`).catch(() => ({ memories: [] })),
    ]).then(([r1, r2]) => {
      if (!alive) return;
      const a = (r1 as any)?.memories ?? (Array.isArray(r1) ? r1 : []);
      const b = (r2 as any)?.memories ?? (Array.isArray(r2) ? r2 : []);
      const merged = [...a, ...b]
        .sort((x, y) => (y.createdAt ?? "").localeCompare(x.createdAt ?? ""))
        .slice(0, 100);
      setRecentPool(merged);
    });
    return () => { alive = false; };
  }, [agent?.id]);

  const themes = React.useMemo(() => classifyThemes(recentPool), [recentPool]);

  if (loading) return <div className="h-48 rounded-2xl bg-muted/40 animate-pulse" />;
  if (!agent) return null;

  const total = l1.count + l2.count + l3.count;
  const layers = [
    { key: "L1", label: "短期 · L1", icon: Clock, count: l1.count, color: "amber", data: l1, route: "l1" },
    { key: "L2", label: "长期 · L2", icon: Database, count: l2.count, color: "indigo", data: l2, route: "l2" },
    { key: "L3", label: "永久 · L3", icon: Archive, count: l3.count, color: "emerald", data: l3, route: "l3" },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-4">
        <div>
          <h3 className="flex items-center gap-2 text-[13px] font-medium tracking-tight text-foreground/65">
            <Brain className="size-4 text-foreground/45" />
            记忆三层
            <span className="inline-flex items-center gap-1 rounded-md bg-foreground/5 px-1.5 py-0.5 font-mono text-[10.5px] text-foreground/50">
              <Lock className="size-3" />已锁定本 Agent
            </span>
          </h3>
          <p className="mt-1 text-[13px] text-foreground/55 max-w-[55ch]">
            L1 是本会话,L2 是本 bot 长期积累,L3 是跨 bot 共享的永久记忆。已锁定当前 Agent,不显示全局数据。
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-foreground/40">
            共 {total} 条
          </span>
          <Link
            href={`/foundation/memory/l1?botId=${encodeURIComponent(agent.id)}`}
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[12px] font-medium ring-1 ring-border text-foreground/70 hover:bg-muted/60 hover:text-foreground transition-colors"
            data-testid="memory-jump-full"
          >
            <ExternalLink className="size-3.5" />
            在记忆模块查看完整
          </Link>
        </div>
      </header>

      {/* ⑨ 唯一统计区:三层卡(总计在 header) */}
      <div className="grid gap-4 md:grid-cols-3" data-testid="memory-stats">
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

      {/* ⑨ 主题归纳(规则引擎) */}
      <MemorySummary themes={themes} total={recentPool.length} />

      <div className="flex items-start gap-2 rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-3 text-[12.5px] text-foreground/55">
        <Lock className="mt-0.5 size-3.5 shrink-0" />
        <p>
          记忆由系统自动抽取(L1→L2 在每日 consolidate 时落库),<strong className="text-foreground/70">不在此页手工编辑</strong>。
          如需修正记忆,请到记忆模块或直接 DELETE /api/v2/foundation/memory/:id。
        </p>
      </div>

      {/* 三层可展开阅读视图(行内不再重复条数) */}
      <div className="space-y-3" data-testid="memory-layers-readonly">
        {layers.map((l) => (
          <LayerSection key={l.key} layer={l} agentId={agent.id} />
        ))}
      </div>
    </div>
  );
}

function MemorySummary({ themes, total }: { themes: ThemeStat[]; total: number }) {
  return (
    <section className="rounded-2xl bg-gradient-to-br from-foreground/[0.03] to-transparent ring-1 ring-border p-5">
      <div className="flex items-center gap-2 text-[12.5px] font-medium text-foreground/70">
        <Sparkles className="size-3.5 text-violet-500/70" />
        主题归纳
        <span className="font-mono text-[10.5px] font-normal text-foreground/40">
          基于近 {total} 条 · 规则引擎
        </span>
      </div>
      {total === 0 ? (
        <p className="mt-3 text-[12px] text-foreground/45">暂无足够记忆做归纳 — 这个员工还没有积累 L1/L2 数据。</p>
      ) : themes.length === 0 ? (
        <p className="mt-3 text-[12px] text-foreground/45">近 {total} 条记忆未命中已知主题分类(客户/技术/品牌等),建议补充更具体的主题描述。</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {themes.map((t) => {
            const pct = total > 0 ? Math.round((t.count / total) * 100) : 0;
            return (
              <li key={t.theme} className="flex items-center gap-3">
                <span className="w-20 shrink-0 text-[12px] font-medium text-foreground/75">{t.theme}</span>
                <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-violet-500/70"
                    style={{ width: `${Math.max(pct, 4)}%` }}
                  />
                </div>
                <span className="w-16 shrink-0 text-right font-mono text-[11px] tabular-nums text-foreground/55">
                  {t.count} 条 · {pct}%
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-3 text-[10.5px] text-foreground/40">
        归纳按关键词聚类自动生成,非 LLM 总结,仅作概览参考。
      </p>
    </section>
  );
}

function LayerSection({
  layer,
  agentId,
}: {
  layer: { key: string; label: string; route: string; count: number; data: MemoryLayerData };
  agentId: string;
}) {
  const [open, setOpen] = React.useState(false);
  const hasItems = layer.data.items.length > 0;

  return (
    <div className="overflow-hidden rounded-2xl ring-1 ring-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={!hasItems && !layer.data.loading}
        className="flex w-full items-center justify-between px-5 py-3.5 text-left transition-colors hover:bg-muted/40 disabled:cursor-default disabled:hover:bg-transparent"
        aria-expanded={open}
        data-testid={`memory-layer-toggle-${layer.key}`}
      >
        <div className="flex items-center gap-2.5">
          {hasItems || layer.data.loading ? (
            open ? <ChevronDown className="size-3.5 text-foreground/45" /> : <ChevronRight className="size-3.5 text-foreground/45" />
          ) : (
            <span className="size-3.5" />
          )}
          <span className="text-[12.5px] font-medium text-foreground/80">{layer.label}</span>
        </div>
        {hasItems && (
          <Link
            href={`/foundation/memory/${layer.route}?botId=${encodeURIComponent(agentId)}`}
            onClick={(e) => e.stopPropagation()}
            className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-foreground/40 hover:text-foreground/70 transition-colors"
          >
            查看全部 →
          </Link>
        )}
      </button>

      {open && (
        <div className="border-t border-border bg-muted/10">
          {layer.data.loading ? (
            <div className="flex items-center gap-2 px-5 py-4 text-[12.5px] text-foreground/50">
              <Loader2 className="size-3.5 animate-spin" /> 加载最近记忆…
            </div>
          ) : hasItems ? (
            <ul className="divide-y divide-border">
              {layer.data.items.map((m) => (
                <li key={m.id} className="flex items-start gap-4 px-5 py-3">
                  <span className="mt-0.5 w-12 shrink-0 font-mono text-[10.5px] uppercase tracking-[0.16em] text-foreground/40">
                    {m.createdAt ? formatShortDate(m.createdAt) : "—"}
                  </span>
                  <div className="flex-1 min-w-0">
                    {m.subject && (
                      <p className="text-[12.5px] font-medium text-foreground/75 truncate">{m.subject}</p>
                    )}
                    <p className="text-[13px] leading-relaxed text-foreground/85 line-clamp-2">
                      {(m.preview || m.content || "—").slice(0, 80)}
                    </p>
                  </div>
                  {m.importance !== null && m.importance !== undefined && (
                    <span className="shrink-0 rounded-md bg-foreground/5 px-1.5 py-0.5 font-mono text-[10.5px] tabular-nums text-foreground/55">
                      {m.importance.toFixed(2)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-5 py-4 text-[12.5px] text-foreground/50">
              暂无{layer.label}记忆 — 这个员工还没有在这一层产生数据。
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatShortDate(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameYear = d.getFullYear() === now.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return sameYear ? `${mm}-${dd} ${hh}:${mi}` : `${d.getFullYear()}-${mm}-${dd}`;
  } catch {
    return iso.slice(0, 10);
  }
}
