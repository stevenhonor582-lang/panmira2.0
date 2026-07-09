// /overview/people/[id] - 真人详情 7 Tab
// R17-2: 紧凑卡片头部 + tab 行右侧醒目 [编辑] 按钮 + 支持 ?edit=true 自动进编辑
"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft, Bot, Briefcase, Calendar, Clock, Cog, Star, GitBranch,
  Key, ListChecks, Mail, Network, Phone, ShieldCheck, Sparkles,
  Pencil, Power, PowerOff, Lock, CheckCircle2,
} from "lucide-react";
import { useParams } from "next/navigation";
import {
  fetchPerson,
  EMPLOYEE_STATUS_LABEL,
  ROLE_LABEL,
  type Person,
  type EmployeeStatus,
} from "../../_components/data";
import { InitialsAvatar } from "../../_components/avatar";
import { StatusDot } from "../../_components/status-dot";
import { classifyPerson } from "../../_components/data";
import { cn } from "@/lib/utils";
import { getUser } from "@/lib/auth";
import {
  BasicTab, EmployeesTab, TasksTab, DecisionsTab,
  CollaboratorsTab, ResourcesTab, ActivityTab,
} from "./_components/person-tabs";

// 系统管理员: 唯一内置账号
const SYSADMIN_EMAIL = "20218181@qq.com";

type TabKey =
  | "basic" | "employees" | "tasks" | "decisions"
  | "collaborators" | "resources" | "activity";

const TABS: Array<{ key: TabKey; label: string; icon: typeof Key }> = [
  { key: "basic", label: "基础信息", icon: Key },
  { key: "employees", label: "数字员工", icon: Bot },
  { key: "tasks", label: "任务历史", icon: ListChecks },
  { key: "decisions", label: "决策记录", icon: Sparkles },
  { key: "collaborators", label: "协作对象", icon: Network },
  { key: "resources", label: "资源消耗", icon: Briefcase },
  { key: "activity", label: "活动日志", icon: Clock },
];

// 状态颜色 (与卡片一致)
const STATUS_CHIP: Record<EmployeeStatus, string> = {
  active: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-500/20",
  paused: "bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-1 ring-amber-500/20",
  departed: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 ring-1 ring-zinc-500/20",
  deleted: "bg-rose-500/10 text-rose-700 dark:text-rose-400 ring-1 ring-rose-500/20",
};

