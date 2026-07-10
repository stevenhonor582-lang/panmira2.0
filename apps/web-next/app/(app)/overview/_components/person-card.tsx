// R17-2 员工卡片 - 整卡可点 + 图标行替代三点菜单
// 区分: 登录锁定 (locked_until) / 账号启用 (is_active) / 雇佣状态 (employee_status)
"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Briefcase,
  Star,
  Mail,
  Phone,
  ShieldCheck,
  Bot,
  CheckCircle2,
  CircleDot,
  Lock,
  Power,
  PowerOff,
  RefreshCw,
  Pencil,
  Trash2,
  LogOut,
  PauseCircle,
  Eye,
  UserCheck,
  Wifi,
} from "lucide-react";
import {
  EMPLOYEE_STATUS_LABEL,
  ROLE_LABEL,
  fetchPersonActivity,
  fetchPersonAgents,
  fetchPersonStats,
  patchPerson,
  resetPersonPassword,
  deletePerson,
  type Person,
  type PersonActivity,
  type PersonStats,
  type EmployeeStatus,
} from "./data";
import { InitialsAvatar } from "./avatar";
import { cn } from "@/lib/utils";
import { getUser } from "@/lib/auth";
import { useToast } from "@/components/toast/toast-provider";

// ────────────────────────────────────────────────────────────
// 状态颜色映射 (oklch 不刺眼)
// ────────────────────────────────────────────────────────────
const STATUS_STYLE: Record<EmployeeStatus, { dot: string; chip: string; label: string }> = {
  active: {
    dot: "bg-emerald-500",
    chip: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-500/20",
    label: "在职",
  },
  paused: {
    dot: "bg-amber-500",
    chip: "bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-1 ring-amber-500/20",
    label: "停用",
  },
  departed: {
    dot: "bg-zinc-400",
    chip: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 ring-1 ring-zinc-500/20",
    label: "离职",
  },
  deleted: {
    dot: "bg-rose-500",
    chip: "bg-rose-500/10 text-rose-700 dark:text-rose-400 ring-1 ring-rose-500/20",
    label: "已删除",
  },
};

// 系统管理员: R42 起改由后端 users.is_system = true 标识(单一来源,前端不再硬编码邮箱)
const LEGACY_SYSADMIN_EMAIL = "20218181@qq.com";

interface Props {
  person: Person;
  className?: string;
  onChanged?: () => void;
}

