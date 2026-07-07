"use client";

import { useEffect, useState } from "react";
import { Activity, Bot, Cpu, Workflow, ChevronRight, Loader2 } from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

interface ActiveStats {
  activeSessions: number;
  activeBots: number;
  activeAgents: number;
  activePipelines: number;
  byBot: Array<{ botName: string; count: number }>;
  recentPipelines: Array<{ id: string; pipelineName: string; status: string; startedAt: number }>;
}

const STATUS_COLOR: Record<string, string> = {
  running: "bg-blue-500",
  pending: "bg-amber-500",
  completed: "bg-emerald-500",
  failed: "bg-rose-500",
  cancelled: "bg-zinc-500",
};

export function TopbarActiveStatus() {
  const [stats, setStats] = useState<ActiveStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const r = await api<{ success: boolean; data: ActiveStats }>(
          "/api/v2/admin/runtime/stats",
        );
        if (mounted) {
          setStats(r.data);
          setLoading(false);
        }
      } catch {
        if (mounted) setLoading(false);
      }
    };
    load();
    const timer = setInterval(load, 5000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  const hasActivity = (stats?.activeSessions ?? 0) > 0 || (stats?.activePipelines ?? 0) > 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-2 px-2 text-xs"
            aria-label="实时活跃状态"
          />
        }
      >
        {loading ? (
          <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
        ) : (
          <span
            className={`size-2 rounded-full shadow-[0_0_6px_rgba(16,185,129,0.6)] ${
              hasActivity ? "bg-emerald-500" : "bg-zinc-500"
            }`}
          />
        )}
        <span className="flex items-center gap-1.5 tabular-nums">
          <span className="inline-flex items-center gap-1">
            <Bot className="size-3 text-blue-500" />
            <span className="font-medium">{stats?.activeBots ?? 0}</span>
          </span>
          <span className="text-muted-foreground">/</span>
          <span className="inline-flex items-center gap-1">
            <Cpu className="size-3 text-violet-500" />
            <span className="font-medium">{stats?.activeAgents ?? 0}</span>
          </span>
          <span className="text-muted-foreground">/</span>
          <span className="inline-flex items-center gap-1">
            <Workflow className="size-3 text-amber-500" />
            <span className="font-medium">{stats?.activePipelines ?? 0}</span>
          </span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="p-3 border-b border-border">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Activity className="size-4 text-emerald-500" />
              实时活跃
            </h4>
            <Link
              href="/runtime"
              className="text-xs text-primary hover:underline flex items-center gap-0.5"
            >
              详细视图 <ChevronRight className="size-3" />
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <MiniStat
              icon={<Bot className="size-3.5 text-blue-500" />}
              label="活跃 Bot"
              value={stats?.activeBots ?? 0}
            />
            <MiniStat
              icon={<Cpu className="size-3.5 text-violet-500" />}
              label="活跃 Agent"
              value={stats?.activeAgents ?? 0}
            />
            <MiniStat
              icon={<Workflow className="size-3.5 text-amber-500" />}
              label="Pipeline"
              value={stats?.activePipelines ?? 0}
            />
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto">
          {(stats?.byBot ?? []).length > 0 && (
            <div className="p-3 border-b border-border/60">
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2 font-medium">
                活跃 Bot 分布
              </p>
              <ul className="space-y-1.5">
                {stats!.byBot.slice(0, 5).map((b) => (
                  <li key={b.botName} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5">
                      <span className="size-1.5 rounded-full bg-emerald-500" />
                      {b.botName}
                    </span>
                    <span className="tabular-nums text-muted-foreground">{b.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(stats?.recentPipelines ?? []).length > 0 && (
            <div className="p-3">
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2 font-medium">
                最近 Pipeline
              </p>
              <ul className="space-y-1.5">
                {stats!.recentPipelines.slice(0, 5).map((p) => (
                  <li key={p.id} className="flex items-center justify-between text-xs gap-2">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span className={`size-1.5 rounded-full shrink-0 ${STATUS_COLOR[p.status] ?? "bg-zinc-500"}`} />
                      <span className="truncate">{p.pipelineName}</span>
                    </span>
                    <span className="text-muted-foreground shrink-0">{p.status}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!hasActivity && (
            <div className="p-6 text-center text-xs text-muted-foreground">
              当前没有活跃 session
            </div>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MiniStat({
  icon, label, value,
}: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-md bg-muted/40 px-2 py-2">
      <div className="flex items-center justify-center gap-1 text-muted-foreground">
        {icon}
        <span className="text-[10px]">{label}</span>
      </div>
      <div className="text-base font-semibold tabular-nums mt-0.5">{value}</div>
    </div>
  );
}
