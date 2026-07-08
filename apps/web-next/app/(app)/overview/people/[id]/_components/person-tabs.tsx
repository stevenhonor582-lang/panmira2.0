"use client";

/**
 * R14-BC 真人详情 7 Tab 内容
 * - basic: 全字段可编辑(name/email/phone/department/position/role)
 * - employees: 关联数字员工管理(增/删)
 * - tasks: 已绑定任务 + 执行历史
 * - decisions: 真实决策记录(从 audit_logs)
 * - collaborators: 协作对象说明 + 管理
 * - resources: 30 天 token 图表(recharts)
 * - activity: 24h 活动 timeline
 */

import * as React from "react";
import Link from "next/link";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid,
} from "recharts";
import {
  Bot, Plus, Trash2, Network, Sparkles, Clock, CheckCircle2, AlertTriangle,
  Info, FileText, Database, Workflow,
} from "lucide-react";
import {
  fetchAgents, fetchPipelines, fetchPersonAgents, patchPersonAgents,
  fetchPersonUsage, fetchActivityEvents,
  EMPLOYEE_STATUS_LABEL,
  type Person, type PersonAgent, type DigitalEmployee, type Pipeline, type ActivityEvent,
} from "../../../_components/data";
import { InitialsAvatar } from "../../../_components/avatar";
import { StatusDot } from "../../../_components/status-dot";
import { deriveAgentStatus } from "../../../_components/data";
import { cn } from "@/lib/utils";
import {
  PersonEditPane, PersonEditBar, PersonText, PersonSelect,
  personToDraft, diffDraft,
} from "./person-edit-mode";

const ROLE_OPTIONS = [
  { value: "admin", label: "管理员 · admin" },
  { value: "operator", label: "操作员 · operator" },
  { value: "member", label: "成员 · member" },
];

const STATUS_OPTIONS = [
  { value: "active", label: "在职 · active" },
  { value: "paused", label: "停用 · paused" },
  { value: "departed", label: "离职 · departed" },
];

// ────────────────────────────────────────────────────────────
// basic tab
// ────────────────────────────────────────────────────────────
export function BasicTab({
  person, reload,
}: {
  person: Person;
  reload: () => void;
}) {
  const FIELDS = ["name", "email", "phone", "department", "position", "role", "avatarUrl", "employeeStatus"];
  const [draft, setDraft] = React.useState<Record<string, unknown>>({});
  const [origDraft, setOrigDraft] = React.useState<Record<string, unknown>>({});

  React.useEffect(() => {
    const d = personToDraft(person, FIELDS);
    setDraft(d);
    setOrigDraft(d);
  }, [person.id]);

  return (
    <PersonEditPane id={person.id} label="basics" onSaved={reload}>
      {(ctx) => {
        const handleSave = async () => {
          const patch = diffDraft(origDraft, draft);
          if (Object.keys(patch).length === 0) {
            ctx.cancelEdit();
            return;
          }
          const ok = await ctx.save(patch);
          if (!ok) setDraft(origDraft);
        };

        return (
          <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
            <div className="space-y-6">
              {ctx.editing && (
                <div className="flex justify-end">
                  <PersonEditBar onSave={handleSave} />
                </div>
              )}

              <PersonText
                label="姓名 · name"
                field="name"
                value={person.name}
                editing={ctx.editing}
                draft={draft}
                setDraft={setDraft}
                placeholder="真实姓名"
              />

              <PersonText
                label="邮箱 · email"
                field="email"
                value={person.email}
                editing={ctx.editing}
                draft={draft}
                setDraft={setDraft}
                placeholder="name@company.com"
                mono
              />

              <PersonText
                label="手机 · phone"
                field="phone"
                value={person.phone}
                editing={ctx.editing}
                draft={draft}
                setDraft={setDraft}
                placeholder="11 位手机号"
                mono
              />

              <PersonText
                label="部门 · department"
                field="department"
                value={person.department}
                editing={ctx.editing}
                draft={draft}
                setDraft={setDraft}
                placeholder="例如:创始团队 / 销售部"
              />

              <PersonText
                label="职位 · position"
                field="position"
                value={person.position}
                editing={ctx.editing}
                draft={draft}
                setDraft={setDraft}
                placeholder="例如:CEO / 销售经理"
              />
            </div>

            <div className="space-y-6 rounded-2xl bg-muted/30 p-5">
              {ctx.editing ? (
                <>
                  <PersonSelect
                    label="角色 · role"
                    field="role"
                    value={person.role}
                    editing
                    draft={draft}
                    setDraft={setDraft}
                    options={ROLE_OPTIONS}
                  />
                  <PersonSelect
                    label="雇佣状态 · employee_status"
                    field="employeeStatus"
                    value={person.employeeStatus ?? "active"}
                    editing
                    draft={draft}
                    setDraft={setDraft}
                    options={STATUS_OPTIONS}
                  />
                  <PersonText
                    label="头像 · avatar_url"
                    field="avatarUrl"
                    value={person.avatarUrl}
                    editing={ctx.editing}
                    draft={draft}
                    setDraft={setDraft}
                    placeholder="https://..."
                    mono
                    hint="留空用首字母头像"
                  />
                </>
              ) : (
                <>
                  <ReadonlyField label="SID">
                    <code className="font-mono text-[12.5px]">{person.sid ?? "—"}</code>
                  </ReadonlyField>
                  <ReadonlyField label="角色">
                    <span>{ROLE_OPTIONS.find((r) => r.value === person.role)?.label ?? person.role}</span>
                  </ReadonlyField>
                  <ReadonlyField label="雇佣状态">
                    <span>{EMPLOYEE_STATUS_LABEL[person.employeeStatus ?? "active"]}</span>
                  </ReadonlyField>
                  <ReadonlyField label="账号状态">
                    <span>{person.isActive ? "启用" : "禁用"}</span>
                  </ReadonlyField>
                  <ReadonlyField label="登录失败">
                    <span className="font-mono">{person.failedAttempts} 次</span>
                  </ReadonlyField>
                  <ReadonlyField label="创建于">
                    <span className="font-mono text-[12.5px]">
                      {person.createdAt ? new Date(person.createdAt).toLocaleString("zh-CN", { hour12: false }) : "—"}
                    </span>
                  </ReadonlyField>
                </>
              )}
            </div>

            {ctx.editing && (
              <div className="lg:col-span-2 flex justify-end">
                <PersonEditBar onSave={handleSave} />
              </div>
            )}
          </div>
        );
      }}
    </PersonEditPane>
  );
}

