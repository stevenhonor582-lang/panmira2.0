"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  ChevronRight,
  Search,
  Plus,
  MessageSquareWarning,
  Bug,
  Sparkles,
  HelpCircle,
  ThumbsUp,
  ThumbsDown,
  CheckCircle2,
  Eye,
  User,
  Bot,
} from "lucide-react";

type FeedbackType = "issue" | "feature" | "bug";
type FeedbackStatus = "pending" | "reviewed" | "addressed";

interface Feedback {
  id: string;
  type: FeedbackType;
  status: FeedbackStatus;
  source: "user" | "bot";
  reporter: string;
  subject: string;
  body: string;
  layer?: "l1" | "l2" | "l3";
  bot?: string;
  created: string;
  votes: number;
}

const ITEMS: Feedback[] = [
  {
    id: "fb-001",
    type: "bug",
    status: "pending",
    source: "user",
    reporter: "张总",
    subject: "RFQ 自动回复缺少客户抬头",
    body: "今早 ACME 的 RFQ 回复邮件没有附客户抬头,对方追问了一次。建议模板里加 company name 变量。",
    bot: "销售助手",
    created: "2h ago",
    votes: 4,
  },
  {
    id: "fb-002",
    type: "feature",
    status: "reviewed",
    source: "user",
    reporter: "李总",
    subject: "希望 L1 上下文能跨 bot 共享",
    body: "客服和销售经常讨论同一客户,但目前 L1 互相不可见。希望加个 tenant 级共享开关。",
    layer: "l1",
    created: "1d ago",
    votes: 11,
  },
  {
    id: "fb-003",
    type: "issue",
    status: "addressed",
    source: "user",
    reporter: "运营 · 王",
    subject: "采购助手对 M5 螺栓推荐了非标供应商",
    body: "BOM 里写的是 GB/T 5783 但推荐了 DIN 933,差 0.5mm 高度。已被纠正,期望默认严格匹配国标。",
    bot: "采购助手",
    created: "3d ago",
    votes: 2,
  },
  {
    id: "fb-004",
    type: "issue",
    status: "pending",
    source: "bot",
    reporter: "客服台",
    subject: "无法解析客户发送的工艺图纸 (PDF 内嵌图片)",
    body: "上传了 PDF 但 OCR 没识别出标注层,只抽到了标题。建议 OCR 走 GPT-4V 而不是 tesseract。",
    layer: "l2",
    created: "5h ago",
    votes: 0,
  },
  {
    id: "fb-005",
    type: "feature",
    status: "pending",
    source: "user",
    reporter: "财务 · 赵",
    subject: "L3 iron law 变更需多签",
    body: "目前 L3 修订只走单人 admin,审计风险大。建议加双人复核 + 冷却期。",
    layer: "l3",
    created: "12h ago",
    votes: 7,
  },
  {
    id: "fb-006",
    type: "bug",
    status: "addressed",
    source: "user",
    reporter: "工程 · 周",
    subject: "知识库检索结果排序错乱",
    body: "搜索 \"6061 折弯\" 时 304 不锈钢的文档排到了第 1 位。已升级 embedder 修复。",
    created: "5d ago",
    votes: 9,
  },
];

const TYPE_META = {
  issue: { label: "issue", icon: HelpCircle, color: "text-sky-700 dark:text-sky-300 border-sky-500/30" },
  feature: { label: "feature", icon: Sparkles, color: "text-violet-700 dark:text-violet-300 border-violet-500/30" },
  bug: { label: "bug", icon: Bug, color: "text-rose-700 dark:text-rose-300 border-rose-500/30" },
} as const;

