"use client";

import Link from "next/link";
import { Activity, AlertTriangle, CheckCircle2, Clock, KeyRound, Zap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface SystemStatusLike {
  usageToday: Record<string, number>;
  errorsLast24h: number;
  timestamp: string;
}

interface Props {
  status: SystemStatusLike | null;
  totalResources: number | null;
}

function formatTime(at: string): string {
  if (!at) return "—";
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function StatusOverview({ status, totalResources }: Props) {
  const token = status?.usageToday?.token ?? 0;
  const skill = status?.usageToday?.skill ?? 0;
  const kb = status?.usageToday?.knowledge ?? 0;
  const mcp = status?.usageToday?.mcp ?? 0;
  const errors = status?.errorsLast24h ?? 0;

  const errIcon = errors === 0
    ? <CheckCircle2 className="size-4 text-emerald-500" />
    : errors < 10
      ? <Clock className="size-4 text-amber-500" />
      : <AlertTriangle className="size-4 text-rose-500" />;

  return (
    <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
      <Card>
        <CardContent className="p-4 space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Activity className="size-3.5" />
            <span>后端进程</span>
          </div>
          <p className="text-base font-medium flex items-center gap-1.5">
            <CheckCircle2 className="size-4 text-emerald-500" />
            运行中
          </p>
          <p className="text-[11px] text-muted-foreground">
            {status ? `更新 ${formatTime(status.timestamp)}` : "等待数据"}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <AlertTriangle className="size-3.5" />
            <span>最近 24h 异常</span>
          </div>
          <p className="text-base font-medium tabular-nums flex items-center gap-1.5">
            {errIcon}
            {errors}
          </p>
          <Link href="/diagnosis-center" className="text-[11px] text-primary hover:underline">
            进入诊断中心 →
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Zap className="size-3.5" />
            <span>今日 Token</span>
          </div>
          <p className="text-base font-medium tabular-nums">
            {token > 0 ? token.toLocaleString() : "—"}
          </p>
          <p className="text-[11px] text-muted-foreground">
            Skill {skill} · KB {kb} · MCP {mcp}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <KeyRound className="size-3.5" />
            <span>资源池全量</span>
          </div>
          <p className="text-base font-medium tabular-nums">
            {totalResources !== null ? totalResources : "—"}
          </p>
          <p className="text-[11px] text-muted-foreground">
            LLM + Embedding + MCP + Skill
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
