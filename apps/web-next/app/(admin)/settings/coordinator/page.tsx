"use client";

import Link from "next/link";
import { ArrowLeft, Workflow, AlertCircle, Users as UsersIcon, Bot } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function CoordinatorSettingsPage() {
  return (
    <div className="space-y-5">
      <Link href="/settings" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="size-3.5" />
        返回设置
      </Link>

      <header className="flex items-center gap-2">
        <Workflow className="size-5 text-muted-foreground" />
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Coordinator</h2>
          <p className="text-sm text-muted-foreground">协调器配置:飞书群 ↔ Bot ↔ 团队成员</p>
        </div>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertCircle className="size-4 text-muted-foreground" />
            占位说明
          </CardTitle>
          <CardDescription>协调器是飞书/微信 群聊路由 + 多 bot 协作的工作流管理器</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>原 CoordinatorSection 实现:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>协调配置列表(<code className="font-mono text-xs">/api/coordinator/configs</code>)</li>
            <li>discovered 群列表(<code className="font-mono text-xs">/api/coordinator/discovered-groups</code>)</li>
            <li>手动 group_id 录入 + 协调 bot 选择 + 团队成员多选</li>
            <li>所有 Bot 列表(<code className="font-mono text-xs">/api/bots</code>)</li>
          </ul>
          <p className="pt-2">
            这些 API <Badge variant="secondary" className="text-[10px] mx-1">不在 admin scope</Badge>,
            是 chat 内部运行时调用。
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="opacity-60">
          <CardContent className="p-4">
            <UsersIcon className="size-5 text-muted-foreground mb-2" />
            <p className="text-sm font-medium">群 ↔ Bot</p>
            <p className="text-xs text-muted-foreground mt-1">飞书群 chat_id → 协调 bot</p>
          </CardContent>
        </Card>
        <Card className="opacity-60">
          <CardContent className="p-4">
            <Bot className="size-5 text-muted-foreground mb-2" />
            <p className="text-sm font-medium">Bot ↔ Team</p>
            <p className="text-xs text-muted-foreground mt-1">协调 bot → 团队成员 bots</p>
          </CardContent>
        </Card>
        <Card className="opacity-60">
          <CardContent className="p-4">
            <Workflow className="size-5 text-muted-foreground mb-2" />
            <p className="text-sm font-medium">Discover</p>
            <p className="text-xs text-muted-foreground mt-1">自动发现新群</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
