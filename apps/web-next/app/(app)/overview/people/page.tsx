// /overview/people - 真人卡片列表
// 设计意图: editorial grid (8-12 列 + asymmetric gaps) 而非默认均匀卡
// 史德飞特殊处理 (FOUNDER badge)
"use client";

import * as React from "react";
import { Loader2, Filter, Users } from "lucide-react";
import { fetchPeople, type Person } from "../_components/data";
import { PersonCard } from "../_components/person-card";
import { cn } from "@/lib/utils";

const ROLE_OPTIONS: Array<{ value: Person["role"] | "all"; label: string }> = [
  { value: "all", label: "全部" },
  { value: "admin", label: "管理员" },
  { value: "operator", label: "操作员" },
  { value: "member", label: "成员" },
];

const FOUNDER_EMAIL = "20218181@qq.com"; // 史德飞 - 唯一种子 admin

export default function PeoplePage() {
  const [people, setPeople] = React.useState<Person[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState<Person["role"] | "all">("all");

  React.useEffect(() => {
    let cancelled = false;
    fetchPeople()
      .then((data) => {
        if (!cancelled) setPeople(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err && typeof err.message === "string" ? err.message : "加载失败");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = React.useMemo(() => {
    if (!people) return [];
    const sorted = [...people].sort((a, b) => {
      // admin 在前 (史德飞最先), 其余按角色 + 姓名
      if (a.role !== b.role) {
        const order: Record<Person["role"], number> = { admin: 0, operator: 1, member: 2 };
        return order[a.role] - order[b.role];
      }
      return a.name.localeCompare(b.name, "zh-CN");
    });
    return filter === "all" ? sorted : sorted.filter((p) => p.role === filter);
  }, [people, filter]);

  const counts = React.useMemo(() => {
    if (!people) return { all: 0, admin: 0, operator: 0, member: 0 };
    return {
      all: people.length,
      admin: people.filter((p) => p.role === "admin").length,
      operator: people.filter((p) => p.role === "operator").length,
      member: people.filter((p) => p.role === "member").length,
    };
  }, [people]);

  return (
    <div className="space-y-6">
      {/* 头部 */}
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
            <span>公司综阅</span>
            <span className="text-border">/</span>
            <span>真人</span>
          </div>
          <h1 className="mt-1.5 font-heading text-2xl font-semibold tracking-tight">
            团队成员
          </h1>
          <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
            平台真人账号 · admin / operator / member 三级 · 每张卡片对应一个数字身份。
          </p>
        </div>
        <div className="text-xs text-muted-foreground font-mono">
          {people ? `${counts.all} 个真人` : "—"}
        </div>
      </header>

      {/* 过滤器 (segmented control, 2-click 可达) */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
          <Filter className="size-3" />
          <span>筛选</span>
        </span>
        <div className="inline-flex items-center rounded-lg border border-border bg-card p-0.5">
          {ROLE_OPTIONS.map((opt) => {
            const active = filter === opt.value;
            const count = counts[opt.value];
            return (
              <button
                key={opt.value}
                onClick={() => setFilter(opt.value)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors",
                  active
                    ? "bg-foreground text-background font-medium"
                    : "text-muted-foreground hover:text-foreground",
                )}
                aria-pressed={active}
              >
                <span>{opt.label}</span>
                {people && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0 text-[10px] font-mono tabular-nums",
                      active ? "bg-background/20 text-background" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/5 p-4 text-sm text-rose-700 dark:text-rose-400">
          数据加载失败: {error}
        </div>
      )}

      {!people && !error && (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-44 rounded-xl border border-border bg-card animate-pulse"
            />
          ))}
        </div>
      )}

      {people && filtered.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-10 text-center text-sm text-muted-foreground">
          <Users className="size-5 mx-auto mb-2 opacity-50" />
          当前筛选下没有真人
        </div>
      )}

      {people && filtered.length > 0 && (
        <section
          aria-label="真人卡片"
          className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
        >
          {filtered.map((p) => (
            <PersonCard
              key={p.id}
              person={p}
              isFounder={p.email === FOUNDER_EMAIL}
            />
          ))}
        </section>
      )}
    </div>
  );
}
