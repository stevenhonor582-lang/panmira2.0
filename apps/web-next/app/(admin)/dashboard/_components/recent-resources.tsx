"use client";

import Link from "next/link";
import { Wrench } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface RecentResource {
  id: string;
  kind: "channel" | "agent" | "skill" | "mcp";
  name: string;
  meta: string;
  at: string;
  href: string;
}

const KIND_TONE: Record<RecentResource["kind"], "default" | "secondary" | "outline"> = {
  channel: "secondary",
  agent: "default",
  skill: "secondary",
  mcp: "secondary",
};

const KIND_LABEL: Record<RecentResource["kind"], string> = {
  channel: "Channel",
  agent: "Agent",
  skill: "Skill",
  mcp: "MCP",
};

function formatTime(at: string): string {
  if (!at) return "";
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

interface Props {
  resources: RecentResource[];
}

export function RecentResources({ resources }: Props) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Wrench className="size-4 text-muted-foreground" />
          近期接入资源
        </CardTitle>
        <CardDescription>最近 7 天 · Channel / Agent / Skill / MCP · 点击跳转到管理</CardDescription>
      </CardHeader>
      <CardContent>
        {resources.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">暂无近期接入</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {resources.map((r) => (
              <Link
                key={r.id}
                href={r.href}
                className="flex items-center gap-2 rounded-md border border-border p-2.5 hover:border-primary/30 hover:bg-muted/40 transition-colors"
              >
                <Badge variant={KIND_TONE[r.kind]} className="text-[10px] shrink-0">
                  {KIND_LABEL[r.kind]}
                </Badge>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{r.name}</p>
                  <p className="text-[10px] text-muted-foreground">{r.meta}</p>
                </div>
                {r.at && (
                  <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                    {formatTime(r.at)}
                  </span>
                )}
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