export default function PersonDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialEdit = searchParams?.get("edit") === "true";

  const [person, setPerson] = React.useState<Person | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  // R17-2: 全局编辑模式 (从 ?edit=true 进入时自动开启,只对 basic tab 生效)
  const [globalEdit, setGlobalEdit] = React.useState(initialEdit);
  const [tab, setTab] = React.useState<TabKey>("basic");

  const me = typeof window !== "undefined" ? getUser() : null;

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

  // ?edit=true 时强制切到 basic tab,触发编辑模式
  React.useEffect(() => {
    if (initialEdit) {
      setTab("basic");
      setGlobalEdit(true);
    }
  }, [initialEdit]);

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

  const isSysAdmin = person.email === SYSADMIN_EMAIL;
  const status = classifyPerson(person);
  const employeeStatus: EmployeeStatus = person.employeeStatus ?? "active";
  const isSelf = me?.id === person.id;
  const myRole = (me?.role ?? "member") as Person["role"];
  // 编辑权限 (与卡片一致)
  const canEdit =
    myRole === "admin" || (myRole === "operator" && person.role === "member") || isSelf;

  const locked = person.lockedUntil && new Date(person.lockedUntil) > new Date();

  return (
    <div className="space-y-6">
      <BackLink />

      {/* === 紧凑卡片头部 (单列布局,不左右脱节) === */}
      <header className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-5">
          <div className="flex items-start gap-4 flex-wrap">
            <div className="relative shrink-0">
              <InitialsAvatar name={person.name} size="xl" seed={person.sid ?? person.email} />
              <span
                className={cn(
                  "absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full ring-2 ring-card",
                  employeeStatus === "active" && "bg-emerald-500",
                  employeeStatus === "paused" && "bg-amber-500",
                  employeeStatus === "departed" && "bg-zinc-400",
                  employeeStatus === "deleted" && "bg-rose-500",
                )}
                aria-label={EMPLOYEE_STATUS_LABEL[employeeStatus]}
              />
            </div>

            <div className="min-w-0 flex-1">
              {/* 第一行: 姓名 + SID + 系统管理员 badge */}
              <div className="flex items-baseline gap-2 flex-wrap">
                <h1 className="font-heading text-xl font-semibold tracking-tight">
                  {person.name}
                </h1>
                {person.sid && (
                  <code className="font-mono text-[11px] uppercase tracking-wider rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                    {person.sid}
                  </code>
                )}
                {isSysAdmin && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10.5px] font-medium text-amber-700 dark:text-amber-400 ring-1 ring-amber-500/30"
                    title="系统管理员 · 唯一内置账号"
                  >
                    <Star className="size-3 fill-amber-500 text-amber-500" />
                    <span>系统管理员</span>
                  </span>
                )}
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium",
                    STATUS_CHIP[employeeStatus],
                  )}
                >
                  {EMPLOYEE_STATUS_LABEL[employeeStatus]}
                </span>
              </div>

              {/* 第二行: 角色 · 部门 · 职位 */}
              <div className="mt-2 flex items-center gap-2 text-[12.5px] text-muted-foreground flex-wrap">
                <span className="inline-flex items-center gap-1">
                  <ShieldCheck className="size-3.5" />
                  {ROLE_LABEL[person.role]}
                </span>
                {(person.department || person.position) && (
                  <>
                    <span className="text-border">·</span>
                    <span className="inline-flex items-center gap-1">
                      <Briefcase className="size-3.5" />
                      {[person.department, person.position].filter(Boolean).join(" / ")}
                    </span>
                  </>
                )}
                <span className="text-border">·</span>
                <StatusDot status={status.status} label={status.reason} withLabel />
              </div>

              {/* 第三行: 联系方式 */}
              <div className="mt-2 flex items-center gap-3 text-[12px] text-muted-foreground flex-wrap">
                {person.email && (
                  <span className="inline-flex items-center gap-1 font-mono">
                    <Mail className="size-3.5" />
                    {person.email}
                  </span>
                )}
                {person.phone && (
                  <span className="inline-flex items-center gap-1 font-mono">
                    <Phone className="size-3.5" />
                    {person.phone}
                  </span>
                )}
              </div>

              {/* 第四行: 状态 (账号启用/登录锁定) + 元数据 */}
              <div className="mt-3 flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1",
                    person.isActive
                      ? "bg-sky-500/10 text-sky-700 dark:text-sky-400 ring-sky-500/20"
                      : "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 ring-zinc-500/20",
                  )}
                >
                  {person.isActive ? <Power className="size-2.5" /> : <PowerOff className="size-2.5" />}
                  {person.isActive ? "账号启用" : "账号禁用"}
                </span>

                {locked ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium text-rose-700 dark:text-rose-400 ring-1 ring-rose-500/20">
                    <Lock className="size-2.5" />
                    登录锁定
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="size-2.5" />
                    登录正常
                  </span>
                )}

                <span className="inline-flex items-center gap-1">
                  <Calendar className="size-3" />
                  创建于 {new Date(person.createdAt ?? Date.now()).toLocaleDateString("zh-CN")}
                </span>
                {person.department && (
                  <span className="inline-flex items-center gap-1">
                    <GitBranch className="size-3" />
                    {person.department}
                  </span>
                )}
                <span className="inline-flex items-center gap-1">
                  <Cog className="size-3" />
                  {EMPLOYEE_STATUS_LABEL[employeeStatus]}
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* === Tab 行 (sticky) + 右侧醒目 [编辑] 按钮 === */}
      <nav
        aria-label="详情 tab"
        className="sticky top-12 z-20 -mx-6 px-6 bg-background/95 backdrop-blur border-b border-border"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-0.5 overflow-x-auto -mb-px flex-1 min-w-0">
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

          {/* R23: 编辑按钮移到 BasicTab 内部 */}
        </div>
      </nav>

      {/* Tab 内容 */}
      <section aria-live="polite" className="min-h-[40vh]">
        {tab === "basic" && (
          <BasicTab
            person={person}
            reload={load}
            externalEdit={globalEdit}
            onEditConsumed={setGlobalEdit}
          />
        )}
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
