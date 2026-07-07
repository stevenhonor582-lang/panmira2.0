"use client";

import { useMemo } from "react";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { AlertItem, BotGroup, WeeklyBucket } from "./types";

/** 把 alert 按 bot 分组,并根据错误类型生成系统结论 */
export function groupAlerts(alerts: AlertItem[]): BotGroup[] {
  const map = new Map<string, AlertItem[]>();
  for (const a of alerts) {
    const k = a.bot_name || "—";
    const arr = map.get(k) ?? [];
    arr.push(a);
    map.set(k, arr);
  }
  const out: BotGroup[] = [];
  for (const [botName, items] of map.entries()) {
    items.sort((x, y) => Number(y.created_at) - Number(x.created_at));
    const count = items.length;
    const latest = items[0];
    const latestAt = Number(latest.created_at);
    const latestMessage = latest.error_message ?? latest.type;

    // 简单指纹:取每条 error_message 的"前 80 字符"作为重复度判断
    const sigMap = new Map<string, number>();
    for (const it of items) {
      const sig = (it.error_message ?? it.type).slice(0, 80);
      sigMap.set(sig, (sigMap.get(sig) ?? 0) + 1);
    }
    let topSig = "";
    let topCount = 0;
    for (const [k, v] of sigMap.entries()) {
      if (v > topCount) {
        topSig = k;
        topCount = v;
      }
    }

    // 严重度:超过 10 条 critical / error → critical
    const errCount = items.filter((i) => i.type === "task_failed" || i.type === "error").length;
    const severity: BotGroup["severity"] =
      errCount >= 10 ? "critical" :
      errCount >= 3  ? "error"   :
      errCount >= 1  ? "warning" : "info";

    // 系统结论
    let conclusion = "";
    if (topCount > 1 && topCount === count) {
      conclusion = `同一错误重复 ${topCount} 次 · 系统结论:可能是上游依赖或 prompt 配置问题,建议先看 session 时间线。`;
    } else if (count >= 5) {
      conclusion = `短时间累计 ${count} 条 · 系统结论:触发频次升高,需关注资源消耗或上游稳定性。`;
    } else if (severity === "critical") {
      conclusion = `系统结论:错误密度高 · 建议立即排查上下文 / 凭证。`;
    } else {
      conclusion = `系统结论:偶发错误 · 建议查看最近一次 session 上下文。`;
    }

    out.push({
      botName,
      count,
      latestAt,
      latestMessage,
      items,
      conclusion: `${conclusion} (top: ${topSig.slice(0, 60)}${topSig.length > 60 ? "…" : ""})`,
      severity,
    });
  }
  return out.sort((a, b) => b.count - a.count);
}

/** 按 8 周横轴聚合 */
export function bucketByWeek(alerts: AlertItem[]): WeeklyBucket[] {
  const buckets: WeeklyBucket[] = [];
  const now = new Date();
  // 取本周一(中国时区简化按本地)
  const dow = (now.getDay() + 6) % 7; // 周一=0
  const thisMon = new Date(now);
  thisMon.setHours(0, 0, 0, 0);
  thisMon.setDate(thisMon.getDate() - dow);

  for (let i = 7; i >= 0; i--) {
    const start = new Date(thisMon);
    start.setDate(start.getDate() - i * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const key = start.toISOString().slice(0, 10);
    buckets.push({ weekStart: key, alert: 0, error: 0, warning: 0, info: 0 });
    void end;
  }

  const findBucket = (ts: number): WeeklyBucket | null => {
    for (const b of buckets) {
      const bs = new Date(b.weekStart).getTime();
      if (ts >= bs && ts < bs + 7 * 86400000) return b;
    }
    return null;
  };

  for (const a of alerts) {
    const ts = Number(a.created_at);
    if (!ts) continue;
    const b = findBucket(ts);
    if (!b) continue;
    if (a.type === "task_failed" || a.severity === "critical") b.alert++;
    else if (a.type === "error" || a.severity === "error") b.error++;
    else if (a.severity === "warning") b.warning++;
    else b.info++;
  }
  return buckets;
}

const SEV_TONE: Record<BotGroup["severity"], string> = {
  critical: "bg-rose-500/10 text-rose-500",
  error:    "bg-orange-500/10 text-orange-500",
  warning:  "bg-amber-500/10 text-amber-500",
  info:     "bg-blue-500/10 text-blue-500",
};

const SEV_LABEL: Record<BotGroup["severity"], string> = {
  critical: "critical",
  error: "error",
  warning: "warning",
  info: "info",
};

function formatTs(ms: number): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString("zh-CN");
}

interface Props {
  alerts: AlertItem[];
}

export function AlertsGrouped({ alerts }: Props) {
  const groups = useMemo(() => groupAlerts(alerts), [alerts]);

  if (groups.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center text-sm text-muted-foreground">
          暂无告警 — 系统正常运行
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {groups.map((g) => (
        <details key={g.botName} className="group rounded-lg border border-border bg-card overflow-hidden">
          <summary className="cursor-pointer list-none p-3.5 flex items-start gap-3 hover:bg-muted/30">
            <div className={`size-8 rounded-md grid place-items-center shrink-0 ${SEV_TONE[g.severity]}`}>
              <AlertTriangle className="size-4" />
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant={g.severity === "info" ? "secondary" : "destructive"}>
                  {SEV_LABEL[g.severity]}
                </Badge>
                <span className="font-medium text-sm">{g.botName}</span>
                <Badge variant="outline" className="text-[10px]">{g.count} 条</Badge>
                <span className="text-[11px] text-muted-foreground tabular-nums ml-auto">
                  最近 {formatTs(g.latestAt)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground font-mono break-all line-clamp-1">{g.latestMessage}</p>
              <p className="text-[11px] text-muted-foreground">{g.conclusion}</p>
            </div>
            <ChevronRight className="size-4 text-muted-foreground transition-transform group-open:rotate-90 mt-1" />
          </summary>
          <div className="border-t border-border bg-muted/20 p-3 space-y-1.5">
            {g.items.slice(0, 10).map((a) => (
              <div key={a.id} className="flex items-center gap-2 text-xs">
                <Badge variant="outline" className="text-[10px] font-mono">{a.type}</Badge>
                <span className="font-mono text-muted-foreground truncate flex-1">{a.error_message}</span>
                <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">{formatTs(Number(a.created_at))}</span>
              </div>
            ))}
            {g.items.length > 10 && (
              <p className="text-[11px] text-muted-foreground">还有 {g.items.length - 10} 条…</p>
            )}
            <div className="pt-2">
              <a
                href={`/diagnosis-center?bot=${encodeURIComponent(g.botName)}`}
                className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs hover:bg-muted transition-colors"
              >
                进入诊断 →
              </a>
            </div>
          </div>
        </details>
      ))}
    </div>
  );
}

void ChevronDown; // reserved for future expansion
