// R11 /overview/people - 组织部 (员工列表)
// 区分: 在职 / 停用 / 离职 三 tab
"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2, Filter, Users, Plus } from "lucide-react";
import {
  fetchPeople,
  EMPLOYEE_STATUS_LABEL,
  type Person,
  type EmployeeStatus,
} from "../_components/data";
import { PersonCard } from "../_components/person-card";
import { getUser } from "@/lib/auth";
import { cn } from "@/lib/utils";

const STATUS_TABS: Array<{ value: EmployeeStatus | "all"; label: string }> = [
  { value: "active", label: "在职" },
  { value: "paused", label: "停用" },
  { value: "departed", label: "离职" },
  { value: "all", label: "全部" },
];

export default function PeoplePage() {
  const [people, setPeople] = React.useState<Person[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<EmployeeStatus | "all">("active");
  const me = typeof window !== "undefined" ? getUser() : null;
  const canCreate = me?.role === "admin" || me?.role === "operator";

  const load = React.useCallback(() => {
    setPeople(null);
    fetchPeople()
      .then((data) => setPeople(data))
      .catch((err) => {
        setError(err && typeof err.message === "string" ? err.message : "加载失败");
      });
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const counts = React.useMemo(() => {
    if (!people) return { all: 0, active: 0, paused: 0, departed: 0 };
    return {
      all: people.length,
      active: people.filter((p) => (p.employeeStatus ?? "active") === "active").length,
      paused: people.filter((p) => p.employeeStatus === "paused").length,
      departed: people.filter((p) => p.employeeStatus === "departed").length,
    };
  }, [people]);

  const filtered = React.useMemo(() => {
    if (!people) return [];
    const list = [...people];
    // 排序: admin 在前, 然后按姓名
    list.sort((a, b) => {
      const order: Record<Person["role"], number> = { admin: 0, operator: 1, member: 2 };
      if (a.role !== b.role) return order[a.role] - order[b.role];
      return a.name.localeCompare(b.name, "zh-CN");
    });
    if (tab === "all") return list;
    if (tab === "active") {
      return list.filter((p) => (p.employeeStatus ?? "active") === "active");
    }
    return list.filter((p) => p.employeeStatus === tab);
  }, [people, tab]);

  return (
    <div className="space-y-6">
      {/* 头部 */}
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
            <span>公司综阅</span>
            <span className="text-border">/</span>
            <span>组织部</span>
          </div>
          <h1 className="mt-1.5 font-heading text-2xl font-semibold tracking-tight">
            组织部
          </h1>
          <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
            平台正式员工账号 · 管理员 / 操作员 / 成员 三级 · 每张卡片对应一个数字身份。
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs text-muted-foreground font-mono">
            {people ? `${counts.active} 位正式员工` : "—"}
          </div>
          {canCreate && (
            <Link
              href="/overview/people/new"
              className="inline-flex items-center gap-1.5 rounded-md bg-foreground text-background px-3 py-1.5 text-xs font-medium hover:opacity-90 transition-opacity"
            >
              <Plus className="size-3.5" />
              添加员工
            </Link>
          )}
        </div>
      </header>

      {/* 状态 tab */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
          <Filter className="size-3" />
          <span>状态</span>
        </span>
        <div className="inline-flex items-center rounded-lg border border-border bg-card p-0.5">
          {STATUS_TABS.map((opt) => {
            const active = tab === opt.value;
            const count = counts[opt.value];
            return (
              <button
                key={opt.value}
                onClick={() => setTab(opt.value)}
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
          当前状态下没有员工
        </div>
      )}

      {people && filtered.length > 0 && (
        <section
          aria-label="员工卡片"
          className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
        >
          {filtered.map((p) => (
            <PersonCard key={p.id} person={p} onChanged={load} />
          ))}
        </section>
      )}
    </div>
  );
}
