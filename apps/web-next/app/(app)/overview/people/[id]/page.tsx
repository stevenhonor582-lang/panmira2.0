// /overview/people/[id] - 员工详情 7 Tab
"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Bot,
  Briefcase,
  Calendar,
  Clock,
  Cog,
  Crown,
  GitBranch,
  Key,
  ListChecks,
  Mail,
  Network,
  Phone,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  fetchAgents,
  fetchPerson,
  fetchPipelines,
  EMPLOYEE_STATUS_LABEL,
  type DigitalEmployee,
  type Person,
  type Pipeline,
} from "../../_components/data";
import { InitialsAvatar } from "../../_components/avatar";
import { StatusDot } from "../../_components/status-dot";
import { classifyPerson, deriveAgentStatus } from "../../_components/data";
import { cn } from "@/lib/utils";

const FOUNDER_EMAIL = "20218181@qq.com";

type TabKey =
  | "basic"
  | "employees"
  | "tasks"
  | "decisions"
  | "collaborators"
  | "resources"
  | "activity";

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
  admin: "管理员",
  operator: "操作员",
  member: "成员",
};

export default function PersonDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;

  const [person, setPerson] = React.useState<Person | null>(null);
  const [agents, setAgents] = React.useState<DigitalEmployee[]>([]);
  const [pipelines, setPipelines] = React.useState<Pipeline[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<TabKey>("basic");

  React.useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchPerson(id), fetchAgents(), fetchPipelines()])
      .then(([p, a, pl]) => {
        if (cancelled) return;
        setPerson(p);
        setAgents(a);
        setPipelines(pl);
      })
      .catch((err) => {
        if (!cancelled) setError(err && typeof err.message === "string" ? err.message : "加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

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
        <Link
          href="/overview/people"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-3" /> 返回列表
        </Link>
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/5 p-6 text-sm text-rose-700 dark:text-rose-400">
          {error ? `加载失败: ${error}` : "未找到该员工"}
        </div>
      </div>
    );
  }

  const isFounder = person.email === FOUNDER_EMAIL;
  const status = classifyPerson(person);
  const myAgents = agents; // R11: 暂未关联员工-bot 映射,先展示全部 agents
  const myPipelines = pipelines.filter((p) => p.createdBy === person.id);

  return (
    <div className="space-y-6">
      <Link
        href="/overview/people"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-3" /> 返回员工列表
      </Link>

      {/* 固定头部: 大头像 + 姓名 + sid + 角色 + 联系方式 */}
      <header className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-start gap-5 flex-wrap">
          <InitialsAvatar
            name={person.name}
            size="xl"
            seed={person.sid ?? person.email}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-3 flex-wrap">
              <h1 className="font-heading text-2xl font-semibold tracking-tight">
                {person.name}
              </h1>
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
                关联 {myAgents.length} 个数字员工
              </span>
              <span className="inline-flex items-center gap-1">
                <GitBranch className="size-3" />
                拥有 {myPipelines.length} 条流水线
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
        {tab === "basic" && <BasicTab person={person} />}
        {tab === "employees" && <EmployeesTab agents={myAgents} />}
        {tab === "tasks" && <TasksTab pipelines={myPipelines} />}
        {tab === "decisions" && <DecisionsTab />}
        {tab === "collaborators" && <CollaboratorsTab agents={agents} />}
        {tab === "resources" && <ResourcesTab />}
        {tab === "activity" && <ActivityTab />}
      </section>
    </div>
  );
}

// ===== Tab 子组件 =====

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 py-2 text-sm border-b border-border last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-foreground font-mono">{children}</dd>
    </div>
  );
}

function BasicTab({ person }: { person: Person }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="font-heading text-sm font-semibold tracking-tight mb-2">
          身份信息
        </h3>
        <dl>
          <InfoRow label="姓名">{person.name}</InfoRow>
          <InfoRow label="邮箱">{person.email}</InfoRow>
          <InfoRow label="电话">{person.phone ?? "—"}</InfoRow>
          <InfoRow label="sid">{person.sid ?? "—"}</InfoRow>
          <InfoRow label="角色">{ROLE_LABEL[person.role]}</InfoRow>
          <InfoRow label="部门">{person.department ?? "未分配"}</InfoRow>
          <InfoRow label="职位">{person.position ?? "—"}</InfoRow>
          <InfoRow label="雇佣状态">{EMPLOYEE_STATUS_LABEL[person.employeeStatus ?? "active"]}</InfoRow>
          <InfoRow label="登录启用">{person.isActive ? "启用" : "禁用"}</InfoRow>
        </dl>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="font-heading text-sm font-semibold tracking-tight mb-2">
          平台记录
        </h3>
        <dl>
          <InfoRow label="创建时间">
            {person.createdAt ? new Date(person.createdAt).toLocaleString("zh-CN") : "—"}
          </InfoRow>
          <InfoRow label="最近登录">—</InfoRow>
          <InfoRow label="登录失败次数">{person.failedAttempts}</InfoRow>
          <InfoRow label="锁定状态">
            {person.lockedUntil && new Date(person.lockedUntil) > new Date()
              ? `锁定至 ${new Date(person.lockedUntil).toLocaleString("zh-CN")}`
              : "未锁定"}
          </InfoRow>
          <InfoRow label="tenant">{person.id ? person.id.slice(0, 8) : "—"}</InfoRow>
          <InfoRow label="ID">
            <span className="text-[11px]">{person.id}</span>
          </InfoRow>
        </dl>
      </div>
    </div>
  );
}

