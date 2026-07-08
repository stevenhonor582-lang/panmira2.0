"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusPill } from "@/components/channels/status-pill";
import {
  SettingsPageShell,
  SettingsMeta,
} from "@/components/settings/settings-shell";
import { DenseTable, MonoCell, KeyCell } from "@/components/channels/dense-table";
import {
  ShieldCheck,
  UserPlus,
  RefreshCw,
  ShieldAlert,
  CheckCircle2,
} from "lucide-react";
import { api, ApiResponse } from "@/lib/api";
import { getUser } from "@/lib/auth";

/**
 * /settings/permissions — RBAC matrix for the current tenant.
 *
 * Reads `GET /api/auth/users` (scope: user:admin).
 * Mutates via:
 *   - `POST  /api/auth/users`         (admin-only creation of operator/member)
 *   - `PATCH /api/auth/users/:id`     (role / isActive; backend RBAC enforced)
 *
 * Frontend RBAC mirrors backend canManageUser matrix:
 *   - admin can edit any operator / member
 *   - operator can only edit member (and only if they're not self)
 *   - no one can self-demote admin
 *   - last-admin check is backend-side (we surface the 403 toast verbatim)
 */

type Role = "admin" | "operator" | "member";

interface A1User {
  id: string;
  email: string | null;
  name?: string;
  phone?: string | null;
  role: Role;
  isActive: boolean;
  failedAttempts?: number;
  lockedUntil?: string | null;
  sid?: string | null;
  tenantId?: string;
  avatarUrl?: string | null;
}

const ROLE_TONE: Record<
  Role,
  { ring: string; text: string; bg: string; dot: string }
> = {
  admin: {
    ring: "ring-violet-500/40",
    text: "text-violet-700 dark:text-violet-300",
    bg: "bg-violet-500/10",
    dot: "bg-violet-500",
  },
  operator: {
    ring: "ring-sky-500/40",
    text: "text-sky-700 dark:text-sky-300",
    bg: "bg-sky-500/10",
    dot: "bg-sky-500",
  },
  member: {
    ring: "ring-border",
    text: "text-muted-foreground",
    bg: "bg-muted",
    dot: "bg-muted-foreground/60",
  },
};

const ROLE_HINT: Record<Role, string> = {
  admin: "全权 · 可创建 operator",
  operator: "可创建 member · 不可改 admin",
  member: "基础访问",
};

interface ToastItem {
  id: number;
  kind: "ok" | "err";
  message: string;
}