export function PersonCard({ person, className, onChanged }: Props) {
  const toast = useToast();
  const router = useRouter();
  const me = typeof window !== "undefined" ? getUser() : null;
  // R42-FRONTEND: 系统管理员判定改走后端 is_system 字段(优先);fallback 到旧邮箱匹配
  // ——给未回填 is_system 的历史数据一个软过渡。
  const isSysAdmin =
    person.isSystem === true ||
    person.is_system === true ||
    (person.isSystem == null && person.is_system == null && person.email === LEGACY_SYSADMIN_EMAIL);
  const status: EmployeeStatus = person.employeeStatus ?? "active";
  const statusStyle = STATUS_STYLE[status];

  const [activity, setActivity] = React.useState<PersonActivity | null>(null);
  const [stats, setStats] = React.useState<PersonStats | null>(null);
  const [agentCount, setAgentCount] = React.useState<number | null>(null);
  const [resetModal, setResetModal] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    fetchPersonActivity(person.id).then((a) => {
      if (!cancelled) setActivity(a);
    });
    fetchPersonStats(person.id).then((s) => {
      if (!cancelled) setStats(s);
    });
    // R41-E: 对接 R41-C 路由 /api/v2/people/:userId/agents 数组长度
    fetchPersonAgents(person.id).then((list) => {
      if (!cancelled) setAgentCount(Array.isArray(list) ? list.length : 0);
    });
    return () => {
      cancelled = true;
    };
  }, [person.id]);

  // ────────────────────────────────────────────────────────
  // RBAC: 当前用户能对此人做什么?
  // ────────────────────────────────────────────────────────
  const myRole = (me?.role ?? "member") as Person["role"];
  const targetRole = person.role;
  const isSelf = me?.id === person.id;

  // R17-2: 整卡可点 - 任何已登录用户都可查看任何员工详情(包括自己)
  const canView = true;

  // 编辑: admin 全权, operator 仅 member, 自己也能改自己基础信息
  const canEdit =
    myRole === "admin" || (myRole === "operator" && targetRole === "member") || isSelf;

  // 管理: 启用/禁用账号
  const canToggleActive =
    !isSelf && (myRole === "admin" || (myRole === "operator" && targetRole === "member"));
  // 雇佣状态切换 (高权限)
  const canSetStatus = !isSelf && myRole === "admin" && !isSysAdmin;
  // 重置密码
  const canResetPwd =
    !isSelf && (myRole === "admin" || (myRole === "operator" && targetRole === "member"));
  // 彻底删除: 仅 admin + 离职状态 + 非系统管理员 + 非自己
  const canDelete = !isSelf && myRole === "admin" && status === "departed" && !isSysAdmin;

  // 登录锁定状态
  const locked = person.lockedUntil && new Date(person.lockedUntil) > new Date();
  const lockedMinutes = locked
    ? Math.ceil((new Date(person.lockedUntil!).getTime() - Date.now()) / 60000)
    : 0;

  // R41-E: 今日异常判定 - 异常时卡片底色变红/黄
  const todayErrors = stats?.todayErrors ?? 0;
  const todayDone = stats?.todayDone ?? 0;
  const hasError = todayErrors > 0;
  const hasWarning = stats !== null && todayDone === 0 && todayErrors === 0;

  // R41-E: 本周 token 数值化 (K/M 缩写)
  const weekTokens = stats?.weekTokens ?? 0;
  const weekTokensDisplay =
    weekTokens >= 1_000_000
      ? `${(weekTokens / 1_000_000).toFixed(1)}M`
      : weekTokens >= 10_000
      ? `${(weekTokens / 1000).toFixed(1)}K`
      : weekTokens.toLocaleString();

  // ────────────────────────────────────────────────────────
  // 整卡点击 → 进入查看模式
  // ────────────────────────────────────────────────────────
  const handleCardClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // 点了内部按钮/链接 → 不跳转
    const target = e.target as HTMLElement;
    if (target.closest("[data-no-card-click]")) return;
    router.push(`/overview/people/${person.id}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Enter / Space 触发跳转 (a11y)
    if (e.key !== "Enter" && e.key !== " ") return;
    const target = e.target as HTMLElement;
    if (target.closest("[data-no-card-click]")) return;
    e.preventDefault();
    router.push(`/overview/people/${person.id}`);
  };

  // ────────────────────────────────────────────────────────
  // 操作
  // ────────────────────────────────────────────────────────
  const handleToggleActive = async () => {
    setBusy(true);
    try {
      await patchPerson(person.id, { isActive: !person.isActive });
      onChanged?.();
    } finally {
      setBusy(false);
    }
  };

  const handleSetStatus = async (s: EmployeeStatus) => {
    setBusy(true);
    try {
      await patchPerson(person.id, { employeeStatus: s });
      onChanged?.();
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`确认彻底删除 ${person.name}?此操作不可撤销。`)) return;
    setBusy(true);
    try {
      const ok = await deletePerson(person.id);
      if (ok) onChanged?.();
      else toast.error("删除失败:请先标记为离职");
    } finally {
      setBusy(false);
    }
  };

  // 当前状态对应的反向动作 (在职→停用/离职)
  const nextStatusActions: Array<{
    key: string;
    label: string;
    icon: typeof Bot;
    onClick: () => void;
    tone?: "default" | "warn" | "danger";
  }> = [];
  if (canSetStatus) {
    if (status !== "paused") {
      nextStatusActions.push({
        key: "pause",
        label: "标记停用",
        icon: PauseCircle,
        onClick: () => handleSetStatus("paused"),
        tone: "warn",
      });
    }
    if (status !== "departed") {
      nextStatusActions.push({
        key: "depart",
        label: "标记离职",
        icon: LogOut,
        onClick: () => handleSetStatus("departed"),
        tone: "danger",
      });
    }
    if (status !== "active") {
      nextStatusActions.push({
        key: "restore",
        label: "恢复在职",
        icon: CheckCircle2,
        onClick: () => handleSetStatus("active"),
      });
    }
  }

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={handleCardClick}
        onKeyDown={handleKeyDown}
        aria-label={`查看 ${person.name} 详情`}
        className={cn(
          "group relative rounded-xl border border-border bg-card",
          "transition-[transform,box-shadow,border-color] duration-200 ease-out",
          "hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-8px_oklch(0.18_0.02_264_/_0.22)] hover:border-foreground/30",
          "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40",
          status === "departed" && "opacity-70",
          isSysAdmin && "ring-1 ring-amber-500/30",
          // R41-E: 异常时变更卡片底色
          hasError && "bg-rose-50/60 dark:bg-rose-950/20 border-rose-500/40",
          hasWarning && !hasError && "bg-amber-50/40 dark:bg-amber-950/10 border-amber-500/30",
          className,
        )}
      >
        {/* === 顶部: 身份信息 (R41-E 紧凑) === */}
        <div className="p-3 pb-2.5">
          <div className="flex items-start gap-2.5">
            <div className="relative shrink-0">
              <InitialsAvatar name={person.name} size="md" seed={person.sid ?? person.email} />
              <span
                className={cn(
                  "absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-card",
                  statusStyle.dot,
                )}
                aria-label={statusStyle.label}
              />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2 flex-wrap pr-8">
                <h3 className="text-sm font-semibold tracking-tight leading-tight text-foreground truncate">
                  {person.name}
                </h3>
                {isSysAdmin && (
                  <span
                    className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400 ring-1 ring-amber-500/30"
                    title="系统管理员 · 唯一内置账号"
                  >
                    <Star className="size-2.5 fill-amber-500 text-amber-500" />
                    <span>系统管理员</span>
                  </span>
                )}
              </div>

              <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-muted-foreground flex-wrap">
                {person.sid && (
                  <code className="font-mono text-[10px] uppercase tracking-wider rounded bg-muted px-1 py-px">
                    {person.sid}
                  </code>
                )}
                {(person.department || person.position) && (
                  <>
                    <span className="text-border">·</span>
                    <span className="inline-flex items-center gap-0.5">
                      <Briefcase className="size-2.5" />
                      {[person.department, person.position].filter(Boolean).join(" / ")}
                    </span>
                  </>
                )}
                <span className="text-border">·</span>
                <span className="inline-flex items-center gap-0.5">
                  <ShieldCheck className="size-2.5" />
                  {ROLE_LABEL[person.role]}
                </span>
              </div>
            </div>
          </div>

          {/* R41-E: 联系方式 - 横排 flex row */}
          <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground min-w-0">
            {person.email && (
              <span className="inline-flex items-center gap-1 min-w-0 flex-1">
                <Mail className="size-3 shrink-0 opacity-60" />
                <span className="truncate font-mono">{person.email}</span>
              </span>
            )}
            {person.phone && (
              <span className="inline-flex items-center gap-1 shrink-0">
                <Phone className="size-3 shrink-0 opacity-60" />
                <span className="font-mono">{maskPhone(person.phone)}</span>
              </span>
            )}
          </div>
        </div>

        {/* === R42-FRONTEND: 数据条 - 4 列,每列都加显式 label(0/2 等数字一眼可读) === */}
        <div
          className={cn(
            "px-2 py-2 border-t border-border grid grid-cols-4 gap-1 text-center items-center",
            hasError ? "bg-rose-100/40 dark:bg-rose-950/30" : "bg-muted/20",
          )}
        >
          {/* 今日完成 - 数字 + label */}
          <div className="flex flex-col items-center gap-0.5">
            <span
              className={cn(
                "text-base font-bold tabular-nums leading-none",
                hasError ? "text-rose-700 dark:text-rose-300" : "text-foreground",
              )}
              title="今日完成的对话/任务数"
            >
              {todayDone}
            </span>
            <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground leading-none">
              今日完成
            </span>
          </div>
          {/* 今日异常 - 数字(0=正常 ✓;>0 红色 ✗)+ label */}
          <div className="flex flex-col items-center gap-0.5">
            <span
              className={cn(
                "text-base font-bold tabular-nums leading-none",
                hasError ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400",
              )}
              title={hasError ? `今日异常 ${todayErrors} 个` : "今日无异常"}
            >
              {todayErrors}
            </span>
            <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground leading-none">
              今日异常
            </span>
          </div>
          {/* 名下数字员工 - 数组长度(对接 R42 真实值) */}
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-base font-bold tabular-nums leading-none text-foreground">
              {agentCount ?? "—"}
            </span>
            <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground leading-none">
              名下数字员工
            </span>
          </div>
          {/* 本周 token - 缩写值 + label */}
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-base font-bold tabular-nums leading-none text-foreground">
              {weekTokensDisplay}
            </span>
            <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground leading-none">
              本周 token
            </span>
          </div>
        </div>

        {/* === R41-E: 当前状态 - 统一图标区域(在职/登录/账号启用/Agent状态) === */}
        <div className="px-3 py-1.5 border-t border-border flex items-center justify-center gap-4 bg-card">
          {/* 雇佣状态:在职/停用/离职 */}
          <StatusIcon
            title={statusStyle.label}
            tone={status === "active" ? "ok" : status === "paused" ? "warn" : "muted"}
          >
            <UserCheck className="size-3.5" />
          </StatusIcon>
          {/* 登录状态:在线/锁定 */}
          <StatusIcon
            title={locked ? `登录锁定 ${lockedMinutes}min` : "登录正常"}
            tone={locked ? "danger" : "ok"}
          >
            {locked ? <Lock className="size-3.5" /> : <Wifi className="size-3.5" />}
          </StatusIcon>
          {/* 账号启用/禁用 */}
          <StatusIcon
            title={person.isActive ? "账号启用" : "账号禁用"}
            tone={person.isActive ? "ok" : "muted"}
          >
            <Power className="size-3.5" />
          </StatusIcon>
          {/* Agent 状态:忙碌/空闲/离线 */}
          <StatusIcon
            title={`Agent 状态:${statusLabel(stats?.status)}`}
            tone={
              stats?.status === "busy"
                ? "warn"
                : stats?.status === "idle"
                ? "ok"
                : "muted"
            }
          >
            <CircleDot className="size-3.5" />
          </StatusIcon>
        </div>

        {/* === 图标行 (替代三点菜单) === */}
        <div
          className="px-3 py-2 border-t border-border bg-card flex items-center justify-end gap-0.5 flex-wrap"
          data-no-card-click
        >
          {canView && (
            <IconAction
              label="查看详情"
              icon={Eye}
              onClick={() => router.push(`/overview/people/${person.id}`)}
              disabled={busy}
            />
          )}
          {canEdit && (
            <IconAction
              label="编辑"
              icon={Pencil}
              onClick={() => router.push(`/overview/people/${person.id}?edit=true`)}
              disabled={busy}
              tone="primary"
            />
          )}
          {canToggleActive && (
            <IconAction
              label={person.isActive ? "禁用登录" : "启用登录"}
              icon={person.isActive ? PowerOff : Power}
              onClick={handleToggleActive}
              disabled={busy}
            />
          )}
          {canResetPwd && (
            <IconAction
              label="重置密码"
              icon={RefreshCw}
              onClick={() => setResetModal(true)}
              disabled={busy}
            />
          )}
          {nextStatusActions.map((a) => (
            <IconAction
              key={a.key}
              label={a.label}
              icon={a.icon}
              onClick={a.onClick}
              disabled={busy}
              tone={a.tone}
            />
          ))}
          {canDelete && (
            <IconAction
              label="彻底删除"
              icon={Trash2}
              onClick={handleDelete}
              disabled={busy}
              tone="danger"
            />
          )}
        </div>
      </div>

      {/* === 重置密码 modal === */}
      {resetModal && (
        <ResetPasswordModal
          person={person}
          onClose={() => setResetModal(false)}
          onDone={() => {
            setResetModal(false);
            onChanged?.();
          }}
        />
      )}
    </>
  );
}

// ────────────────────────────────────────────────────────────
// StatusIcon: 状态图标 + tooltip (CSS hover) - R41-E 统一状态区
// ────────────────────────────────────────────────────────────
function StatusIcon({
  title,
  tone,
  children,
}: {
  title: string;
  tone: "ok" | "warn" | "danger" | "muted";
  children: React.ReactNode;
}) {
  const toneClass =
    tone === "ok"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "warn"
      ? "text-amber-600 dark:text-amber-400"
      : tone === "danger"
      ? "text-rose-600 dark:text-rose-400"
      : "text-zinc-400 dark:text-zinc-500";
  return (
    <span
      className={cn(
        "relative inline-flex items-center justify-center p-0.5 rounded-md cursor-default",
        "group/status",
        toneClass,
      )}
      title={title}
    >
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1",
          "px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap",
          "bg-foreground text-background shadow-md",
          "opacity-0 scale-95 transition-opacity transition-transform duration-150",
          "group-hover/status:opacity-100 group-hover/status:scale-100",
        )}
      >
        {title}
      </span>
    </span>
  );
}

// ────────────────────────────────────────────────────────────
// IconAction: 图标按钮 + tooltip (CSS hover,无依赖)
// ────────────────────────────────────────────────────────────
function IconAction({
  label,
  icon: Icon,
  onClick,
  disabled,
  tone = "default",
}: {
  label: string;
  icon: typeof Bot;
  onClick: () => void;
  disabled?: boolean;
  tone?: "default" | "primary" | "warn" | "danger";
}) {
  const toneClass =
    tone === "primary"
      ? "text-foreground hover:bg-foreground/10"
      : tone === "warn"
      ? "text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
      : tone === "danger"
      ? "text-rose-600 dark:text-rose-400 hover:bg-rose-500/10"
      : "text-muted-foreground hover:text-foreground hover:bg-muted";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      data-no-card-click
      data-action-button
      className={cn(
        "relative inline-flex items-center justify-center rounded-md p-1.5",
        "transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40",
        "group/icon",
        toneClass,
      )}
    >
      <Icon className="size-3.5" />
      {/* tooltip - CSS hover 显示 */}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5",
          "px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap",
          "bg-foreground text-background shadow-md",
          "opacity-0 scale-95 transition-opacity transition-transform duration-150",
          "group-hover/icon:opacity-100 group-hover/icon:scale-100",
          "group-focus-visible/icon:opacity-100 group-focus-visible/icon:scale-100",
        )}
      >
        {label}
      </span>
    </button>
  );
}

// ────────────────────────────────────────────────────────────
// 子组件
// ────────────────────────────────────────────────────────────

// 把后端 status 映射成中文短词
function statusLabel(s: "busy" | "idle" | "offline" | undefined): string {
  if (s === "busy") return "忙碌";
  if (s === "idle") return "空闲";
  if (s === "offline") return "离线";
  return "—";
}

function ResetPasswordModal({
  person,
  onClose,
  onDone,
}: {
  person: Person;
  onClose: () => void;
  onDone: () => void;
}) {
  const [pwd, setPwd] = React.useState("");
  const [confirmPwd, setConfirmPwd] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const toast = useToast();

  const handleSave = async () => {
    if (pwd.length < 6) {
      setErr("密码至少 6 位");
      return;
    }
    if (pwd !== confirmPwd) {
      setErr("两次输入不一致");
      return;
    }
    setBusy(true);
    setErr(null);
    const ok = await resetPersonPassword(person.id, pwd);
    setBusy(false);
    if (ok) {
      toast.success(`${person.name} 的密码已重置`);
      onDone();
    } else {
      setErr("重置失败,请检查权限");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
      data-no-card-click
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-heading text-base font-semibold mb-1">
          重置密码 · {person.name}
        </h3>
        <p className="text-xs text-muted-foreground mb-4">
          为该员工设置新密码,会覆盖原密码。
        </p>
        <div className="space-y-3">
          <label className="block">
            <span className="text-xs text-muted-foreground">新密码 (≥ 6 位)</span>
            <input
              type="password"
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              placeholder="新密码"
            />
          </label>
          <label className="block">
            <span className="text-xs text-muted-foreground">确认密码</span>
            <input
              type="password"
              value={confirmPwd}
              onChange={(e) => setConfirmPwd(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              placeholder="再次输入"
            />
          </label>
          {err && <div className="text-xs text-rose-600 dark:text-rose-400">{err}</div>}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={busy}
            className="rounded-md bg-foreground text-background px-3 py-1.5 text-xs font-medium hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// 工具
// ────────────────────────────────────────────────────────────

function maskPhone(phone: string): string {
  if (phone.length < 7) return phone;
  return phone.slice(0, 3) + "****" + phone.slice(-4);
}
