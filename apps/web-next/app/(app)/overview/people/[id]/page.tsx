// /overview/people/[id] - 真人详情 7 Tab (R14-BC 全可编辑)
"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft, Bot, Briefcase, Calendar, Clock, Cog, Crown, GitBranch,
  Key, ListChecks, Mail, Network, Phone, ShieldCheck, Sparkles,
} from "lucide-react";
import { useParams } from "next/navigation";
import {
  fetchPerson,
  EMPLOYEE_STATUS_LABEL,
  type Person,
} from "../../_components/data";
import { InitialsAvatar } from "../../_components/avatar";
import { StatusDot } from "../../_components/status-dot";
import { classifyPerson } from "../../_components/data";
import { cn } from "@/lib/utils";
import {
  BasicTab, EmployeesTab, TasksTab, DecisionsTab,
  CollaboratorsTab, ResourcesTab, ActivityTab,
} from "./_components/person-tabs";

const FOUNDER_EMAIL = "20218181@qq.com";

type TabKey =
  | "basic" | "employees" | "tasks" | "decisions"
  | "collaborators" | "resources" | "activity";

const TABS: Array<{ key: TabKey; label: string; icon: typeof Key }> = [
  { key: "basic", label: "基础", icon: Key },
  { key: "employees", label: "数字员工", icon: Bot },
  { key: "tasks", label: "任务历史", icon: ListChecks },
  { key: "decisions", label: "决策记录", icon: Sparkles },
  { key: "collaborators", label: "协作对象", icon: Network },
  { key: "resources", label: "资源消耗", icon: Briefcase },
  { key: "activity", label: "活动日志", icon: Clock },
];

const ROLE_LABEL: Record<Person["role"], string> = {
  admin: "管理员", operator: "操作员", member: "成员",
};

export default function PersonDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [person, setPerson] = React.useState<Person | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<TabKey>("basic");

  const load = React.useCallback(() => {
    if (!id) return;
    setLoading(true);
    fetchPerson(id)
      .then((p) => setPerson(p))
      .catch((err) => setError(err?.message ?? "加载失败"))
      .finally(() => setLoading(false));
  }, [id]);

  React.useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="grid place-items-center min-h-[40vh] text-sm text-muted-foreground">
        加载员工信息…
      </div>
    );
  }

  if (error || !person) {
    return (
      <div className="space-y-4">
        <BackLink />
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/5 p-6 text-sm text-rose-700 dark:text-rose-400">
          {error ? `加载失败: ${error}` : "未找到该员工"}
        </div>
      </div>
    );
  }

  const isFounder = person.email === FOUNDER_EMAIL;
  const status = classifyPerson(person);

  return (
    <div className="space-y-6">
      <BackLink />

      {/* 头部 */}
      <header className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-start gap-5 flex-wrap">
          <InitialsAvatar name={person.name} size="xl" seed={person.sid ?? person.email} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-3 flex-wrap">
              <h1 className="font-heading text-2xl font-semibold tracking-tight">{person.name}</h1>
              {person.sid && (
                <code className="font-mono text-xs uppercase tracking-wider rounded bg-muted px-2 py-0.5 text-muted-foreground">
                  {person.sid}
                </code>
              )}
              {isFounder && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                  <Crown className="size-3" />
                  <span>FOUNDER · 唯一 admin</span>
                </span>
              )}
            </div>

            <div className="mt-2 flex items-center gap-3 flex-wrap text-sm">
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <ShieldCheck className="size-3.5" />
                {ROLE_LABEL[person.role]}
              </span>
              <span className="text-border">·</span>
              <StatusDot status={status.status} label={status.reason} withLabel />
              {person.email && (
                <>
                  <span className="text-border">·</span>
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground font-mono text-xs">
                    <Mail className="size-3.5" />
                    {person.email}
                  </span>
                </>
              )}
              {person.phone && (
                <>
                  <span className="text-border">·</span>
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground font-mono text-xs">
                    <Phone className="size-3.5" />
                    {person.phone}
                  </span>
                </>
              )}
            </div>

            <div className="mt-3 flex items-center gap-4 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Calendar className="size-3" />
                创建于 {new Date(person.createdAt ?? Date.now()).toLocaleDateString("zh-CN")}
              </span>
              <span className="inline-flex items-center gap-1">
                <Cog className="size-3" />
                雇佣状态 {EMPLOYEE_STATUS_LABEL[person.employeeStatus ?? "active"]}
              </span>
              <span className="inline-flex items-center gap-1">
                <GitBranch className="size-3" />
                部门 {person.department ?? "未分配"}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Tab bar (sticky) */}
      <nav
        aria-label="详情 tab"
        className="sticky top-12 z-20 -mx-6 px-6 bg-background/95 backdrop-blur border-b border-border"
      >
        <div className="flex items-center gap-0.5 overflow-x-auto -mb-px">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = t.key === tab;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-2.5 text-xs whitespace-nowrap border-b-2 transition-colors",
                  active
                    ? "border-foreground text-foreground font-medium"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="size-3.5" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Tab 内容 */}
      <section aria-live="polite" className="min-h-[40vh]">
        {tab === "basic" && <BasicTab person={person} reload={load} />}
        {tab === "employees" && <EmployeesTab person={person} onChanged={load} />}
        {tab === "tasks" && <TasksTab person={person} />}
        {tab === "decisions" && <DecisionsTab />}
        {tab === "collaborators" && <CollaboratorsTab person={person} />}
        {tab === "resources" && <ResourcesTab person={person} />}
        {tab === "activity" && <ActivityTab person={person} />}
      </section>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/overview/people"
      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
    >
      <ArrowLeft className="size-3" /> 返回员工列表
    </Link>
  );
}
