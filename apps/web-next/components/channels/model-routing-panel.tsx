"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  ArrowDown,
  ArrowUp,
  Crown,
  GitBranch,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * ModelRoutingPanel — 大模型内置路由面板 (R29-B)
 *
 * 这是「模型路由」(哪个 LLM 优先 / fallback), 不是 pipeline 路由。
 *
 * 数据源: provider_configs 表, is_default 决定主模型。
 * 后端没有 priority 字段 → 前端用顺序数组(localStorage)管理链序。
 *
 * 持久化策略:
 *  - 主模型标记 → PATCH /api/providers/:id { isDefault: true } (后端落库)
 *  - 链顺序 / 策略 / fallback 开关 → localStorage (前端策略层, 不入后端)
 */

type RouteProvider = {
  id: string;
  name: string;
  model: string;
  type: string;
  isDefault: boolean;
  latencyMs: number | null;
  hasApiKey: boolean;
  lastError: string | null;
};

type Strategy = "sequential" | "optimal" | "round-robin";

const LS_ORDER = "panmira:model-route-order";
const LS_STRATEGY = "panmira:model-route-strategy";
const LS_FALLBACK = "panmira:model-route-fallback";

const STRATEGY_OPTIONS: { v: Strategy; label: string; hint: string }[] = [
  { v: "sequential", label: "顺序 · 按优先级依次尝试", hint: "主模型失败才切下一个" },
  { v: "optimal", label: "最优 · 选延迟最低的", hint: "实时按 latency 选" },
  { v: "round-robin", label: "负载 · 轮询分流", hint: "均匀分摊请求量" },
];

export function ModelRoutingPanel({
  providers,
  onSetDefault,
}: {
  providers: RouteProvider[];
  onSetDefault: (id: string) => Promise<void>;
}) {
  const [order, setOrder] = React.useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(localStorage.getItem(LS_ORDER) || "[]");
    } catch {
      return [];
    }
  });
  const [strategy, setStrategy] = React.useState<Strategy>(() => {
    if (typeof window === "undefined") return "sequential";
    return (localStorage.getItem(LS_STRATEGY) as Strategy) || "sequential";
  });
  const [autoFallback, setAutoFallback] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem(LS_FALLBACK) !== "off";
  });
  const [busy, setBusy] = React.useState<string | null>(null);

  // 同步顺序: 删除/新增 provider 后清理 + 追加新 provider
  React.useEffect(() => {
    const ids = providers.map((p) => p.id);
    setOrder((prev) => {
      const idSet = new Set(ids);
      const kept = prev.filter((id) => idSet.has(id));
      const missing = ids.filter((id) => !kept.includes(id));
      const next = [...kept, ...missing];
      return next.length === prev.length && next.every((v, i) => v === prev[i])
        ? prev
        : next;
    });
  }, [providers]);

  React.useEffect(() => {
    localStorage.setItem(LS_ORDER, JSON.stringify(order));
  }, [order]);
  React.useEffect(() => {
    localStorage.setItem(LS_STRATEGY, strategy);
  }, [strategy]);
  React.useEffect(() => {
    localStorage.setItem(LS_FALLBACK, autoFallback ? "on" : "off");
  }, [autoFallback]);

  const sorted = order
    .map((id) => providers.find((p) => p.id === id))
    .filter((x): x is RouteProvider => !!x);

  async function makeDefault(id: string) {
    setBusy(id);
    try {
      await onSetDefault(id);
    } finally {
      setBusy(null);
    }
  }

  function move(idx: number, dir: -1 | 1) {
    setOrder((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }

  return (
    <section className="rounded-sm ring-1 ring-border bg-card/40">
      <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <GitBranch className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold tracking-tight">模型路由</h3>
          <span className="text-[10px] text-muted-foreground font-mono">
            LLM fallback chain
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground font-mono">
          {sorted.length} 个模型
        </span>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4">
        {/* 左: 优先级链 */}
        <div>
          <div className="text-[11px] font-medium text-muted-foreground mb-2 uppercase tracking-wide">
            优先级链
          </div>
          <ol className="space-y-1.5">
            {sorted.map((p, i) => (
              <li
                key={p.id}
                className={cn(
                  "flex items-center gap-2 rounded-sm ring-1 ring-border bg-background/50 px-2.5 py-2",
                  p.isDefault && "ring-foreground/40 bg-foreground/5",
                )}
              >
                <span className="text-[11px] font-mono text-muted-foreground w-5 text-right">
                  {i + 1}.
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[12.5px] font-medium truncate">
                      {p.name}
                    </span>
                    {p.isDefault ? (
                      <span className="text-[9px] font-mono uppercase bg-foreground text-background px-1 py-0.5 rounded-sm">
                        默认
                      </span>
                    ) : null}
                    {!p.hasApiKey ? (
                      <span className="text-[9px] font-mono uppercase bg-amber-500/15 text-amber-700 dark:text-amber-300 px-1 py-0.5 rounded-sm">
                        无 Key
                      </span>
                    ) : null}
                  </div>
                  <div className="text-[10px] text-muted-foreground font-mono truncate">
                    {p.model || "—"} ·{" "}
                    {p.latencyMs !== null ? `${p.latencyMs}ms` : "未测"}
                    {p.lastError ? " · 失败" : ""}
                  </div>
                </div>
                <div className="flex items-center gap-0.5">
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label="上移"
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                  >
                    <ArrowUp className="size-3" />
                  </Button>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label="下移"
                    disabled={i === sorted.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    <ArrowDown className="size-3" />
                  </Button>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label="设为默认"
                    title="设为默认模型"
                    disabled={p.isDefault || !p.hasApiKey || busy === p.id}
                    onClick={() => makeDefault(p.id)}
                    className="hover:text-amber-600"
                  >
                    {busy === p.id ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Crown className="size-3" />
                    )}
                  </Button>
                </div>
              </li>
            ))}
            {sorted.length === 0 ? (
              <li className="text-[11px] text-muted-foreground py-4 text-center">
                尚未配置任何模型 · 点击右上「新增服务商」
              </li>
            ) : null}
          </ol>
        </div>

        {/* 右: 策略 */}
        <div>
          <div className="text-[11px] font-medium text-muted-foreground mb-2 uppercase tracking-wide">
            路由策略
          </div>
          <div className="space-y-1.5">
            {STRATEGY_OPTIONS.map((opt) => (
              <label
                key={opt.v}
                className={cn(
                  "flex items-start gap-2 rounded-sm ring-1 ring-border bg-background/50 px-2.5 py-2 cursor-pointer",
                  strategy === opt.v && "ring-foreground/40 bg-foreground/5",
                )}
              >
                <input
                  type="radio"
                  name="model-strategy"
                  className="mt-0.5"
                  checked={strategy === opt.v}
                  onChange={() => setStrategy(opt.v)}
                />
                <div className="min-w-0">
                  <div className="text-[12.5px] font-medium">{opt.label}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {opt.hint}
                  </div>
                </div>
              </label>
            ))}
          </div>

          <label className="mt-3 flex items-center gap-2 text-[12px]">
            <input
              type="checkbox"
              checked={autoFallback}
              onChange={(e) => setAutoFallback(e.target.checked)}
            />
            <span>自动 fallback · 主模型失败自动切备用</span>
          </label>

          <div className="mt-3 text-[10px] text-muted-foreground font-mono leading-relaxed">
            链顺序保存在本机浏览器(localStorage)。「默认」状态写入后端
            <code className="mx-0.5">provider_configs.is_default</code>。
          </div>
        </div>
      </div>
    </section>
  );
}
