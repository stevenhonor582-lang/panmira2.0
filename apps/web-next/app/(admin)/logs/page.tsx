"use client";

import Link from "next/link";
import { Bot, Cpu, ScrollText } from "lucide-react";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";

export default function LogsIndexPage() {
  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
          <ScrollText className="size-5 text-muted-foreground" />
          对话日志
        </h2>
        <p className="text-sm text-muted-foreground">
          Bot 触发的对话 与 Agent 执行日志 分别归档 · 选一个分类查看
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link href="/logs/bots" className="group">
          <Card className="transition-colors group-hover:border-primary/50">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Bot className="size-5 text-blue-500" />
                Bot 日志
              </CardTitle>
              <CardDescription>
                各 Bot 在 chat / session 上的对话 · 包含 chatId、模型、token、花费
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              进入 →
            </CardContent>
          </Card>
        </Link>
        <Link href="/logs/agents" className="group">
          <Card className="transition-colors group-hover:border-primary/50">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Cpu className="size-5 text-violet-500" />
                Agent 日志
              </CardTitle>
              <CardDescription>
                Agent 执行 pipeline / 工具调用 / 错误 · 包含 input/output token、duration、message
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              进入 →
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
