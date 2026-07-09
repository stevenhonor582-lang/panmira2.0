"use client";
import * as React from "react";
import { useAgent } from "../../_lib/data";
import { api } from "@/lib/api";
import { ScrollText, Loader2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * R26-B: 日志 tab — 真实 activity_events + 人类可读时间线 + 过滤。
 *
 * 用户反馈:"日志呈现什么形式?后端上无 agent 的 preagent 日志"
 *
 * 改动:
 * - 拉真实 GET /api/activity/events?botName=<agent.name>&limit=50
 * - 每条:时间 / 类型 chip(成功/失败/开始 — 中文 + 颜色)/ 人类可读简述
 * - 过滤:类型(全部/成功/错误) + 时间(24h/7天/30天)
 * - 0 条显示"暂无日志",不 crash
 *
 * 备注:activity_events 按 bot_name 过滤,不是 bot_id。
 * 这里用 agent.name(优先)和 displayName 都试一遍,name 命中率高。
 */

interface ActivityEvent {
  id: string;
  type: "task_started" | "task_completed" | "task_failed" | string;
  botName: string;
  chatId: string;
  userId?: string;
  prompt?: string;
  responsePreview?: string;
  costUsd?: number;
  durationMs?: number;
  errorMessage?: string;
  timestamp: number;
  inputTokens?: number;
  outputTokens?: number;
  model?: string;
}

type TypeFilter = "all" | "success" | "error";
type RangeFilter = "24h" | "7d" | "30d";

const RANGE_MS: Record<RangeFilter, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

function classifyEvent(e: ActivityEvent): "success" | "error" | "info" {
  if (e.type === "task_failed") return "error";
  if (e.type === "task_completed") return "success";
  return "info"; // task_started 或未知
}

function describeEvent(e: ActivityEvent): string {
  const action =
    e.type === "task_completed" ? "完成任务"
    : e.type === "task_failed" ? "任务失败"
    : e.type === "task_started" ? "开始任务"
    : "事件";

  const detail =
    e.type === "task_failed" && e.errorMessage
      ? e.errorMessage.slice(0, 100)
      : e.prompt
        ? `「${e.prompt.slice(0, 60)}」`
        : e.responsePreview
          ? e.responsePreview.slice(0, 80)
          : "";

  const tail: string[] = [];
  if (e.durationMs !== undefined && e.durationMs > 0) {
    tail.push(e.durationMs >= 1000 ? `${(e.durationMs / 1000).toFixed(1)}s` : `${e.durationMs}ms`);
  }
  if (e.costUsd !== undefined && e.costUsd > 0) {
    tail.push(`$${e.costUsd.toFixed(4)}`);
  }
  if (e.model) {
    tail.push(e.model);
  }

  const tailStr = tail.length > 0 ? ` · ${tail.join(" · ")}` : "";
  return detail ? `${action}:${tailStr} ${detail}` : `${action}${tailStr}`;
}

function fmtTimeline(ts: number): { date: string; time: string } {
  const d = new Date(ts);
  const date = `${d.getMonth() + 1}月${d.getDate()}日`;
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return { date, time };
}

function exportCSV(rows: ActivityEvent[], agentLabel: string) {
  const header = "timestamp,type,bot,duration_ms,cost_usd,model,prompt\n";
  const body = rows.map((r) => {
    const prompt = (r.prompt || "").replace(/"/g, '""').replace(/\n/g, " ").slice(0, 120);
    return `${r.timestamp},${r.type},"${r.botName || ""}",${r.durationMs ?? ""},${r.costUsd ?? ""},${r.model || ""},"${prompt}"`;
  }).join("\n");
  const csv = header + body;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${agentLabel.slice(0, 12)}-logs-${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 通过 agent.id 反查 bot.name(activity_events 按 bot_name 索引,不是 bot_id)。
 * /api/bots 返回扁平数组,每条带 agentId。
 * 找不到 → 退回 agent.name 去掉 "--xxx" 后缀(命名约定:agent name = "<botName>--<role>");
 * 再不行就直接用 agent.name(可能是历史命名)。
 */
async function resolveBotName(agentId: string, agentName: string): Promise<string> {
  try {
    const res = await api<{ bots?: Array<{ name: string; agentId?: string }> } | Array<{ name: string; agentId?: string }>>(
      "/api/bots",
    );
    const bots = (res as any)?.bots ?? (Array.isArray(res) ? res : []);
    const hit = (bots as Array<{ name: string; agentId?: string }>).find((b) => b.agentId === agentId);
    if (hit?.name) return hit.name;
  } catch {
    // fall through to heuristic
  }
  // Heuristic: "不盈--全栈开发" → "不盈"
  const shortName = (agentName.split("--")[0] || "").trim();
  return shortName || agentName;
}

export function TabLogs({ id }: { id: string }) {
  const { agent, loading: agentLoading } = useAgent(id);
  const [events, setEvents] = React.useState<ActivityEvent[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [fetchError, setFetchError] = React.useState<string | null>(null);
  const [typeFilter, setTypeFilter] = React.useState<TypeFilter>("all");
  const [rangeFilter, setRangeFilter] = React.useState<RangeFilter>("7d");

  React.useEffect(() => {
    if (!agent) return;
    let alive = true;
    setLoading(true);
    setFetchError(null);
    (async () => {
      try {
        // activity_events 用 bot_name 过滤(不是 bot_id)。
        // agent.name 形如 "不盈--全栈开发",但 bot name 是 "不盈"。
        // 先用 /api/bots 查 agentId → bot.name 拿到真实 bot 名。
        const botName = await resolveBotName(agent.id, agent.name || agent.displayName);
        if (!alive) return;
        const url = `/api/activity/events?botName=${encodeURIComponent(botName)}&limit=100`;
        const res = await api<{ events?: ActivityEvent[] } | ActivityEvent[]>(url);
        if (!alive) return;
        const items = (res as any)?.events ?? (Array.isArray(res) ? res : []);
        setEvents(items);
      } catch (e) {
        if (alive) {
          setEvents([]);
          setFetchError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [agent?.id]);

  if (agentLoading) {
    return <div className="h-48 rounded-2xl bg-muted/40 animate-pulse" />;
  }
  if (!agent) return null;

  // 应用过滤器
  const now = Date.now();
  const filtered = events.filter((e) => {
    // 时间
    if (now - e.timestamp > RANGE_MS[rangeFilter]) return false;
    // 类型
    if (typeFilter === "success" && classifyEvent(e) !== "success") return false;
    if (typeFilter === "error" && classifyEvent(e) !== "error") return false;
    return true;
  });

  const stats = {
    success: events.filter((e) => classifyEvent(e) === "success").length,
    error: events.filter((e) => classifyEvent(e) === "error").length,
    info: events.filter((e) => classifyEvent(e) === "info").length,
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-4">
        <div>
          <h3 className="flex items-center gap-2 text-[13px] font-medium tracking-tight text-foreground/65">
            <ScrollText className="size-4 text-foreground/45" />
            活动日志 · {agent.displayName}
          </h3>
          <p className="mt-1 text-[13px] text-foreground/55 max-w-[60ch]">
            这位员工的真实活动记录 — 任务执行、调用结果、错误信息(从 activity_events 实时拉)。
          </p>
        </div>
        <div className="flex items-center gap-3 text-[11.5px] text-foreground/55 font-mono">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-emerald-500" />{stats.success} 成功
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-rose-500" />{stats.error} 失败
          </span>
          {stats.info > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-sky-500" />{stats.info} 进行中
            </span>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={filtered.length === 0}
            onClick={() => exportCSV(filtered, agent.displayName)}
            className="ml-1 gap-1 text-[12px]"
            data-testid="logs-export-csv"
          >
            <Download className="size-3.5" /> 导出 CSV
          </Button>
        </div>
      </header>

      {/* 过滤器 */}
      <div className="flex flex-wrap items-center gap-4 text-[12px]">
        <FilterGroup
          label="类型"
          value={typeFilter}
          onChange={(v) => setTypeFilter(v as TypeFilter)}
          options={[
            { value: "all", label: "全部" },
            { value: "success", label: "成功" },
            { value: "error", label: "错误" },
          ]}
          testIdPrefix="logs-filter-type"
        />
        <FilterGroup
          label="时间"
          value={rangeFilter}
          onChange={(v) => setRangeFilter(v as RangeFilter)}
          options={[
            { value: "24h", label: "24 小时" },
            { value: "7d", label: "7 天" },
            { value: "30d", label: "30 天" },
          ]}
          testIdPrefix="logs-filter-range"
        />
        <span className="ml-auto font-mono text-[11px] text-foreground/40">
          显示 {filtered.length} / {events.length} 条
        </span>
      </div>

      {loading ? (
        <div className="rounded-2xl bg-muted/40 p-12 text-center text-[13px] text-foreground/50">
          <Loader2 className="mx-auto mb-2 size-4 animate-spin" />
          加载日志…
        </div>
      ) : fetchError ? (
        <div className="rounded-2xl border border-dashed border-amber-500/40 bg-amber-500/5 p-6 text-[12.5px] text-foreground/60">
          <p className="font-medium text-foreground/75">日志接口返回错误</p>
          <p className="mt-1 font-mono text-[11px] text-foreground/45">{fetchError}</p>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState hasEvents={events.length > 0} rangeLabel={rangeLabel(rangeFilter)} agentId={agent.id} />
      ) : (
        <Timeline events={filtered} agentId={agent.id} />
      )}
    </div>
  );
}

function rangeLabel(r: RangeFilter): string {
  return r === "24h" ? "24 小时" : r === "7d" ? "7 天" : "30 天";
}

function FilterGroup({
  label, value, onChange, options, testIdPrefix,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  testIdPrefix: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] uppercase tracking-[0.18em] text-foreground/45 font-mono">{label}</span>
      <div className="flex rounded-lg ring-1 ring-border bg-card overflow-hidden">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            data-testid={`${testIdPrefix}-${o.value}`}
            className={`px-2.5 py-1 text-[11.5px] transition-colors ${
              value === o.value
                ? "bg-primary/15 text-primary font-medium"
                : "text-foreground/60 hover:bg-muted/60"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Timeline({ events, agentId }: { events: ActivityEvent[]; agentId: string }) {
  // 按日期分组
  const grouped = React.useMemo(() => {
    const map = new Map<string, ActivityEvent[]>();
    for (const e of events) {
      const { date } = fmtTimeline(e.timestamp);
      if (!map.has(date)) map.set(date, []);
      map.get(date)!.push(e);
    }
    return Array.from(map.entries());
  }, [events]);

  return (
    <div className="space-y-6" data-testid="logs-timeline">
      {grouped.map(([date, items]) => (
        <div key={date}>
          <div className="mb-2 flex items-center gap-2">
            <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-foreground/45">
              {date}
            </span>
            <span className="h-px flex-1 bg-border" />
            <span className="font-mono text-[10.5px] text-foreground/35">{items.length} 条</span>
          </div>
          <ul className="space-y-2">
            {items.map((e) => {
              const cls = classifyEvent(e);
              const { time } = fmtTimeline(e.timestamp);
              return (
                <li
                  key={e.id}
                  className="flex items-start gap-3 rounded-xl bg-card px-4 py-3 ring-1 ring-border/60"
                >
                  <span className="mt-0.5 shrink-0 font-mono text-[11px] tabular-nums text-foreground/55">
                    {time}
                  </span>
                  <TypeChip cls={cls} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] leading-relaxed text-foreground/85">
                      {describeEvent(e)}
                    </p>
                    {e.errorMessage && cls === "error" && (
                      <p className="mt-1 font-mono text-[11px] text-rose-600/80 dark:text-rose-400/80 line-clamp-2">
                        {e.errorMessage.slice(0, 200)}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <p className="text-[10.5px] font-mono text-foreground/30">
        refs: agent={agentId.slice(0, 8)}… · 共 {events.length} 条
      </p>
    </div>
  );
}

function TypeChip({ cls }: { cls: "success" | "error" | "info" }) {
  const cfg = {
    success: { label: "成功", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 ring-emerald-500/30" },
    error: { label: "错误", cls: "bg-rose-500/15 text-rose-600 dark:text-rose-400 ring-rose-500/30" },
    info: { label: "开始", cls: "bg-sky-500/15 text-sky-600 dark:text-sky-400 ring-sky-500/30" },
  }[cls];
  return (
    <span className={`mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-[10.5px] font-medium ring-1 ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

function EmptyState({ hasEvents, rangeLabel, agentId }: { hasEvents: boolean; rangeLabel: string; agentId: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-border py-16 text-center">
      <ScrollText className="size-6 text-foreground/35" />
      <span className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-foreground/40">
        {hasEvents ? `最近 ${rangeLabel} 没有日志` : "暂无日志数据"}
      </span>
      <p className="max-w-[44ch] text-[13px] text-foreground/60">
        {hasEvents
          ? "这位员工在所选时间范围内没有活动 — 换个时间范围试试。"
          : "这位员工还没有产生活动记录。等员工执行任务后,执行结果会实时落到这里。"}
      </p>
      <span className="mt-1 font-mono text-[11px] text-foreground/35">
        agent id · {agentId.slice(0, 8)}…
      </span>
    </div>
  );
}
