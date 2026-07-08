// R11 员工卡片 - 状态板风格
// 区分: 登录锁定 (locked_until) / 账号启用 (is_active) / 雇佣状态 (employee_status)
"use client";

import * as React from "react";
import Link from "next/link";
import {
  Briefcase,
  Crown,
  Mail,
  MoreHorizontal,
  Phone,
  ShieldCheck,
  Bot,
  CheckCircle2,
  AlertTriangle,
  CircleDot,
  Lock,
  BarChart3,
  PowerOff,
  Power,
  RefreshCw,
  Pencil,
  Trash2,
  LogOut,
  PauseCircle,
} from "lucide-react";
import {
  EMPLOYEE_STATUS_LABEL,
  ROLE_LABEL,
  fetchPersonActivity,
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

const FOUNDER_EMAIL = "20218181@qq.com";

interface Props {
  person: Person;
  className?: string;
  onChanged?: () => void;
}

export function PersonCard({ person, className, onChanged }: Props) {
  const me = typeof window !== "undefined" ? getUser() : null;
  const isFounder = person.email === FOUNDER_EMAIL;
  const status: EmployeeStatus = person.employeeStatus ?? "active";
  const statusStyle = STATUS_STYLE[status];

  const [activity, setActivity] = React.useState<PersonActivity | null>(null);
  const [stats, setStats] = React.useState<PersonStats | null>(null);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [resetModal, setResetModal] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    let cancelled = false;
    fetchPersonActivity(person.id).then((a) => {
      if (!cancelled) setActivity(a);
    });
    fetchPersonStats(person.id).then((s) => {
      if (!cancelled) setStats(s);
    });
    return () => {
      cancelled = true;
    };
  }, [person.id]);

  // 关闭菜单 (click outside)
  React.useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  // ────────────────────────────────────────────────────────
  // RBAC: 当前用户能对此人做什么?
  // ────────────────────────────────────────────────────────
  const myRole = (me?.role ?? "member") as Person["role"];
  const targetRole = person.role;
  const isSelf = me?.id === person.id;

  // admin → 看所有人卡片 (除了自己也能看): 全权
  // operator → 看 member 卡片: 启用/禁用/停用/编辑(受限)
  // operator → 看 admin/operator 卡片: 只读
  // member → 看自己: 改自己密码 (跳 /settings)
  const canSetActive = !isSelf && (myRole === "admin" || (myRole === "operator" && targetRole === "member"));
  const canSetStatus = !isSelf && myRole === "admin";
  const canResetPwd = !isSelf && (myRole === "admin" || (myRole === "operator" && targetRole === "member"));
  const canEdit = !isSelf && (myRole === "admin" || (myRole === "operator" && targetRole === "member"));
  const canDelete = !isSelf && myRole === "admin" && status === "departed";
  const canShowMenu = canSetActive || canSetStatus || canResetPwd || canEdit || canDelete;

  // 登录锁定状态
  const locked = person.lockedUntil && new Date(person.lockedUntil) > new Date();
  const lockedMinutes = locked
    ? Math.ceil((new Date(person.lockedUntil!).getTime() - Date.now()) / 60000)
    : 0;

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
      setMenuOpen(false);
    }
  };

  const handleSetStatus = async (s: EmployeeStatus) => {
    setBusy(true);
    try {
      await patchPerson(person.id, { employeeStatus: s });
      onChanged?.();
    } finally {
      setBusy(false);
      setMenuOpen(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`确认彻底删除 ${person.name}?此操作不可撤销。`)) return;
    setBusy(true);
    try {
      const ok = await deletePerson(person.id);
      if (ok) onChanged?.();
      else alert("删除失败:请先标记为离职");
    } finally {
      setBusy(false);
      setMenuOpen(false);
    }
  };

  return (
    <>
      <div
        className={cn(
          "group relative rounded-xl border border-border bg-card",
          "transition-[transform,box-shadow,border-color] duration-200 ease-out",
          "hover:-translate-y-0.5 hover:shadow-[0_4px_16px_-4px_oklch(0.18_0.02_264_/_0.18)] hover:border-border/80",
          // R14-BC: 删 overflow-hidden,菜单(Popover)需要溢出可见
          status === "departed" && "opacity-70",
          isFounder && "ring-1 ring-amber-500/20",
          className,
        )}
      >
        {/* === 顶部: 身份信息 === */}
        <div className="p-4 pb-3">
          <div className="flex items-start gap-3">
            <div className="relative shrink-0">
              <InitialsAvatar
                name={person.name}
                size="lg"
                seed={person.sid ?? person.email}
              />
              <span
                className={cn(
                  "absolute -bottom-0.5 -right-0.5 size-3 rounded-full ring-2 ring-card",
                  statusStyle.dot,
                )}
                aria-label={statusStyle.label}
              />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2 flex-wrap pr-8">
                <h3 className="text-base font-semibold tracking-tight leading-tight text-foreground truncate">
                  {person.name}
                </h3>
                {isFounder && (
                  <span
                    className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400"
                    title="创始人"
                  >
                    <Crown className="size-2.5" />
                    <span>创始人</span>
                  </span>
                )}
              </div>

              <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground flex-wrap">
                {person.sid && (
                  <code className="font-mono text-[10px] uppercase tracking-wider rounded bg-muted px-1.5 py-0.5">
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
              </div>

              <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap">
                <span className="inline-flex items-center gap-0.5">
                  <ShieldCheck className="size-2.5" />
                  {ROLE_LABEL[person.role]}
                </span>
              </div>
            </div>
          </div>

          {/* 联系方式 */}
          <div className="mt-3 grid gap-1 text-xs text-muted-foreground">
            {person.email && (
              <div className="flex items-center gap-1.5 min-w-0">
                <Mail className="size-3 shrink-0 opacity-60" />
                <span className="truncate font-mono">{person.email}</span>
              </div>
            )}
            {person.phone && (
              <div className="flex items-center gap-1.5">
                <Phone className="size-3 shrink-0 opacity-60" />
                <span className="font-mono">{maskPhone(person.phone)}</span>
              </div>
            )}
          </div>
        </div>

        {/* === 中部: 有意义数据栏(今日完成/异常/状态 + 本周 token) === */}
        <div className="px-4 py-2 border-t border-border bg-muted/20 grid grid-cols-3 gap-1 text-center">
          <DataCell
            icon={CheckCircle2}
            value={stats?.todayDone ?? 0}
            label="今日完成"
            ok={!!stats && stats.todayDone > 0}
          />
          <DataCell
            icon={AlertTriangle}
            value={stats?.todayErrors ?? 0}
            label="今日异常"
            danger={!!stats && stats.todayErrors > 0}
          />
          <DataCell
            icon={CircleDot}
            value={statusLabel(stats?.status)}
            label="当前状态"
            textual
          />
        </div>
        <div className="px-4 py-1.5 border-t border-border bg-muted/10 flex items-center gap-2 text-[10.5px] text-muted-foreground">
          <BarChart3 className="size-3" />
          <span className="font-mono">本周 token</span>
          <div className="flex-1 h-1 rounded-full bg-border overflow-hidden">
            <div
              className="h-full bg-foreground/70"
              style={{ width: `${stats?.weekPct ?? 0}%` }}
            />
          </div>
          <span className="font-mono tabular-nums">
            {(stats?.weekTokens ?? 0).toLocaleString()} / {(stats?.weekCap ?? 0).toLocaleString()}
          </span>
        </div>

        {/* === 底部: 状态行 + 菜单 === */}
        <div className="px-4 py-2.5 border-t border-border flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                statusStyle.chip,
              )}
            >
              <span className={cn("size-1.5 rounded-full", statusStyle.dot)} />
              {statusStyle.label}
            </span>

            {/* 登录锁定 */}
            {locked ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium text-rose-700 dark:text-rose-400 ring-1 ring-rose-500/20">
                <Lock className="size-2.5" />
                登录锁定 {lockedMinutes}min
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="size-2.5" />
                登录正常
              </span>
            )}

            {/* 账号启用状态 */}
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
          </div>

          <div className="flex items-center gap-1">
            {/* R14-BC: 删"查看"按钮(用户反馈跟编辑重复,查看无意义) */}
            {canEdit && (
              <Link
                href={`/overview/people/${person.id}?edit=true`}
                className="inline-flex items-center justify-center rounded-md px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors gap-1"
              >
                <Pencil className="size-3" />
                <span>编辑</span>
              </Link>
            )}
            {canShowMenu && (
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="inline-flex items-center justify-center rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                  disabled={busy}
                  aria-label="操作菜单"
                >
                  <MoreHorizontal className="size-4" />
                </button>
                {menuOpen && (
                  <PersonActionsMenu
                    person={person}
                    me={me!}
                    canSetActive={canSetActive}
                    canSetStatus={canSetStatus}
                    canResetPwd={canResetPwd}
                    canDelete={canDelete}
                    busy={busy}
                    onToggleActive={handleToggleActive}
                    onSetStatus={handleSetStatus}
                    onResetPwd={() => {
                      setMenuOpen(false);
                      setResetModal(true);
                    }}
                    onDelete={handleDelete}
                  />
                )}
              </div>
            )}
          </div>
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
// 子组件
// ────────────────────────────────────────────────────────────