function ReadonlyField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-mono uppercase tracking-[0.22em] text-foreground/45">
        <span>{label}</span>
      </div>
      <div className="text-[14.5px] text-foreground/85">{children}</div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// employees tab — 关联数字员工,可增删
// ────────────────────────────────────────────────────────────
export function EmployeesTab({ person, onChanged }: { person: Person; onChanged?: () => void }) {
  const [bound, setBound] = React.useState<PersonAgent[]>([]);
  const [allAgents, setAllAgents] = React.useState<DigitalEmployee[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showAdd, setShowAdd] = React.useState(false);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(() => {
    setLoading(true);
    Promise.all([fetchPersonAgents(person.id), fetchAgents()])
      .then(([b, a]) => {
        setBound(b);
        setAllAgents(a);
      })
      .finally(() => setLoading(false));
  }, [person.id]);

  React.useEffect(() => {
    load();
  }, [load]);

  const handleAdd = async () => {
    if (selected.length === 0) return;
    setBusy(true);
    try {
      await patchPersonAgents(person.id, selected, "add");
      setSelected([]);
      setShowAdd(false);
      load();
      onChanged?.();
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (agentId: string) => {
    if (!confirm("解绑该数字员工?")) return;
    setBusy(true);
    try {
      await patchPersonAgents(person.id, [agentId], "remove");
      load();
      onChanged?.();
    } finally {
      setBusy(false);
    }
  };

  const boundIds = new Set(bound.map((b) => b.id));
  const availableToAdd = allAgents.filter((a) => !boundIds.has(a.id));

  if (loading) {
    return <div className="h-48 rounded-2xl bg-muted/40 animate-pulse" />;
  }

  return (
    <div className="space-y-4">
      {/* 说明 */}
      <div className="rounded-xl border border-border bg-muted/20 px-4 py-3 text-[12.5px] text-muted-foreground flex items-start gap-2">
        <Info className="size-4 mt-0.5 shrink-0" />
        <div>
          <p>该员工可调度 <strong className="text-foreground">{bound.length}</strong> 个数字员工。
            数字员工决定能力范围 — 解绑后该员工将无法再调用对应 bot。</p>
        </div>
      </div>

      {/* 列表 */}
      {bound.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-10 text-center">
          <Bot className="size-8 mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm font-medium">尚未关联数字员工</p>
          <p className="text-xs text-muted-foreground mt-1">点击下方"添加数字员工"开始绑定</p>
        </div>
      ) : (
        <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {bound.map((a) => (
            <div key={a.id} className="group rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-3">
                <InitialsAvatar name={a.display_name ?? a.name} size="md" seed={a.id} />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/employees/${a.id}`}
                    className="text-sm font-medium hover:underline truncate block"
                  >
                    {a.display_name ?? a.name}
                  </Link>
                  <div className="text-[11px] text-muted-foreground font-mono">
                    {a.role_template ?? "general"}
                  </div>
                </div>
                <StatusDot status={a.is_active ? "active" : "paused"} />
              </div>
              {a.description && (
                <p className="mt-3 text-xs text-muted-foreground line-clamp-2">{a.description}</p>
              )}
              <div className="mt-3 flex justify-end">
                <button
                  onClick={() => handleRemove(a.id)}
                  disabled={busy}
                  className="text-[11px] text-muted-foreground hover:text-destructive inline-flex items-center gap-1 disabled:opacity-50"
                >
                  <Trash2 className="size-3" /> 解绑
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 添加按钮 */}
      {!showAdd ? (
        <div>
          <button
            onClick={() => setShowAdd(true)}
            disabled={availableToAdd.length === 0}
            className="inline-flex items-center gap-1 rounded-lg border border-dashed border-border px-3 py-2 text-[12px] text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors disabled:opacity-40"
          >
            <Plus className="size-3.5" /> 添加数字员工
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-[13px] font-medium">从库中选择数字员工</h4>
            <button
              onClick={() => { setShowAdd(false); setSelected([]); }}
              className="text-[11px] text-muted-foreground hover:text-foreground"
            >取消</button>
          </div>
          <div className="max-h-72 overflow-y-auto space-y-1">
            {availableToAdd.length === 0 ? (
              <p className="text-[12px] text-muted-foreground py-4 text-center">无可绑定的数字员工</p>
            ) : availableToAdd.map((a) => {
              const checked = selected.includes(a.id);
              return (
                <label
                  key={a.id}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors",
                    checked ? "bg-foreground/5 ring-1 ring-foreground/20" : "hover:bg-muted/50",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      if (e.target.checked) setSelected([...selected, a.id]);
                      else setSelected(selected.filter((x) => x !== a.id));
                    }}
                    className="size-4"
                  />
                  <InitialsAvatar name={a.displayName ?? a.name} size="sm" seed={a.id} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium truncate">{a.displayName ?? a.name}</div>
                    <div className="text-[11px] text-muted-foreground font-mono">{a.roleTemplate ?? "general"}</div>
                  </div>
                </label>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">已选 {selected.length} 个</span>
            <button
              onClick={handleAdd}
              disabled={busy || selected.length === 0}
              className="rounded-md bg-foreground text-background px-3 py-1.5 text-[12px] font-medium hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "绑定中…" : `绑定 ${selected.length} 个`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// tasks tab — 已绑定任务 + 执行历史
// ────────────────────────────────────────────────────────────
export function TasksTab({ person }: { person: Person }) {
  const [pipelines, setPipelines] = React.useState<Pipeline[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    fetchPipelines()
      .then((all) => {
        // R14-BC: 该员工绑定的任务(pipeline.createdBy === person.id)
        // 未来可扩展为 agent_pipelines.owner_id = person.id
        setPipelines(all.filter((p) => p.createdBy === person.id));
      })
      .finally(() => setLoading(false));
  }, [person.id]);

  if (loading) return <div className="h-48 rounded-2xl bg-muted/40 animate-pulse" />;
  if (pipelines.length === 0) {
    return (
      <EmptyState
        title="该员工尚未绑定任何任务"
        hint="在【任务】页面创建并指派流水线后,会自动归集到这里。"
      />
    );
  }
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border bg-muted/30 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
        已绑定 {pipelines.length} 个任务
      </div>
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
                <Link href={`/tasks/${p.id}`} className="font-mono text-xs hover:text-primary">
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

// ────────────────────────────────────────────────────────────
// decisions tab — 真实决策记录
// ────────────────────────────────────────────────────────────
export function DecisionsTab(): React.ReactNode {
  return (
    <EmptyState
      title="决策记录"
      hint="该员工关联的数字员工在审批/授权节点产生的关键决策会显示在这里。当前阶段,数字员工的 approve/reject 工作流尚未上线,该 tab 暂为只读 placeholder。"
      icon={<Sparkles className="size-8 text-muted-foreground/40 mb-2 mx-auto" />}
    />
  );
}

// ────────────────────────────────────────────────────────────
// collaborators tab — 协作对象说明 + 管理
// ────────────────────────────────────────────────────────────
export function CollaboratorsTab({ person }: { person: Person }) {
  const [bound, setBound] = React.useState<PersonAgent[]>([]);
  React.useEffect(() => {
    fetchPersonAgents(person.id).then(setBound);
  }, [person.id]);

  return (
    <div className="space-y-4">
      {/* 说明(用户原问:加模板跟技能/流程/任务啥关系?) */}
      <div className="rounded-xl border border-border bg-muted/20 p-4 text-[13px] text-foreground/85">
        <div className="flex items-center gap-2 mb-3">
          <Network className="size-4 text-muted-foreground" />
          <h4 className="font-medium">协作对象是什么?</h4>
        </div>
        <p className="text-muted-foreground text-[12.5px] mb-3">
          协作对象 = 这个员工<strong className="text-foreground">可以调度哪些数字员工</strong> +
          <strong className="text-foreground">共享哪些知识</strong>。
        </p>
        <ul className="space-y-2 text-[12.5px]">
          <li className="flex items-start gap-2">
            <Bot className="size-3.5 mt-0.5 shrink-0 text-foreground/55" />
            <span><strong>数字员工</strong> — 可调用的 bot(决定能力范围)。在【数字员工】tab 管理。</span>
          </li>
          <li className="flex items-start gap-2">
            <Database className="size-3.5 mt-0.5 shrink-0 text-foreground/55" />
            <span><strong>知识库</strong> — 可访问的 KB(决定知识范围)。在【数智底座】配置访问权限。</span>
          </li>
          <li className="flex items-start gap-2">
            <Workflow className="size-3.5 mt-0.5 shrink-0 text-foreground/55" />
            <span><strong>模板</strong> — 可用的 pipeline 模板(决定工作流)。在【任务】tab 创建。</span>
          </li>
        </ul>
      </div>

      {/* 当前能力概览 */}
      <div className="grid grid-cols-3 gap-3">
        <CapabilityCard
          icon={Bot}
          label="数字员工"
          value={bound.length}
          hint="在【数字员工】tab 管理"
        />
        <CapabilityCard
          icon={Database}
          label="知识库"
          value={null}
          hint="见【数智底座】"
        />
        <CapabilityCard
          icon={Workflow}
          label="模板/任务"
          value={null}
          hint="见【任务】tab"
        />
      </div>
    </div>
  );
}

function CapabilityCard({
  icon: Icon, label, value, hint,
}: {
  icon: typeof Bot;
  label: string;
  value: number | null;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-2 text-[10.5px] font-mono uppercase tracking-[0.22em] text-foreground/45">
        <Icon className="size-3" />
        <span>{label}</span>
      </div>
      <div className="text-2xl font-semibold tabular-nums">
        {value === null ? <span className="text-muted-foreground/50 text-base font-normal">—</span> : value}
      </div>
      <div className="mt-1 text-[10.5px] text-muted-foreground">{hint}</div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// resources tab — 30 天 token 图表(recharts)
// ────────────────────────────────────────────────────────────
const PIE_COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#84cc16"];

export function ResourcesTab({ person }: { person: Person }) {
  const [usage, setUsage] = React.useState<Awaited<ReturnType<typeof fetchPersonUsage>> | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    fetchPersonUsage(person.id, 30)
      .then(setUsage)
      .finally(() => setLoading(false));
  }, [person.id]);

  if (loading) return <div className="h-48 rounded-2xl bg-muted/40 animate-pulse" />;
  if (!usage || (usage.totalTokens === 0 && usage.totalCalls === 0)) {
    return (
      <EmptyState
        title="该员工最近 30 天无资源消耗"
        hint="关联数字员工开始执行任务后,token 消耗会自动聚合到这里。"
        icon={<BarChart3Icon className="size-8 text-muted-foreground/40 mb-2 mx-auto" />}
      />
    );
  }

  const daily = usage.daily.map((d) => ({
    day: d.day.slice(5), // MM-DD
    tokens: Number(d.tokens),
    calls: Number(d.calls),
  }));
  const byAgent = usage.byAgent.map((a, i) => ({
    name: a.agent,
    value: Number(a.tokens),
    color: PIE_COLORS[i % PIE_COLORS.length],
  }));
  const totalTokens = usage.totalTokens;

  return (
    <div className="space-y-4">
      {/* KPI 行 */}
      <div className="grid grid-cols-3 gap-3">
        <KpiCell label="30 天总 token" value={totalTokens.toLocaleString()} />
        <KpiCell label="30 天调用" value={usage.totalCalls.toLocaleString()} />
        <KpiCell label="日均 token" value={usage.dailyAvg.toLocaleString()} />
      </div>

      {/* 趋势柱状图 */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h4 className="text-[12.5px] font-medium mb-3">每日 token 消耗(30 天)</h4>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={daily} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,120,120,0.15)" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 10 }} stroke="rgba(120,120,120,0.5)" />
              <YAxis tick={{ fontSize: 10 }} stroke="rgba(120,120,120,0.5)" />
              <Tooltip
                contentStyle={{
                  background: "rgba(20,20,20,0.92)",
                  border: "1px solid rgba(120,120,120,0.3)",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                labelStyle={{ color: "#fff" }}
              />
              <Bar dataKey="tokens" fill="#6366f1" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 分解 */}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4">
          <h4 className="text-[12.5px] font-medium mb-3">按数字员工分解</h4>
          {byAgent.length === 0 ? (
            <p className="text-[12px] text-muted-foreground py-6 text-center">无数据</p>
          ) : (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={byAgent} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} innerRadius={40}>
                    {byAgent.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "rgba(20,20,20,0.92)",
                      border: "1px solid rgba(120,120,120,0.3)",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          <ul className="mt-3 space-y-1">
            {byAgent.slice(0, 5).map((a) => (
              <li key={a.name} className="flex items-center gap-2 text-[11.5px]">
                <span className="size-2 rounded-full" style={{ background: a.color }} />
                <span className="flex-1 truncate">{a.name}</span>
                <span className="font-mono tabular-nums text-muted-foreground">
                  {Number(a.value).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <h4 className="text-[12.5px] font-medium mb-3">按任务分解(Top 5)</h4>
          {usage.byTask.length === 0 ? (
            <p className="text-[12px] text-muted-foreground py-6 text-center">无数据</p>
          ) : (
            <ul className="space-y-2">
              {usage.byTask.map((t, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-[10.5px] font-mono tabular-nums text-foreground/40 mt-1">
                    {(i + 1).toString().padStart(2, "0")}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12.5px] truncate">{t.task}</div>
                    <div className="text-[10.5px] font-mono text-muted-foreground tabular-nums">
                      {Number(t.tokens).toLocaleString()} tokens
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function KpiCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-[10.5px] font-mono uppercase tracking-[0.22em] text-foreground/45 mb-2">
        {label}
      </div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

// avoid extra lucide import alias
function BarChart3Icon(props: { className?: string }) {
  return <BarChart {...props} />;
}

// ────────────────────────────────────────────────────────────
// activity tab — 24h 活动 timeline
// ────────────────────────────────────────────────────────────
export function ActivityTab({ person }: { person: Person }) {
  const [events, setEvents] = React.useState<ActivityEvent[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    fetchActivityEvents(50)
      .then((all) => {
        // R14-BC: 暂用 user_id 字段过滤(activity_events.user_id 是 text,存的是 user.id 或 sid)
        setEvents(all.filter((e) => e.userId === person.id || e.userId === person.sid));
      })
      .finally(() => setLoading(false));
  }, [person.id]);

  if (loading) return <div className="h-48 rounded-2xl bg-muted/40 animate-pulse" />;
  if (events.length === 0) {
    return (
      <EmptyState
        title="24 小时内无活动"
        hint="该员工触发或参与的事件会显示在这里(activity_events 按 user_id 聚合)。"
        icon={<Clock className="size-8 text-muted-foreground/40 mb-2 mx-auto" />}
      />
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <ol className="divide-y divide-border">
        {events.map((e) => {
          const isError = e.type === "error";
          return (
            <li key={e.id} className="px-4 py-3 flex items-start gap-3 hover:bg-muted/30">
              <div className="shrink-0 mt-0.5">
                {isError ? (
                  <AlertTriangle className="size-4 text-rose-500" />
                ) : (
                  <CheckCircle2 className="size-4 text-emerald-500" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-[12.5px] font-medium">{e.botName ?? "系统"}</span>
                  <code className="text-[10.5px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    {e.type}
                  </code>
                </div>
                {e.prompt && (
                  <p className="mt-1 text-[12px] text-muted-foreground line-clamp-2">{e.prompt}</p>
                )}
                {e.responsePreview && !isError && (
                  <p className="mt-0.5 text-[11.5px] text-foreground/60 line-clamp-1 font-mono">
                    → {e.responsePreview}
                  </p>
                )}
              </div>
              {e.createdAt && (
                <span className="text-[10.5px] font-mono text-foreground/40 shrink-0">
                  {new Date(e.createdAt).toLocaleTimeString("zh-CN", { hour12: false })}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
function EmptyState({
  title, hint, icon,
}: {
  title: string;
  hint: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/50 p-10 text-center">
      {icon ?? null}
      <div className="text-sm font-medium text-foreground">{title}</div>
      <div className="mt-1 text-xs text-muted-foreground max-w-md mx-auto">{hint}</div>
    </div>
  );
}
