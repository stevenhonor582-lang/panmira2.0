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
  Bot, Plus, Trash2, Sparkles, Clock, CheckCircle2, AlertTriangle,
  Info,
  Pencil, MoreVertical, Loader2,
} from "lucide-react";
import {
  fetchAgents, fetchPipelines, fetchPersonAgents, patchPersonAgents,
  fetchPersonUsage, fetchActivityEvents,
  EMPLOYEE_STATUS_LABEL,
  type Person, type PersonAgent, type DigitalEmployee, type Pipeline, type ActivityEvent,
} from "../../../_components/data";
import { api } from "@/lib/api";
import {
  ResourcePicker,
  type ResourceItem,
} from "@/components/resource-picker/resource-picker";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { InitialsAvatar } from "../../../_components/avatar";
import { StatusDot } from "../../../_components/status-dot";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deriveAgentStatus } from "../../../_components/data";
import { cn } from "@/lib/utils";
import {
  PersonEditPane, PersonEditBar, PersonText, PersonSelect,
  personToDraft, diffDraft,
} from "./person-edit-mode";
export { CollaboratorsTab } from "./collab-overview";

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
  person, reload, externalEdit, onEditConsumed,
}: {
  person: Person;
  reload: () => void;
  externalEdit?: boolean;
  onEditConsumed?: (editing: boolean) => void;
}) {
  const FIELDS = ["name", "email", "phone", "department", "position", "role", "avatarUrl", "employeeStatus"];
  const [draft, setDraft] = React.useState<Record<string, unknown>>({});
  const [origDraft, setOrigDraft] = React.useState<Record<string, unknown>>({});

  React.useEffect(() => {
    const d = personToDraft(person, FIELDS);
    setDraft(d);
    setOrigDraft(d);
  }, [person.id]);

  const isDirty = React.useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(origDraft),
    [draft, origDraft],
  );

  const enterEdit = () => onEditConsumed?.(true);

  return (
    <PersonEditPane id={person.id} label="basics" onSaved={reload} controlledEditing={externalEdit} onEditingChange={onEditConsumed}>
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
        const handleCancel = () => {
          setDraft(origDraft);
          ctx.cancelEdit();
        };

        // ── 查看模式:卡片布局 ──
        if (!ctx.editing) {
          return (
            <div className="space-y-4">
              {/* 基本信息 卡片 */}
              <div className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold">基本信息</h3>
                  <button
                    type="button"
                    onClick={enterEdit}
                    className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium bg-foreground text-background hover:opacity-90 transition-opacity"
                  >
                    <Pencil className="size-3" />
                    编辑
                  </button>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <div className="text-[10.5px] font-mono uppercase tracking-[0.18em] text-foreground/45 mb-1">姓名</div>
                    <div className="text-sm">{person.name || "—"}</div>
                  </div>
                  <div>
                    <div className="text-[10.5px] font-mono uppercase tracking-[0.18em] text-foreground/45 mb-1">邮箱</div>
                    <code className="font-mono text-[12.5px]">{person.email || "—"}</code>
                  </div>
                  <div>
                    <div className="text-[10.5px] font-mono uppercase tracking-[0.18em] text-foreground/45 mb-1">手机</div>
                    <code className="font-mono text-[12.5px]">{person.phone || "—"}</code>
                  </div>
                  <div>
                    <div className="text-[10.5px] font-mono uppercase tracking-[0.18em] text-foreground/45 mb-1">部门</div>
                    <div className="text-sm">{person.department || "—"}</div>
                  </div>
                  <div>
                    <div className="text-[10.5px] font-mono uppercase tracking-[0.18em] text-foreground/45 mb-1">职位</div>
                    <div className="text-sm">{person.position || "—"}</div>
                  </div>
                  <div>
                    <div className="text-[10.5px] font-mono uppercase tracking-[0.18em] text-foreground/45 mb-1">角色</div>
                    <div className="text-sm">{ROLE_OPTIONS.find((r) => r.value === person.role)?.label ?? person.role}</div>
                  </div>
                </div>
              </div>

              {/* 账号信息 卡片 */}
              <div className="rounded-xl border border-border bg-card p-5">
                <h3 className="text-sm font-semibold mb-4">账号信息</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <div className="text-[10.5px] font-mono uppercase tracking-[0.18em] text-foreground/45 mb-1">SID</div>
                    <code className="font-mono text-[12.5px]">{person.sid ?? "—"}</code>
                  </div>
                  <div>
                    <div className="text-[10.5px] font-mono uppercase tracking-[0.18em] text-foreground/45 mb-1">雇佣状态</div>
                    <div className="text-sm">{EMPLOYEE_STATUS_LABEL[person.employeeStatus ?? "active"]}</div>
                  </div>
                  <div>
                    <div className="text-[10.5px] font-mono uppercase tracking-[0.18em] text-foreground/45 mb-1">账号状态</div>
                    <div className="text-sm">{person.isActive ? "启用" : "禁用"}</div>
                  </div>
                  <div>
                    <div className="text-[10.5px] font-mono uppercase tracking-[0.18em] text-foreground/45 mb-1">登录失败</div>
                    <div className="text-sm font-mono">{person.failedAttempts} 次</div>
                  </div>
                  <div>
                    <div className="text-[10.5px] font-mono uppercase tracking-[0.18em] text-foreground/45 mb-1">创建于</div>
                    <div className="text-sm font-mono text-[12.5px]">{person.createdAt ? new Date(person.createdAt).toLocaleString("zh-CN", { hour12: false }) : "—"}</div>
                  </div>
                </div>
              </div>
            </div>
          );
        }

        // ── 编辑模式:表单 + 底部保存/取消 ──
        return (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-5 space-y-5">
              <h3 className="text-sm font-semibold">编辑基本信息</h3>
              <div className="grid gap-5 md:grid-cols-2">
                <PersonText label="姓名" field="name" value={person.name} editing draft={draft} setDraft={setDraft} placeholder="真实姓名" />
                <PersonText label="邮箱" field="email" value={person.email} editing draft={draft} setDraft={setDraft} placeholder="name@company.com" mono />
                <PersonText label="手机" field="phone" value={person.phone} editing draft={draft} setDraft={setDraft} placeholder="11 位手机号" mono />
                <PersonText label="部门" field="department" value={person.department} editing draft={draft} setDraft={setDraft} placeholder="例如:创始团队 / 销售部" />
                <PersonText label="职位" field="position" value={person.position} editing draft={draft} setDraft={setDraft} placeholder="例如:CEO / 销售经理" />
                <PersonSelect label="角色" field="role" value={person.role} editing draft={draft} setDraft={setDraft} options={ROLE_OPTIONS} />
                <PersonSelect label="雇佣状态" field="employeeStatus" value={person.employeeStatus ?? "active"} editing draft={draft} setDraft={setDraft} options={STATUS_OPTIONS} />
                <PersonText label="头像 URL" field="avatarUrl" value={person.avatarUrl} editing draft={draft} setDraft={setDraft} placeholder="https://..." mono hint="留空用首字母" />
              </div>
            </div>
            <div className="flex justify-end">
              <PersonEditBar onSave={handleSave} onCancel={handleCancel} isDirty={isDirty} />
            </div>
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
// R27 规则 4: 添加 agent 用 ResourcePicker,过滤 owner_user_id IS NULL 或 = 当前真人
// ────────────────────────────────────────────────────────────
interface UnassignedAgent {
  id: string;
  name: string;
  display_name: string | null;
  description: string | null;
  role_template: string | null;
  owner_user_id: string | null;
}

export function EmployeesTab({ person, onChanged }: { person: Person; onChanged?: () => void }) {
  const [bound, setBound] = React.useState<PersonAgent[]>([]);
  const [available, setAvailable] = React.useState<UnassignedAgent[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [acting, setActing] = React.useState(false);

  const load = React.useCallback(() => {
    setLoading(true);
    // R27 规则 4: 只拉未归属 OR 归属当前真人的 agent(filter=unassigned&owner=)
    const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "";
    const fp = (p: string) => (API_BASE ? API_BASE + p : p);
    Promise.all([
      fetchPersonAgents(person.id),
      api<{ data?: UnassignedAgent[] } | UnassignedAgent[]>(
        fp(`/api/v2/employees?filter=unassigned&owner=${person.id}&limit=200`),
      ).then((r) => {
        const arr = (r as any)?.data ?? r;
        return Array.isArray(arr) ? arr : [];
      }).catch(() => []),
    ])
      .then(([b, a]) => {
        setBound(b);
        setAvailable(a);
      })
      .finally(() => setLoading(false));
  }, [person.id]);

  React.useEffect(() => {
    load();
  }, [load]);

  const handleAdd = async (selected: UnassignedAgent[]) => {
    if (selected.length === 0) return;
    setBusy(true);
    try {
      await patchPersonAgents(person.id, selected.map((s) => s.id), "add");
      setPickerOpen(false);
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
  // R27 规则 4: 排除已绑定的,剩余的喂给 ResourcePicker
  const pickerItems: ResourceItem[] = available
    .filter((a) => !boundIds.has(a.id))
    .map((a) => ({
      id: a.id,
      label: a.display_name ?? a.name,
      description: a.description ?? a.role_template ?? "general",
    }));
  const canAdd = pickerItems.length > 0;

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
          <p className="mt-1 text-[11px] text-muted-foreground/80">
            添加时只显示<strong className="text-foreground">未归属</strong>或<strong className="text-foreground">已归属此真人</strong>的 agent(R27 规则 4)。
          </p>
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
                    data-testid={`person-agent-link-${a.id.slice(0, 8)}`}
                  >
                    {a.display_name ?? a.name}
                  </Link>
                  <div className="text-[11px] text-muted-foreground font-mono flex items-center gap-1.5">
                    <span>{a.role_template ?? "general"}</span>
                    {a.deployment_type && (
                      <>
                        <span className="text-foreground/25">·</span>
                        <span className="uppercase tracking-wider">{a.deployment_type}</span>
                      </>
                    )}
                  </div>
                </div>
                <StatusDot status={a.is_active ? "active" : "paused"} />
                <DropdownMenu>
                  <DropdownMenuTrigger
                    className="inline-flex items-center justify-center size-6 rounded-md text-foreground/40 hover:text-foreground hover:bg-muted/40 disabled:opacity-50"
                    disabled={acting}
                    data-testid={`person-agent-menu-${a.id.slice(0, 8)}`}
                  >
                    {acting ? <Loader2 className="size-3.5 animate-spin" /> : <MoreVertical className="size-3.5" />}
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    {/* R42-FRONTEND: '提升为模板' / '复制为模板' 两项已删(后端 promote / copy-as-template 端点不存在)。
                        模板创建走 POST /api/v2/admin/agent-templates(snapshot),
                        实例 → 实例生成走 /api/v2/admin/agent-templates/:id/instantiate。
                        解绑仍保留。*/}
                    <DropdownMenuItem
                      onClick={() => handleRemove(a.id)}
                      data-testid={`person-agent-unbind-${a.id.slice(0, 8)}`}
                    >
                      <Trash2 className="size-4" /> 解绑
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              {a.description && (
                <p className="mt-3 text-xs text-muted-foreground line-clamp-2">{a.description}</p>
              )}
              <div className="mt-3 flex items-center justify-between text-[10.5px] font-mono text-muted-foreground/70">
                <span title={a.created_at}>
                  创建 {new Date(a.created_at).toLocaleDateString("zh-CN")}
                </span>
                <span className="font-mono text-[10px] text-foreground/30">{a.id.slice(0, 8)}…</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* R27 规则 4: 添加按钮 → 弹 ResourcePicker(过滤未归属/已归属此真人) */}
      <div>
        <button
          onClick={() => setPickerOpen(true)}
          disabled={!canAdd || busy}
          className="inline-flex items-center gap-1 rounded-lg border border-dashed border-border px-3 py-2 text-[12px] text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors disabled:opacity-40"
          data-testid="add-employee-trigger"
        >
          <Plus className="size-3.5" /> {canAdd ? "添加数字员工" : "无可添加的数字员工(全部已归属他人)"}
        </button>
        <ResourcePicker
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          title="选择数字员工(未归属 或 已归属此真人)"
          items={pickerItems}
          selectedIds={[]}
          confirmText={`绑定 ${busy ? "中…" : ""}`}
          onConfirm={(sel) => void handleAdd(sel as unknown as UnassignedAgent[])}
        />
      </div>

      {/* R42-FRONTEND: '复制为模板' 弹窗已删(后端 copy-as-template 端点 404)。
          模板创建走模板管理页 POST /api/v2/admin/agent-templates。*/}
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
// collaborators tab — R17-2 协作对象 3 分区清晰说明
// 协作对象 = 员工可调度哪些数字员工 + 访问哪些知识库 + 使用哪些任务模板
// ────────────────────────────────────────────────────────────
// R26-A: CollaboratorsTab 已移至 collab-overview.tsx(关系总图,只读)
// 删掉原 3 个配置入口(可调度数字员工/可访问知识库/可使用任务模板),重做为只读关系总览。
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
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
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
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
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