function DataCell({
  icon: Icon,
  value,
  label,
  danger = false,
  ok = false,
  textual = false,
}: {
  icon: typeof Bot;
  value: number | string;
  label: string;
  danger?: boolean;
  ok?: boolean;
  textual?: boolean;
}) {
  const valueClass = textual
    ? "text-[12px] font-medium leading-none"
    : "text-sm font-semibold tabular-nums leading-none";
  const colorClass = danger
    ? "text-rose-600 dark:text-rose-400"
    : ok
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-foreground";
  const iconClass = danger
    ? "text-rose-500"
    : ok
    ? "text-emerald-500"
    : "text-muted-foreground";
  return (
    <div className="flex flex-col items-center gap-0.5">
      <Icon className={cn("size-3", iconClass)} />
      <span className={cn(valueClass, colorClass)}>{value}</span>
      <span className="text-[10px] text-muted-foreground leading-none">{label}</span>
    </div>
  );
}

// 把后端 status 映射成中文短词
function statusLabel(s: "busy" | "idle" | "offline" | undefined): string {
  if (s === "busy") return "忙碌";
  if (s === "idle") return "空闲";
  if (s === "offline") return "离线";
  return "—";
}

function PersonActionsMenu({
  person,
  me,
  canSetActive,
  canSetStatus,
  canResetPwd,
  canDelete,
  busy,
  onToggleActive,
  onSetStatus,
  onResetPwd,
  onDelete,
}: {
  person: Person;
  me: { id: string; role: string };
  canSetActive: boolean;
  canSetStatus: boolean;
  canResetPwd: boolean;
  canDelete: boolean;
  busy: boolean;
  onToggleActive: () => void;
  onSetStatus: (s: EmployeeStatus) => void;
  onResetPwd: () => void;
  onDelete: () => void;
}) {
  const currentStatus = person.employeeStatus ?? "active";
  return (
    <div
      className="absolute right-0 top-full z-50 mt-1 w-44 rounded-lg border border-border bg-popover shadow-xl overflow-visible"
      data-person-menu
    >
      {canSetActive && (
        <MenuItem onClick={onToggleActive} disabled={busy} icon={person.isActive ? PowerOff : Power}>
          {person.isActive ? "禁用登录" : "启用登录"}
        </MenuItem>
      )}
      {canSetStatus && currentStatus !== "active" && (
        <MenuItem onClick={() => onSetStatus("active")} disabled={busy} icon={CheckCircle2}>
          标记在职
        </MenuItem>
      )}
      {canSetStatus && currentStatus !== "paused" && (
        <MenuItem onClick={() => onSetStatus("paused")} disabled={busy} icon={PauseCircle}>
          标记停用
        </MenuItem>
      )}
      {canSetStatus && currentStatus !== "departed" && (
        <MenuItem onClick={() => onSetStatus("departed")} disabled={busy} icon={LogOut}>
          标记离职
        </MenuItem>
      )}
      {canResetPwd && (
        <MenuItem onClick={onResetPwd} disabled={busy} icon={RefreshCw}>
          重置密码
        </MenuItem>
      )}
      {canDelete && (
        <>
          <div className="border-t border-border" />
          <MenuItem onClick={onDelete} disabled={busy} icon={Trash2} destructive>
            彻底删除
          </MenuItem>
        </>
      )}
    </div>
  );
}

function MenuItem({
  onClick,
  icon: Icon,
  children,
  disabled,
  destructive,
}: {
  onClick: () => void;
  icon: typeof Bot;
  children: React.ReactNode;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors disabled:opacity-50",
        destructive
          ? "text-rose-700 dark:text-rose-400 hover:bg-rose-500/10"
          : "text-foreground hover:bg-muted",
      )}
    >
      <Icon className="size-3.5" />
      <span>{children}</span>
    </button>
  );
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
      alert(`${person.name} 的密码已重置`);
      onDone();
    } else {
      setErr("重置失败,请检查权限");
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
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
          {err && (
            <div className="text-xs text-rose-600 dark:text-rose-400">{err}</div>
          )}
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
            {busy ? "保存中…" : "保存"
            }
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