function EmployeesTab({ agents }: { agents: DigitalEmployee[] }) {
  if (!agents.length) {
    return (
      <EmptyState
        title="暂无关联数字员工"
        hint="员工账号尚未被任何数字员工关联调度。"
      />
    );
  }
  return (
    <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
      {agents.map((a) => {
        const status = deriveAgentStatus(a);
        return (
          <Link
            key={a.id}
            href={`/employees/${a.id}`}
            className="group block rounded-lg border border-border bg-card p-4 hover:border-border/80 hover:-translate-y-0.5 transition-all"
          >
            <div className="flex items-center gap-3">
              <InitialsAvatar name={a.displayName ?? a.name} size="md" seed={a.id} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">
                  {a.displayName ?? a.name}
                </div>
                <div className="text-[11px] text-muted-foreground font-mono">
                  {a.roleTemplate ?? "general"}
                </div>
              </div>
              <StatusDot status={status} />
            </div>
            {a.description && (
              <p className="mt-3 text-xs text-muted-foreground line-clamp-2">
                {a.description}
              </p>
            )}
          </Link>
        );
      })}
    </div>
  );
}

function TasksTab({ pipelines }: { pipelines: Pipeline[] }) {
  if (!pipelines.length) {
    return (
      <EmptyState
        title="该员工尚未创建任何流水线任务"
        hint="新创建的 pipeline 任务会自动归集到这里。"
      />
    );
  }
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="text-left font-medium px-4 py-2">名称</th>
            <th className="text-left font-medium px-4 py-2">状态</th>
            <th className="text-right font-medium px-4 py-2">运行</th>
            <th className="text-right font-medium px-4 py-2">成功</th>
            <th className="text-left font-medium px-4 py-2">创建</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {pipelines.map((p) => (
            <tr key={p.id} className="hover:bg-muted/30 transition-colors">
              <td className="px-4 py-2.5">
                <Link
                  href={`/tasks/${p.id}`}
                  className="font-mono text-xs hover:text-primary transition-colors"
                >
                  {p.name}
                </Link>
              </td>
              <td className="px-4 py-2.5">
                {p.enabled ? (
                  <span className="inline-flex items-center gap-1 text-xs">
                    <StatusDot status="active" /> 在用
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <StatusDot status="paused" /> 停用
                  </span>
                )}
              </td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums">{p.runCount}</td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums">{p.successCount}</td>
              <td className="px-4 py-2.5 text-xs text-muted-foreground">
                {new Date(p.createdAt).toLocaleDateString("zh-CN")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DecisionsTab() {
  return (
    <EmptyState
      title="决策记录待接入"
      hint="等 run-log 与 approve 工作流接入后,数字员工的审批/决策日志会自动按员工聚合到此处。"
    />
  );
}

function CollaboratorsTab({ agents }: { agents: DigitalEmployee[] }) {
  if (!agents.length) {
    return <EmptyState title="暂无协作关系" hint="员工与数字员工的协作关系网络待绘制。" />;
  }
  return (
    <div className="grid gap-2 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {agents.map((a) => (
        <div
          key={a.id}
          className="flex items-center gap-2 rounded-lg border border-border bg-card p-3 text-sm"
        >
          <InitialsAvatar name={a.displayName ?? a.name} size="sm" seed={a.id} />
          <span className="truncate">{a.displayName ?? a.name}</span>
        </div>
      ))}
    </div>
  );
}

function ResourcesTab() {
  return (
    <EmptyState
      title="资源消耗待接入"
      hint="按员工聚合的 LLM token / 存储 / 计算 趋势图将在计费模块接通后自动呈现。"
    />
  );
}

function ActivityTab() {
  return (
    <EmptyState
      title="活动日志待接入"
      hint="24 小时行为 timeline 会在 activity-events 支持按 userId 过滤后渲染。"
    />
  );
}

function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/50 p-10 text-center">
      <div className="text-sm font-medium text-foreground">{title}</div>
      <div className="mt-1 text-xs text-muted-foreground max-w-md mx-auto">{hint}</div>
    </div>
  );
}