export default function PermissionsPage() {
  const me = getUser();
  const meRole = (me?.role as Role | undefined) ?? "member";
  const meId = me?.id ?? "";

  const [users, setUsers] = React.useState<A1User[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [creating, setCreating] = React.useState(false);
  const [createForm, setCreateForm] = React.useState({
    name: "",
    email: "",
    phone: "",
    role: "member" as Role,
  });
  const [createErr, setCreateErr] = React.useState<string | null>(null);
  const [createBusy, setCreateBusy] = React.useState(false);

  const [toasts, setToasts] = React.useState<ToastItem[]>([]);
  function pushToast(kind: ToastItem["kind"], message: string) {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, message }]);
    setTimeout(
      () => setToasts((t) => t.filter((x) => x.id !== id)),
      4500,
    );
  }

  async function loadUsers() {
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ users: A1User[] }>("/api/auth/users");
      setUsers(res.users ?? []);
    } catch (e: any) {
      setError(e?.message ?? "加载用户失败");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    loadUsers();
  }, []);

  const totals = React.useMemo(() => {
    const byRole: Record<Role, number> = { admin: 0, operator: 0, member: 0 };
    let locked = 0;
    let inactive = 0;
    for (const u of users) {
      byRole[u.role] = (byRole[u.role] ?? 0) + 1;
      if (u.lockedUntil && new Date(u.lockedUntil) > new Date()) locked++;
      if (!u.isActive) inactive++;
    }
    return { byRole, locked, inactive, total: users.length };
  }, [users]);

  // Frontend RBAC mirror — show hint text on the row before the API call.
  // Backend canManageUser is authoritative; this is just UX hints.
  function canEditRow(u: A1User): boolean {
    if (u.id === meId) return false; // no self-edit
    if (meRole === "admin") return true;
    if (meRole === "operator") return u.role === "member";
    return false;
  }
  function canChangeTo(currentRole: Role, newRole: Role): boolean {
    if (currentRole === "admin" && meRole !== "admin") return false;
    if (newRole === "admin" && meRole !== "admin") return false;
    if (currentRole === newRole) return false;
    return true;
  }

  async function changeRole(u: A1User, newRole: Role) {
    if (!canChangeTo(u.role, newRole)) {
      pushToast("err", "权限不足,后端将拒绝此操作");
      return;
    }
    try {
      await api(`/api/auth/users/${u.id}`, {
        method: "PATCH",
        body: { role: newRole },
      });
      pushToast("ok", `已将 ${u.name ?? u.email} 改为 ${newRole}`);
      await loadUsers();
    } catch (e: any) {
      pushToast(
        "err",
        e?.message ?? "角色修改失败(后端 RBAC 已拦截)",
      );
    }
  }

  async function toggleActive(u: A1User) {
    try {
      await api(`/api/auth/users/${u.id}`, {
        method: "PATCH",
        body: { isActive: !u.isActive },
      });
      pushToast(
        "ok",
        `${u.name ?? u.email} 已${u.isActive ? "停用" : "启用"}`,
      );
      await loadUsers();
    } catch (e: any) {
      pushToast("err", e?.message ?? "状态切换失败");
    }
  }

  async function unlock(u: A1User) {
    try {
      await api(`/api/auth/users/${u.id}`, {
        method: "PATCH",
        body: { unlock: true },
      });
      pushToast("ok", `${u.name ?? u.email} 已解锁`);
      await loadUsers();
    } catch (e: any) {
      pushToast("err", e?.message ?? "解锁失败");
    }
  }

  async function submitCreate() {
    setCreateErr(null);
    if (!createForm.name.trim() || !createForm.email.trim()) {
      setCreateErr("姓名 + 邮箱 必填");
      return;
    }
    setCreateBusy(true);
    try {
      await api("/api/auth/users", {
        method: "POST",
        body: {
          name: createForm.name.trim(),
          email: createForm.email.trim(),
          phone: createForm.phone.trim() || undefined,
          role: createForm.role,
          password: "panmira-temp-2026", // temp; user will rotate via /auth flow
        },
      });
      pushToast("ok", `已创建 ${createForm.role}: ${createForm.name}`);
      setCreating(false);
      setCreateForm({ name: "", email: "", phone: "", role: "member" });
      await loadUsers();
    } catch (e: any) {
      setCreateErr(e?.message ?? "创建失败");
    } finally {
      setCreateBusy(false);
    }
  }

  return (
    <>
      <SettingsPageShell
        meta={
          <SettingsMeta
            items={[
              { label: "total", value: totals.total },
              { label: "admin", value: totals.byRole.admin },
              { label: "operator", value: totals.byRole.operator },
              { label: "member", value: totals.byRole.member },
              { label: "locked", value: totals.locked },
              { label: "inactive", value: totals.inactive },
            ]}
            footnote={
              <>
                三色 chip 仅作视觉区分。RBAC 规则由后端
                <code className="font-mono">canManageUser()</code>
                强制执行,前端切换 dropdown 仅在条件允许时启用。
                最后一名 admin 不可被降级 — 后端 403 会以 toast 显示。
              </>
            }
          />
        }
        toolbar={
          <>
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold tracking-tight">
                权限与角色
              </h2>
              <span className="text-[11px] text-muted-foreground font-mono">
                rbac · {totals.total}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={loadUsers}
                disabled={loading}
              >
                <RefreshCw
                  className={loading ? "size-3.5 animate-spin" : "size-3.5"}
                />
                刷新
              </Button>
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => setCreating(true)}
                disabled={meRole === "member"}
                title={
                  meRole === "member"
                    ? "需要 admin 或 operator 才能创建"
                    : undefined
                }
              >
                <UserPlus className="size-3.5" />
                新增 {meRole === "operator" ? "member" : "operator / member"}
              </Button>
            </div>
          </>
        }
      >
        {error ? (
          <div className="ring-1 ring-rose-500/30 bg-rose-500/[0.06] rounded-sm px-3 py-2 text-[12px] text-rose-700 dark:text-rose-300 flex items-start gap-2">
            <ShieldAlert className="size-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <DenseTable
          head={[
            "Name",
            "Email",
            "Role",
            "Phone",
            "Status",
            "Locked Until",
            "Action",
          ]}
          empty={
            loading ? "加载中..." : "暂无用户(当前租户为空)"
          }
          rows={users.map((u) => {
            const locked = !!(
              u.lockedUntil && new Date(u.lockedUntil) > new Date()
            );
            const tone = ROLE_TONE[u.role];
            const isMe = u.id === meId;
            const editable = canEditRow(u);
            return {
              cells: [
                <div key="name" className="flex items-center gap-2 min-w-0">
                  <span className="text-[12.5px] truncate">
                    {u.name ?? "—"}
                    {isMe && (
                      <span className="ml-1.5 text-[10px] text-muted-foreground font-mono">
                        (you)
                      </span>
                    )}
                  </span>
                  {u.sid && (
                    <KeyCell>{u.sid.replace(/^metmira:/, "")}</KeyCell>
                  )}
                </div>,
                <MonoCell key="email" title={u.email ?? ""}>
                  {u.email ?? "—"}
                </MonoCell>,
                <span
                  key="role"
                  className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset font-mono whitespace-nowrap ${tone.bg} ${tone.text} ${tone.ring}`}
                  title={ROLE_HINT[u.role]}
                >
                  <span className={`size-1.5 rounded-full ${tone.dot}`} />
                  {u.role}
                </span>,
                <MonoCell key="phone">{u.phone ?? "—"}</MonoCell>,
                <div
                  key="status"
                  className="flex items-center gap-1.5 flex-wrap"
                >
                  {u.isActive ? (
                    <StatusPill tone="ok" label="active" />
                  ) : (
                    <StatusPill tone="muted" label="inactive" />
                  )}
                  {locked && (
                    <StatusPill tone="err" label="locked" />
                  )}
                </div>,
                <MonoCell key="lockedUntil">
                  {u.lockedUntil
                    ? new Date(u.lockedUntil).toLocaleString("zh-CN", {
                        hour12: false,
                      })
                    : "—"}
                </MonoCell>,
                <div
                  key="action"
                  className="flex items-center gap-1.5 justify-end"
                >
                  {!editable ? (
                    <span className="text-[11px] text-muted-foreground font-mono">
                      {isMe ? "self" : "r/o"}
                    </span>
                  ) : (
                    <>
                      <Select
                        value={u.role}
                        onValueChange={(v) =>
                          changeRole(u, v as Role)
                        }
                      >
                        <SelectTrigger
                          size="sm"
                          className="h-6 text-[11px] min-w-[88px]"
                          disabled={
                            u.role === "admin" && meRole !== "admin"
                          }
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin" disabled={meRole !== "admin"}>
                            admin
                          </SelectItem>
                          <SelectItem value="operator" disabled={meRole !== "admin"}>
                            operator
                          </SelectItem>
                          <SelectItem value="member">member</SelectItem>
                        </SelectContent>
                      </Select>
                      {locked && (
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => unlock(u)}
                          title="清除失败计数 + lockedUntil"
                        >
                          unlock
                        </Button>
                      )}
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => toggleActive(u)}
                      >
                        {u.isActive ? "停用" : "启用"}
                      </Button>
                    </>
                  )}
                </div>,
              ],
            };
          })}
        />

        <div className="mt-3 text-[11px] text-muted-foreground leading-relaxed">
          <span className="font-mono uppercase tracking-wide text-foreground/70">
            RBAC 矩阵
          </span>
          <ul className="mt-1 grid grid-cols-1 md:grid-cols-3 gap-1.5">
            <li>
              <span className="font-mono">admin</span> — 可改任何非自身的
              operator/member,可新建 operator。
            </li>
            <li>
              <span className="font-mono">operator</span> — 仅可改
              member,可新建 member。
            </li>
            <li>
              <span className="font-mono">member</span> — 只读本页(可看到
              meta 与本人行)。
            </li>
          </ul>
        </div>
      </SettingsPageShell>

      {/* New user modal */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">
              新增 {meRole === "operator" ? "member" : "operator / member"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              创建后系统下发临时密码 <code className="font-mono">panmira-temp-2026</code>,
              用户首次登录后必须改密。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="cu-name" className="text-xs">
                姓名
              </Label>
              <Input
                id="cu-name"
                value={createForm.name}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="例:张三"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cu-email" className="text-xs">
                邮箱
              </Label>
              <Input
                id="cu-email"
                type="email"
                value={createForm.email}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, email: e.target.value }))
                }
                placeholder="name@example.com"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cu-phone" className="text-xs">
                手机(可选)
              </Label>
              <Input
                id="cu-phone"
                value={createForm.phone}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, phone: e.target.value }))
                }
                placeholder="+86 138 0000 0000"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cu-role" className="text-xs">
                角色
              </Label>
              <Select
                value={createForm.role}
                onValueChange={(v) =>
                  setCreateForm((f) => ({ ...f, role: v as Role }))
                }
              >
                <SelectTrigger id="cu-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {meRole === "admin" && (
                    <SelectItem value="operator">operator</SelectItem>
                  )}
                  <SelectItem value="member">member</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {createErr && (
              <div className="text-[11.5px] text-rose-700 dark:text-rose-300 bg-rose-500/[0.06] ring-1 ring-rose-500/30 rounded-sm px-2.5 py-1.5">
                {createErr}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreating(false)}
              disabled={createBusy}
            >
              取消
            </Button>
            <Button onClick={submitCreate} disabled={createBusy}>
              {createBusy ? "提交中..." : "创建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Toast layer */}
      <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto ring-1 rounded-sm px-3 py-2 text-[12px] shadow-md backdrop-blur-sm flex items-start gap-2 ${
              t.kind === "ok"
                ? "bg-emerald-500/[0.08] ring-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                : "bg-rose-500/[0.08] ring-rose-500/30 text-rose-700 dark:text-rose-300"
            }`}
          >
            {t.kind === "ok" ? (
              <CheckCircle2 className="size-3.5 mt-0.5 shrink-0" />
            ) : (
              <ShieldAlert className="size-3.5 mt-0.5 shrink-0" />
            )}
            <span className="max-w-[360px] leading-snug">{t.message}</span>
          </div>
        ))}
      </div>
    </>
  );
}