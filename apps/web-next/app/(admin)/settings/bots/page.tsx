"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bot, Loader2, AlertCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api";

interface Bot {
  id: string;
  name: string;
  displayName: string;
  roleTemplate: string;
  isActive: boolean;
  description?: string;
  platform?: string;
  workingDirectory?: string;
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

export default function BotsSettingsPage() {
  const [bots, setBots] = useState<Bot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<ApiEnvelope<Bot[]>>("/api/v2/admin/agents")
      .then((r) => setBots(r.data ?? []))
      .catch(() => setBots([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/settings" className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors">
          <ArrowLeft className="size-3.5" />
          返回设置
        </Link>
      </div>

      <header className="flex items-center gap-2">
        <Bot className="size-5 text-muted-foreground" />
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Bot 配置</h2>
          <p className="text-sm text-muted-foreground">
            Bot = Agent(运行时实例) · {bots.length} 个 · 完全管理在
            <Link href="/agents" className="ml-1 text-primary hover:underline">Agent 页</Link>
          </p>
        </div>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Bot 列表(简表)</CardTitle>
          <CardDescription>Bot = Agent 运行时实例 · 工作目录 / 平台 / 模型 详见 Agent 详情</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : bots.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">还没有 Bot</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead>
                  <TableHead>角色</TableHead>
                  <TableHead>状态</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bots.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">{b.displayName || b.name}</TableCell>
                    <TableCell className="font-mono text-xs">{b.roleTemplate}</TableCell>
                    <TableCell>
                      <Badge variant={b.isActive ? "default" : "secondary"}>
                        {b.isActive ? "运行" : "停用"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertCircle className="size-3.5 text-muted-foreground" />
            说明
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p>原 SettingsView 的 BotsSection 包含工作目录/平台/AI Provider 配置,需要 store 全局 state + 实时 bot 状态。</p>
          <p>完整功能见 <Link href="/agents" className="text-primary hover:underline">Agent 页</Link>(含 systemPrompt / ironLaws / tools)。</p>
          <p className="pt-2 text-xs">Bot 实时运行状态需要 RPC 连接,详见 panmira 内部 store。</p>
        </CardContent>
      </Card>
    </div>
  );
}
