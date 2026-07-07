"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { ShieldCheck, GitCommit, History, AlertTriangle, Lock } from "lucide-react";

interface IronLaw {
  id: string;
  bot: string;
  law: string;
  rationale: string;
  version: number;
  updated_at: string;
  author: string;
}

const IRON_LAWS: IronLaw[] = [
  {
    id: "il-1",
    bot: "销售助手",
    law: "绝不泄露客户报价给第三方。",
    rationale: "客户信任是销售底牌;一次泄漏足以断送整张订单。",
    version: 4,
    updated_at: "2026-06-12",
    author: "张总",
  },
  {
    id: "il-2",
    bot: "采购助手",
    law: "金额 ≥ ¥50,000 的订单必须走人工审批。",
    rationale: "自动化采购在小额场景准确率高,大额仍需人兜底。",
    version: 7,
    updated_at: "2026-05-29",
    author: "李总",
  },
  {
    id: "il-3",
    bot: "调度员",
    law: "禁止修改用户已确认的任务排期。",
    rationale: "客户/生产一旦锁定,变更需走工单流程。",
    version: 3,
    updated_at: "2026-04-18",
    author: "张总",
  },
  {
    id: "il-4",
    bot: "客服台",
    law: "客户投诉必须在 2 小时内首次响应。",
    rationale: "响应时长是续约率的核心指标;沉默等于流失。",
    version: 5,
    updated_at: "2026-03-30",
    author: "运营组",
  },
  {
    id: "il-5",
    bot: "财务",
    law: "对外转账需双因子验证 + 财务主管复核。",
    rationale: "资金安全不可降级;再繁琐也不省。",
    version: 12,
    updated_at: "2026-07-01",
    author: "李总",
  },
];

export default function L3Page() {
  return (
    <div className="flex h-full flex-col">
      <div className="px-6 py-3 border-b border-border bg-muted/30 flex items-center gap-2">
        <Lock className="size-3.5 text-emerald-600" />
        <span className="text-xs text-muted-foreground">
          永久原则 · 任何变更进 audit log · 需 admin 角色
        </span>
        <div className="ml-auto flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono">
          <ShieldCheck className="size-3" />
          {IRON_LAWS.length} iron laws · immutable
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-8 max-w-3xl mx-auto">
          {/* timeline rail */}
          <div className="relative">
            <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />
            <ul className="space-y-6">
              {IRON_LAWS.map((il) => (
                <li key={il.id} className="relative pl-8">
                  <span
                    className={cn(
                      "absolute left-0 top-1 size-[15px] rounded-full",
                      "bg-background border-2 border-emerald-500",
                      "grid place-items-center",
                    )}
                  >
                    <span className="size-1.5 rounded-full bg-emerald-500" />
                  </span>
                  <div className="rounded-lg border border-border bg-card p-4">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="size-3.5 text-emerald-600" />
                      <span className="text-xs font-medium">{il.bot}</span>
                      <Badge variant="secondary" className="text-[10px] font-mono">
                        v{il.version}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] font-mono uppercase tracking-wider">
                        immutable
                      </Badge>
                      <span className="ml-auto text-[10px] text-muted-foreground font-mono">
                        {il.updated_at} · {il.author}
                      </span>
                    </div>
                    <p className="mt-3 text-sm font-medium leading-snug">{il.law}</p>
                    <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                      {il.rationale}
                    </p>

                    <Separator className="my-3" />

                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono">
                      <History className="size-3" />
                      revision log
                    </div>
                    <ul className="mt-2 space-y-1 text-[11px] font-mono text-muted-foreground">
                      <li>v{il.version} · {il.updated_at} · {il.author} · current</li>
                      <li>v{il.version - 1} · 2026-02-14 · 张总</li>
                      <li>v{il.version - 2} · 2025-11-08 · 李总</li>
                    </ul>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <Separator className="my-8" />

          <div className="rounded-lg border border-dashed border-amber-500/40 bg-amber-500/5 p-4 flex items-start gap-3">
            <AlertTriangle className="size-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-2 flex-1">
              <p className="text-xs text-foreground/90">
                L3 写入会广播至全部 5 个 bot,变更不可撤销。
              </p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                需 admin 角色 + 双人复核;建议在变更前先在 L2 试运行 7 天。
              </p>
              <div className="flex items-center gap-2 pt-1">
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                  <GitCommit className="size-3" />
                  propose new law
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs">
                  export audit log
                </Button>
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}