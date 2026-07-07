"use client";

import { useMemo } from "react";
import { RefreshCw, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { usePolling } from "@/lib/use-polling";
import { Card, CardContent } from "@/components/ui/card";
import { FeatureCards, FEATURE_CARDS, type FeatureCardSpec } from "./_components/feature-cards";
import { StatusOverview } from "./_components/status-overview";
import { RecentResources, type RecentResource } from "./_components/recent-resources";
import { UsageTrendChart } from "./_components/usage-trend-chart";

interface DashboardStats {
  counts: {
    llm: number;
    embedding: number;
    mcp: number;
    knowledgeBases: number;
    agents: number;
    oauthClients: number;
    skills: number;
  };
  trends: Array<{
    date: string;
    token: number;
    skill: number;
    mcp: number;
    knowledge: number;
  }>;
}

interface SystemStatus {
  counts: {
    llm: number;
    embedding: number;
    mcp: number;
    kb: number;
    agent: number;
    oauth: number;
  };
  usageToday: Record<string, number>;
  errorsLast24h: number;
  timestamp: string;
}

interface ChannelItem {
  id: string;
  pattern: string | null;
  targetBots: string[];
  enabled: boolean;
  createdAt?: string;
}

interface DashboardData {
  stats: DashboardStats;
  status: SystemStatus | null;
  channels: ChannelItem[];
}

export default function DashboardPage() {
  const fetcher = useMemo(
    () => async (): Promise<DashboardData> => {
      const [stats, status, channels] = await Promise.all([
        api<DashboardStats>("/api/v2/admin/dashboard/stats"),
        api<SystemStatus>("/api/v2/admin/status").catch(() => null),
        api<{ channels: ChannelItem[] }>("/api/v2/admin/channels").catch(() => ({ channels: [] })),
      ]);
      return { stats, status, channels: channels.channels ?? [] };
    },
    [],
  );

  const { data, error, refresh, nextIn, loading } = usePolling<DashboardData>({
    fetcher,
    intervalMs: 60000,
  });

  const stats = data?.stats ?? null;
  const status = data?.status ?? null;
  const channels = data?.channels ?? [];

  // 4 大类可点击卡片数值
  const featureValues: Record<FeatureCardSpec["key"], number> = {
    agents: stats?.counts.agents ?? 0,
    llm: (stats?.counts.llm ?? 0) + (stats?.counts.embedding ?? 0),
    kb: (stats?.counts.knowledgeBases ?? 0) + (stats?.counts.skills ?? 0),
    channels: channels.length,
  };

  const totalResources = stats
    ? stats.counts.llm + stats.counts.embedding + stats.counts.mcp + stats.counts.skills
    : null;

  // 近期 7 天资源
  const recentResources = useMemo<RecentResource[]>(() => {
    const items: RecentResource[] = [];
    for (const c of channels.slice(0, 6)) {
      items.push({
        id: `ch-${c.id}`,
        kind: "channel",
        name: c.pattern || c.id,
        meta: `${c.targetBots?.length ?? 0} 个 bot`,
        at: c.createdAt ?? "",
        href: "/channels",
      });
    }
    if (stats) {
      items.push({
        id: "stat-mcp",
        kind: "mcp",
        name: `MCP Servers · ${stats.counts.mcp}`,
        meta: "已注册 MCP",
        at: "",
        href: "/resources",
      });
      items.push({
        id: "stat-skill",
        kind: "skill",
        name: `Skill Pool · ${stats.counts.skills}`,
        meta: "技能池",
        at: "",
        href: "/resources",
      });
    }
    return items;
  }, [channels, stats]);

  const errorMsg = error instanceof Error ? error.message : null;

  // 静默引用以满足 lint:FEATURE_CARDS 在外部导出
  void FEATURE_CARDS;

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight">总览 Dashboard</h2>
          <p className="text-sm text-muted-foreground">
            数智资源 + 运行状态 + 最近接入 · 每 60s 自动刷新
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="tabular-nums">下次 {nextIn}s</span>
          <button
            onClick={refresh}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md hover:bg-muted transition-colors"
            aria-label="立即刷新"
          >
            <RefreshCw className="size-3.5" />
          </button>
        </div>
      </header>

      {errorMsg && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-3 text-sm text-destructive flex items-center gap-2">
            <XCircle className="size-4" />
            加载失败:{errorMsg}
          </CardContent>
        </Card>
      )}

      <FeatureCards loading={loading && !stats} values={featureValues} />
      <StatusOverview status={status} totalResources={totalResources} />
      <UsageTrendChart trends={stats?.trends ?? null} loading={loading && !stats} />
      <RecentResources resources={recentResources} />
    </div>
  );
}