const STATUS_META = {
  pending: { label: "pending", icon: MessageSquareWarning, color: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  reviewed: { label: "reviewed", icon: Eye, color: "bg-sky-500/15 text-sky-700 dark:text-sky-300" },
  addressed: { label: "addressed", icon: CheckCircle2, color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
} as const;

const STATUS_ORDER: FeedbackStatus[] = ["pending", "reviewed", "addressed"];
const TYPE_ORDER: (FeedbackType | "all")[] = ["all", "issue", "feature", "bug"];

export default function FeedbackPage() {
  const [statusFilter, setStatusFilter] = React.useState<FeedbackStatus | "all">("all");
  const [typeFilter, setTypeFilter] = React.useState<FeedbackType | "all">("all");
  const [query, setQuery] = React.useState("");
  const [selected, setSelected] = React.useState<string>(ITEMS[0].id);

  const filtered = ITEMS.filter((f) => {
    if (statusFilter !== "all" && f.status !== statusFilter) return false;
    if (typeFilter !== "all" && f.type !== typeFilter) return false;
    if (query && !f.subject.includes(query) && !f.body.includes(query)) return false;
    return true;
  });
  const active = ITEMS.find((i) => i.id === selected) ?? ITEMS[0];

  return (
    <div className="space-y-5">
      {/* Header */}
      <header>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>数智底座</span>
          <ChevronRight className="size-3" />
          <span className="text-foreground font-medium">反馈</span>
        </div>
        <div className="mt-2 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">反馈收集</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              用户 · bot 双向上报 · pending / reviewed / addressed 三态流转
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="grid grid-cols-3 gap-px text-[10px] uppercase tracking-wider font-mono">
              {STATUS_ORDER.map((s) => {
                const count = ITEMS.filter((f) => f.status === s).length;
                return (
                  <div key={s} className="rounded-sm border border-border bg-card px-3 py-1.5">
                    <div className="text-muted-foreground/70">{s}</div>
                    <div className="text-foreground text-sm font-semibold mt-0.5">{count}</div>
                  </div>
                );
              })}
            </div>
            <Button size="sm" className="h-8 text-xs gap-1">
              <Plus className="size-3" />
              提交反馈
            </Button>
          </div>
        </div>
      </header>

      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 max-w-md min-w-[240px]">
          <Search className="absolute left-2.5 top-2 size-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索反馈标题 / 正文..."
            className="pl-7 h-8 text-xs"
          />
        </div>
        <div className="flex items-center gap-1 border border-border rounded-md p-0.5">
          {(["all", ...STATUS_ORDER] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={cn(
                "px-2.5 h-7 text-[10px] uppercase tracking-wider font-mono rounded transition-colors",
                statusFilter === s
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 border border-border rounded-md p-0.5">
          {TYPE_ORDER.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTypeFilter(t)}
              className={cn(
                "px-2.5 h-7 text-[10px] uppercase tracking-wider font-mono rounded transition-colors",
                typeFilter === t
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* List + detail */}
      <div className="grid grid-cols-[1fr_1.4fr] gap-4 min-h-[420px]">
        <ScrollArea className="h-[560px] rounded-lg border border-border bg-card">
          <ul className="divide-y divide-border/60">
            {filtered.map((f) => {
              const t = TYPE_META[f.type];
              const s = STATUS_META[f.status];
              const isActive = f.id === selected;
              return (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(f.id)}
                    className={cn(
                      "w-full text-left px-4 py-3 transition-colors",
                      isActive ? "bg-muted" : "hover:bg-muted/40",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider",
                          t.color,
                        )}
                      >
                        <t.icon className="size-2.5" />
                        {t.label}
                      </span>
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider",
                          s.color,
                        )}
                      >
                        {s.label}
                      </span>
                      <span className="ml-auto text-[10px] font-mono text-muted-foreground/70">
                        {f.created}
                      </span>
                    </div>
                    <p
                      className={cn(
                        "mt-2 text-xs font-medium leading-snug",
                        isActive ? "text-foreground" : "text-foreground/90",
                      )}
                    >
                      {f.subject}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                      {f.body}
                    </p>
                    <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground/80 font-mono">
                      {f.source === "user" ? (
                        <User className="size-2.5" />
                      ) : (
                        <Bot className="size-2.5" />
                      )}
                      <span>{f.reporter}</span>
                      {f.bot && (
                        <>
                          <span>·</span>
                          <span>{f.bot}</span>
                        </>
                      )}
                      {f.layer && (
                        <>
                          <span>·</span>
                          <span className="uppercase">{f.layer}</span>
                        </>
                      )}
                      <span className="ml-auto flex items-center gap-1">
                        <ThumbsUp className="size-2.5" />
                        {f.votes}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </ScrollArea>

        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wider",
                  TYPE_META[active.type].color,
                )}
              >
                {(() => {
                  const I = TYPE_META[active.type].icon;
                  return <I className="size-3" />;
                })()}
                {TYPE_META[active.type].label}
              </span>
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wider",
                  STATUS_META[active.status].color,
                )}
              >
                {STATUS_META[active.status].label}
              </span>
              <span className="ml-auto text-[10px] font-mono text-muted-foreground">
                {active.id}
              </span>
            </div>
            <h2 className="mt-3 text-base font-semibold leading-snug">{active.subject}</h2>
            <p className="mt-2 text-sm leading-relaxed text-foreground/90">{active.body}</p>
          </div>

          <Separator />

          <section>
            <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono">
              meta
            </h3>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
              <dt className="text-muted-foreground">reporter</dt>
              <dd className="flex items-center gap-1.5">
                {active.source === "user" ? (
                  <User className="size-3 text-muted-foreground" />
                ) : (
                  <Bot className="size-3 text-muted-foreground" />
                )}
                {active.reporter}
                <span className="font-mono text-[10px] text-muted-foreground/70 ml-1">
                  ({active.source})
                </span>
              </dd>
              {active.bot && (
                <>
                  <dt className="text-muted-foreground">bot</dt>
                  <dd>{active.bot}</dd>
                </>
              )}
              {active.layer && (
                <>
                  <dt className="text-muted-foreground">memory layer</dt>
                  <dd className="font-mono uppercase">{active.layer}</dd>
                </>
              )}
              <dt className="text-muted-foreground">created</dt>
              <dd className="font-mono">{active.created}</dd>
              <dt className="text-muted-foreground">votes</dt>
              <dd className="font-mono">{active.votes}</dd>
            </dl>
          </section>

          <Separator />

          <section>
            <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono">
              thread
            </h3>
            <div className="mt-2 space-y-2">
              {[
                { who: "张总", role: "user", text: "复现:在 RFQ 邮件里 @bot 让它生成回信,抬头变量为空。" },
                { who: "运营 · 王", role: "ops", text: "已复现, 关联到模板 #rt-12。下个迭代修。" },
                { who: "系统", role: "system", text: "状态从 pending → reviewed, 关联 ticket #482。" },
              ].map((m, i) => (
                <div
                  key={i}
                  className="flex gap-2 rounded-md border border-border bg-muted/20 px-3 py-2 text-[11px] leading-relaxed"
                >
                  <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground w-16">
                    {m.role}
                  </span>
                  <div className="flex-1">
                    <span className="font-medium">{m.who}</span>
                    <span className="text-muted-foreground"> · </span>
                    <span className="text-foreground/90">{m.text}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <Separator />

          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
              <CheckCircle2 className="size-3" />
              mark addressed
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
              <Eye className="size-3" />
              mark reviewed
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 ml-auto">
              <ThumbsUp className="size-3" />
              {active.votes}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1">
              <ThumbsDown className="size-3" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}