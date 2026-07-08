"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ChannelsPageShell, PageMeta } from "@/components/channels/page-shell";
import { DenseTable, MonoCell, KeyCell } from "@/components/channels/dense-table";
import {
  ArrowDown,
  ArrowUp,
  Beaker,
  GitBranch,
  Plus,
  Trash2,
  Zap,
} from "lucide-react";
import { useFetch } from "@/lib/channels/use-fetch";
import { Inbox } from "lucide-react";
import type { RoutingRule } from "@/lib/channels/types";
import { cn } from "@/lib/utils";

/**
 * /channels/routing — Routing policy.
 *
 * Each row is a rule: bot priority + condition expression + destination.
 * Up/Down buttons swap with neighbor (priority). The list is rendered in
 * priority order (1 first). "测试" simulates evaluating a probe payload
 * and shows which rule would match.
 */

export default function RoutingPage() {
  // Real data: pulled from /api/v2/admin/channels (routing_bindings).
  const { data: channelsData, loading: chLoading, error: chError } = useFetch<{ channels: any[] }>("/api/v2/admin/channels");
  const fetchedRules: RoutingRule[] = React.useMemo(() => {
    const rows = (channelsData as any)?.channels ?? [];
    return rows.map((r: any, i: number) => ({
      id: r.id ?? `r_${i}`,
      botId: (r.targetBots?.[0] ?? r.botId ?? "").toString(),
      botName: r.targetBots?.[0] ?? r.botId ?? `bot-${i + 1}`,
      priority: typeof r.priority === "number" ? r.priority : i + 1,
      condition: r.pattern ?? r.condition ?? "*",
      destination: (r.targetBots?.[0] ?? r.destination ?? "").toString(),
      enabled: r.enabled !== false,
    }));
  }, [channelsData]);
  const [rules, setRules] = React.useState<RoutingRule[]>([]);
  React.useEffect(() => { setRules(fetchedRules); }, [fetchedRules]);
  const [adding, setAdding] = React.useState(false);

  const [fBot, setFBot] = React.useState("");
  const [fCond, setFCond] = React.useState("");
  const [fDest, setFDest] = React.useState("");
  const [fPriority, setFPriority] = React.useState("10");

  const [probe, setProbe] = React.useState(
    JSON.stringify(
      { channel: "feishu", intent: "risk", tag: "code-review" },
      null,
      2,
    ),
  );
  const [probeResult, setProbeResult] = React.useState<RoutingRule | null>(null);

  if (chLoading) {
    return (
      <ChannelsPageShell
        meta={<PageMeta items={[{ label: "loading", value: "…" }]} />}
        toolbar={<></>}
      >
        <div className="h-64 rounded-2xl bg-muted/30 animate-pulse" />
      </ChannelsPageShell>
    );
  }
  if (chError?.code === "not_implemented" && rules.length === 0) {
    return <EmptyShell kind="Routing" />;
  }
  if (chError && rules.length === 0) {
    return (
      <ChannelsPageShell
        meta={<PageMeta items={[{ label: "error", value: chError.message.slice(0, 24) }]} />}
        toolbar={<></>}
      >
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-6 text-sm text-rose-700 dark:text-rose-300">
          加载失败 · {chError.message}
        </div>
      </ChannelsPageShell>
    );
  }

  function move(id: string, dir: -1 | 1) {
    setRules((rs) => {
      const idx = rs.findIndex((r) => r.id === id);
      const target = idx + dir;
      if (idx < 0 || target < 0 || target >= rs.length) return rs;
      const next = rs.slice();
      const a = next[idx];
      const b = next[target];
      next[idx] = { ...b, priority: a.priority };
      next[target] = { ...a, priority: b.priority };
      next.sort((x, y) => x.priority - y.priority);
      return next;
    });
  }

  function toggle(id: string) {
    setRules((rs) => rs.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)));
  }

  function remove(id: string) {
    setRules((rs) => rs.filter((r) => r.id !== id));
  }

  function runProbe() {
    try {
      const payload = JSON.parse(probe);
      const rule = rules.find((r) => {
        if (!r.enabled) return false;
        const c = r.condition.trim();
        if (c === "*" || c === "true" || c === "default") return true;
        const pieces = c.split(/&&|\|\|/g).map((s) => s.trim());
        return pieces.every((p) => {
          const m = p.match(/^(\w+)\s*==\s*['"]([^'"]+)['"]$/);
          if (!m) return false;
          return String(payload?.[m[1]] ?? "") === m[2];
        });
      });
      setProbeResult(rule ?? null);
    } catch {
      setProbeResult(null);
    }
  }

  function addRule() {
    if (!fBot.trim() || !fCond.trim() || !fDest.trim()) return;
    const priority = Number.parseInt(fPriority, 10) || 10;
    setRules((rs) => [
      ...rs,
      {
        id: `r_${Math.random().toString(36).slice(2, 8)}`,
        botId: fBot.toLowerCase().replace(/\s+/g, "_"),
        botName: fBot.trim(),
        priority,
        condition: fCond.trim(),
        destination: fDest.trim(),
        enabled: true,
      },
    ].sort((a, b) => a.priority - b.priority));
    setAdding(false);
    setFBot("");
    setFCond("");
    setFDest("");
    setFPriority("10");
  }

  return (
    <ChannelsPageShell
      meta={
        <PageMeta
          items={[
            { label: "rules", value: rules.length },
            { label: "enabled", value: rules.filter((r) => r.enabled).length },
            {
              label: "bots",
              value: Array.from(new Set(rules.map((r) => r.botName))).length,
            },
            { label: "fallback", value: rules.find((r) => r.condition === "*") ? "yes" : "no" },
          ]}
          footnote={
            <>
              规则按 <code className="font-mono">priority ASC</code> 求值,首条
              <code className="font-mono">enabled</code> 且
              <code className="font-mono">condition</code> 命中即生效。
              <code className="font-mono">condition=&quot;*&quot;</code> 为全局回退。
            </>
          }
        />
      }
      toolbar={
        <>
          <div className="flex items-center gap-2">
            <GitBranch className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold tracking-tight">Routing</h2>
            <span className="text-[11px] text-muted-foreground font-mono">
              {rules.length} rules · 按 priority 排序
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" className="gap-1.5" onClick={() => setAdding(true)}>
              <Plus className="size-3.5" />
              添加路由规则
            </Button>
          </div>
        </>
      }
    >
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 xl:col-span-8">
          <DenseTable
            head={["#", "Bot", "Condition", "Destination", "Enabled", ""]}
            rows={rules.map((r, i) => ({
              cells: [
                <div key="p" className="flex items-center gap-1.5">
                  <span className="font-mono text-[11.5px] text-foreground/85">
                    {String(r.priority).padStart(2, "0")}
                  </span>
                  <div className="flex flex-col">
                    <button
                      type="button"
                      onClick={() => move(r.id, -1)}
                      disabled={i === 0}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                      aria-label="上移"
                    >
                      <ArrowUp className="size-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(r.id, 1)}
                      disabled={i === rules.length - 1}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                      aria-label="下移"
                    >
                      <ArrowDown className="size-3" />
                    </button>
                  </div>
                </div>,
                <MonoCell key="b" className="text-foreground/85">
                  {r.botName}
                </MonoCell>,
                <MonoCell
                  key="c"
                  className={cn(
                    "max-w-[18rem] truncate inline-block",
                    r.condition === "*"
                      ? "text-amber-700 dark:text-amber-300"
                      : "text-muted-foreground",
                  )}
                  title={r.condition}
                >
                  {r.condition}
                </MonoCell>,
                <MonoCell
                  key="d"
                  className="text-foreground/85"
                >
                  {r.destination}
                </MonoCell>,
                <button
                  key="e"
                  type="button"
                  role="switch"
                  aria-checked={r.enabled}
                  onClick={() => toggle(r.id)}
                  className={cn(
                    "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                    r.enabled ? "bg-emerald-500" : "bg-muted-foreground/30",
                  )}
                >
                  <span
                    className={cn(
                      "inline-block size-3.5 rounded-full bg-background shadow transition-transform",
                      r.enabled ? "translate-x-4.5" : "translate-x-0.5",
                    )}
                  />
                </button>,
                <div key="a" className="flex items-center justify-end">
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    onClick={() => remove(r.id)}
                    aria-label="删除"
                    className="hover:text-rose-600"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>,
              ],
            }))}
            empty="还没有路由规则 — 点上方添加。"
          />
        </div>

        <aside className="col-span-12 xl:col-span-4">
          <div className="ring-1 ring-border rounded-sm bg-card/40">
            <div className="px-3 py-2 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Beaker className="size-3.5 text-muted-foreground" />
                <span className="text-[11px] font-mono uppercase tracking-wide text-muted-foreground">
                  test probe
                </span>
              </div>
              <Button size="xs" className="gap-1" onClick={runProbe}>
                <Zap className="size-3" />
                测试
              </Button>
            </div>
            <div className="p-3 space-y-2">
              <Label htmlFor="rp" className="text-[10px] font-mono uppercase tracking-wide text-muted-foreground">
                Payload (JSON)
              </Label>
              <textarea
                id="rp"
                value={probe}
                onChange={(e) => setProbe(e.target.value)}
                rows={6}
                spellCheck={false}
                className="flex w-full rounded-sm border border-input bg-foreground/95 text-background px-2 py-1.5 text-[11.5px] font-mono outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
              {probeResult && (
                <div className="rounded-sm ring-1 ring-emerald-500/30 bg-emerald-500/[0.06] p-2 text-[11.5px]">
                  <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300 mb-1">
                    <Zap className="size-3" />
                    <span className="font-mono">match → #{probeResult.priority}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1 font-mono">
                    <span className="text-muted-foreground">bot</span>
                    <span>{probeResult.botName}</span>
                    <span className="text-muted-foreground">dest</span>
                    <span className="break-all">{probeResult.destination}</span>
                  </div>
                </div>
              )}
              {probeResult === null && (
                <div className="rounded-sm ring-1 ring-border bg-muted/30 p-2 text-[11.5px] text-muted-foreground">
                  无匹配 — 测试当前规则集。
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      <div className="mt-3 flex items-center gap-3 text-[10.5px] text-muted-foreground font-mono">
        <KeyCell>HINT</KeyCell>
        <span>condition 支持 == / &amp;&amp; / || / 通配 *;回退规则放最后</span>
      </div>

      <Dialog
        open={adding}
        onOpenChange={(next) => {
          if (!next) setAdding(false);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Plus className="size-4 text-muted-foreground" />
              添加路由规则
            </DialogTitle>
            <DialogDescription className="text-xs">
              priority 数字越小优先级越高。condition 用 <code className="font-mono">==</code> 比较字段,
              支持 <code className="font-mono">&amp;&amp;</code> / <code className="font-mono">||</code>。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="r-prio">Priority</Label>
                <Input
                  id="r-prio"
                  value={fPriority}
                  onChange={(e) => setFPriority(e.target.value)}
                  placeholder="10"
                  inputMode="numeric"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="r-bot">Bot</Label>
                <Input
                  id="r-bot"
                  value={fBot}
                  onChange={(e) => setFBot(e.target.value)}
                  placeholder="玄鉴"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="r-cond">Condition</Label>
              <Input
                id="r-cond"
                value={fCond}
                onChange={(e) => setFCond(e.target.value)}
                placeholder="channel == 'feishu' && intent == 'risk'"
                className="font-mono"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="r-dest">Destination</Label>
              <Input
                id="r-dest"
                value={fDest}
                onChange={(e) => setFDest(e.target.value)}
                placeholder="agent.xuanjian"
                className="font-mono"
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setAdding(false)}>
              取消
            </Button>
            <Button size="sm" onClick={addRule}>
              添加
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </ChannelsPageShell>
  );
}

function EmptyShell({ kind }: { kind: string }) {
  return (
    <ChannelsPageShell
      meta={
        <PageMeta
          items={[{ label: "backend", value: "not_implemented" }]}
          footnote={`后端未实装 ${kind} 端点 · 已废弃 mock.ts 引用,改为显示空状态。`}
        />
      }
      toolbar={<></>}
    >
      <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-border py-24 text-center">
        <Inbox className="size-6 text-foreground/35" />
        <span className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-foreground/40">
          empty state
        </span>
        <p className="max-w-[44ch] text-sm text-foreground/60">
          {kind} 数据接口后端未实装。
          <br />
          一旦后端上线,刷新页面即可看到真实数据。
        </p>
      </div>
    </ChannelsPageShell>
  );
}
