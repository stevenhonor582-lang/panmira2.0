"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  Zap,
} from "lucide-react";
import { useFetch } from "@/lib/channels/use-fetch";
import { mutate } from "@/lib/channels/api-mutations";
import { cn } from "@/lib/utils";

/**
 * /channels/routing — 路由策略
 *
 * 每行是一条规则:bot 优先级 + 条件表达式 + 目标。
 * 规则按 priority ASC 求值,首条 enabled 且 condition 命中即生效。
 *
 * 数据源: routing_bindings 表
 * 字段: group_id, pattern (条件), target_bots[], priority, enabled
 *
 * 后端:
 *  - GET    /api/v2/admin/channels  (列表)
 *  - POST   /api/v2/admin/channels  (新建)
 *  - DELETE /api/v2/admin/channels/:id
 *  - PATCH  /api/v2/admin/channels/:id (扩展支持 priority/enabled)
 */

interface BackendRoute {
  id: string;
  group_id?: string;
  groupId?: string;
  pattern?: string;
  target_bots?: string[];
  targetBots?: string[];
  priority?: number;
  enabled?: boolean;
}

interface Rule {
  id: string;
  groupId: string;
  condition: string;
  destination: string;
  priority: number;
  enabled: boolean;
}

export default function RoutingPage() {
  const { data, loading, error, refresh } = useFetch<{ channels: BackendRoute[] }>(
    "/api/v2/admin/channels",
  );

  const [rules, setRules] = React.useState<Rule[]>([]);
  const [adding, setAdding] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [toast, setToast] = React.useState<string | null>(null);

  function notify(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  React.useEffect(() => {
    const rows = (data?.channels ?? []).map((r, i) => ({
      id: r.id ?? `r_${i}`,
      groupId: r.group_id ?? r.groupId ?? "default",
      condition: r.pattern ?? "*",
      destination: (r.target_bots ?? r.targetBots ?? []).join(", ") || "—",
      priority: typeof r.priority === "number" ? r.priority : 50,
      enabled: r.enabled !== false,
    }));
    setRules(rows);
  }, [data]);

  const [probe, setProbe] = React.useState(
    JSON.stringify({ channel: "feishu", intent: "risk", tag: "code-review" }, null, 2),
  );
  const [probeResult, setProbeResult] = React.useState<Rule | null>(null);

  if (loading) {
    return (
      <ChannelsPageShell meta={<PageMeta items={[{ label: "加载", value: "…" }]} />} toolbar={<></>}>
        <div className="h-64 rounded-2xl bg-muted/30 animate-pulse" />
      </ChannelsPageShell>
    );
  }

  if (error && rules.length === 0) {
    return (
      <ChannelsPageShell
        meta={<PageMeta items={[{ label: "错误", value: error.message.slice(0, 24) }]} />}
        toolbar={<></>}
      >
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-6 text-sm text-rose-700 dark:text-rose-300">
          加载失败 · {error.message}
        </div>
      </ChannelsPageShell>
    );
  }

  async function move(rule: Rule, dir: -1 | 1) {
    const sorted = [...rules].sort((a, b) => a.priority - b.priority);
    const idx = sorted.findIndex((r) => r.id === rule.id);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= sorted.length) return;
    const a = sorted[idx];
    const b = sorted[target];
    const newA = Math.min(Math.max(b.priority + (dir > 0 ? 5 : -5), 0), 999);
    setBusy(true);
    const r = await mutate("PATCH", `/api/v2/admin/channels/${a.id}`, {
      body: { priority: newA },
      refresh,
    });
    setBusy(false);
    notify(r.ok ? `✓ 已上移` : `✗ ${r.error}`);
  }

  async function toggle(rule: Rule) {
    setBusy(true);
    const r = await mutate("PATCH", `/api/v2/admin/channels/${rule.id}`, {
      body: { enabled: !rule.enabled },
      refresh,
    });
    setBusy(false);
    notify(r.ok ? `✓ 已${!rule.enabled ? "启用" : "停用"}` : `✗ ${r.error}`);
  }

  async function remove(rule: Rule) {
    if (!confirm(`删除规则 #${rule.priority}?`)) return;
    setBusy(true);
    const r = await mutate("DELETE", `/api/v2/admin/channels/${rule.id}`, { refresh });
    setBusy(false);
    notify(r.ok ? `✓ 已删除` : `✗ ${r.error}`);
  }

  function runProbe() {
    try {
      const payload = JSON.parse(probe);
      const sorted = [...rules].sort((a, b) => a.priority - b.priority);
      const rule = sorted.find((r) => {
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

  const enabledCount = rules.filter((r) => r.enabled).length;
  const sorted = [...rules].sort((a, b) => a.priority - b.priority);
  const hasFallback = sorted.some((r) => r.condition === "*" && r.enabled);

  return (
    <ChannelsPageShell
      meta={
        <PageMeta
          items={[
            { label: "规则数", value: rules.length },
            { label: "启用", value: enabledCount },
            { label: "回退", value: hasFallback ? "有" : "无" },
          ]}
          footnote={
            <>
              规则按 <code className="font-mono">priority ASC</code> 求值,首条
              <code className="font-mono"> enabled</code> 且
              <code className="font-mono"> condition</code> 命中即生效。
              <code className="font-mono">condition="*"</code> 为全局回退,放最后。
            </>
          }
        />
      }
      toolbar={
        <>
          <div className="flex items-center gap-2">
            <GitBranch className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold tracking-tight">路由策略</h2>
            <span className="text-[11px] text-muted-foreground font-mono">
              {rules.length} 条 · 按 priority 排序
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" className="gap-1.5" onClick={refresh}>
              <RefreshCw className="size-3.5" />
              刷新
            </Button>
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
            head={["#", "Group", "条件", "目标", "启用", ""]}
            rows={sorted.map((r, i) => ({
              cells: [
                <div key="p" className="flex items-center gap-1.5">
                  <span className="font-mono text-[11.5px] text-foreground/85">
                    {String(r.priority).padStart(2, "0")}
                  </span>
                  <div className="flex flex-col">
                    <button
                      type="button"
                      onClick={() => move(r, -1)}
                      disabled={i === 0 || busy}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                      aria-label="上移"
                    >
                      <ArrowUp className="size-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(r, 1)}
                      disabled={i === sorted.length - 1 || busy}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                      aria-label="下移"
                    >
                      <ArrowDown className="size-3" />
                    </button>
                  </div>
                </div>,
                <MonoCell key="g" className="text-muted-foreground">
                  {r.groupId}
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
                <MonoCell key="d" className="text-foreground/85">
                  {r.destination}
                </MonoCell>,
                <button
                  key="e"
                  type="button"
                  role="switch"
                  aria-checked={r.enabled}
                  onClick={() => toggle(r)}
                  disabled={busy}
                  className={cn(
                    "relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50",
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
                    onClick={() => remove(r)}
                    aria-label="删除"
                    className="hover:text-rose-600"
                    disabled={busy}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>,
              ],
            }))}
            empty="还没有路由规则 — 点右上角「添加路由规则」开始"
          />
        </div>

        <aside className="col-span-12 xl:col-span-4">
          <div className="ring-1 ring-border rounded-sm bg-card/40">
            <div className="px-3 py-2 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Beaker className="size-3.5 text-muted-foreground" />
                <span className="text-[11px] font-mono uppercase tracking-wide text-muted-foreground">
                  调试探针
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
              {probeResult ? (
                <div className="rounded-sm ring-1 ring-emerald-500/30 bg-emerald-500/[0.06] p-2 text-[11.5px]">
                  <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300 mb-1">
                    <Zap className="size-3" />
                    <span className="font-mono">命中 → #{probeResult.priority}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1 font-mono">
                    <span className="text-muted-foreground">group</span>
                    <span>{probeResult.groupId}</span>
                    <span className="text-muted-foreground">dest</span>
                    <span className="break-all">{probeResult.destination}</span>
                  </div>
                </div>
              ) : (
                <div className="rounded-sm ring-1 ring-border bg-muted/30 p-2 text-[11.5px] text-muted-foreground">
                  无匹配 — 调整 payload 后重新测试
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      <div className="mt-3 flex items-center gap-3 text-[10.5px] text-muted-foreground font-mono">
        <KeyCell>提示</KeyCell>
        <span>condition 支持 == / &amp;&amp; / || / 通配 *;回退规则放最后</span>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-lg bg-foreground text-background px-3.5 py-2 text-xs shadow-lg">
          {toast}
        </div>
      )}

      <AddRuleDialog open={adding} onClose={() => setAdding(false)} onAdded={() => { setAdding(false); refresh(); }} />
    </ChannelsPageShell>
  );
}

function AddRuleDialog({
  open,
  onClose,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [groupId, setGroupId] = React.useState("default");
  const [priority, setPriority] = React.useState("50");
  const [condition, setCondition] = React.useState("*");
  const [destination, setDestination] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setGroupId("default");
    setPriority("50");
    setCondition("*");
    setDestination("");
    setErr(null);
  }, [open]);

  if (!open) return null;

  async function add() {
    if (!destination.trim()) {
      setErr("目标 Bot 必填");
      return;
    }
    setSaving(true);
    setErr(null);
    const r = await mutate("POST", "/api/v2/admin/channels", {
      body: {
        groupId: groupId.trim() || "default",
        priority: parseInt(priority, 10) || 50,
        pattern: condition.trim() || "*",
        targetBots: destination.split(",").map((s) => s.trim()).filter(Boolean),
        enabled: true,
      },
    });
    setSaving(false);
    if (r.ok) onAdded();
    else setErr(r.error || "添加失败");
  }

  return (
    <Dialog open={open} onOpenChange={(n) => !n && onClose()}>
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
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                placeholder="50"
                inputMode="numeric"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="r-group">Group</Label>
              <Input
                id="r-group"
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                placeholder="default"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="r-cond">条件</Label>
            <Input
              id="r-cond"
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              placeholder="channel == 'feishu' && intent == 'risk'"
              className="font-mono"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="r-dest">目标 Bot(多个用逗号分隔)</Label>
            <Input
              id="r-dest"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="玄鉴,守静"
              className="font-mono"
            />
          </div>
          {err ? (
            <div className="rounded-md bg-rose-500/10 ring-1 ring-rose-500/30 px-2 py-1.5 text-[11px] text-rose-700 dark:text-rose-300">
              {err}
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            取消
          </Button>
          <Button size="sm" onClick={add} disabled={saving}>
            {saving ? "添加中…" : "添加"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
