// R11 /overview/people/new - 添加员工 6 步向导
"use client";

import * as React from "react";
import { Suspense } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  RefreshCw,
  Bot,
  ListChecks,
  Mail,
  Lock,
  ShieldCheck,
} from "lucide-react";
import {
  fetchAgents,
  fetchPipelines,
  createPerson,
  type DigitalEmployee,
  type Pipeline,
  type Person,
  type EmployeeStatus,
} from "../../_components/data";
import { cn } from "@/lib/utils";

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="grid place-items-center py-32 text-sm text-foreground/50">
          载入中…
        </div>
      }
    >
      <NewPersonWizard />
    </Suspense>
  );
}

const STEPS = [
  { key: "basic", label: "基础信息" },
  { key: "sid", label: "生成 SID" },
  { key: "role", label: "角色权限" },
  { key: "agents", label: "分配数字员工" },
  { key: "pipelines", label: "分配任务" },
  { key: "notify", label: "通知与密码" },
] as const;

interface WizardState {
  name: string;
  email: string;
  phone: string;
  department: string;
  position: string;
  sid: string;
  role: Person["role"];
  agentIds: string[];
  pipelineIds: string[];
  notifyMode: "email" | "manual";
  password: string;
  passwordConfirm: string;
}

function genSid(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let sid = "MS-";
  for (let i = 0; i < 6; i++) sid += chars[Math.floor(Math.random() * chars.length)];
  return sid;
}

const EMPTY: WizardState = {
  name: "",
  email: "",
  phone: "",
  department: "",
  position: "",
  sid: genSid(),
  role: "member",
  agentIds: [],
  pipelineIds: [],
  notifyMode: "email",
  password: "",
  passwordConfirm: "",
};

function NewPersonWizard() {
  const router = useRouter();
  const [step, setStep] = React.useState(0);
  const [form, setForm] = React.useState<WizardState>(EMPTY);
  const [agents, setAgents] = React.useState<DigitalEmployee[]>([]);
  const [pipelines, setPipelines] = React.useState<Pipeline[]>([]);
  const [submitting, setSubmitting] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [genPwd, setGenPwd] = React.useState<string | null>(null);

  React.useEffect(() => {
    Promise.all([fetchAgents(), fetchPipelines()])
      .then(([a, p]) => {
        setAgents(a);
        setPipelines(p);
      })
      .catch(() => {});
  }, []);

  const update = (patch: Partial<WizardState>) =>
    setForm((f) => ({ ...f, ...patch }));

  const isLast = step === STEPS.length - 1;

  const canNext = (): boolean => {
    if (step === 0) {
      return form.name.trim().length > 0 && /.+@.+\..+/.test(form.email);
    }
    if (step === 5) {
      if (form.notifyMode === "manual") {
        return (
          form.password.length >= 6 &&
          form.password === form.passwordConfirm
        );
      }
      return true;
    }
    return true;
  };

  const submit = async () => {
    setSubmitting(true);
    setErr(null);
    try {
      const payload: Parameters<typeof createPerson>[0] = {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        department: form.department.trim() || undefined,
        position: form.position.trim() || undefined,
        role: form.role,
        agentIds: form.agentIds,
        pipelineIds: form.pipelineIds,
      };
      if (form.notifyMode === "manual") {
        payload.password = form.password;
      }
      const result = await createPerson(payload);
      if (!result) {
        setErr("创建失败");
        return;
      }
      if (form.notifyMode === "email" && result.generatedPassword) {
        setGenPwd(result.generatedPassword);
      } else {
        router.push("/overview/people");
      }
    } catch (e: any) {
      setErr(e?.message ?? "创建失败");
    } finally {
      setSubmitting(false);
    }
  };

  // ────────────────────────────────────────────────────────
  // 成功提示 (邮件模式)
  // ────────────────────────────────────────────────────────
  if (genPwd) {
    return (
      <div className="max-w-xl mx-auto py-12">
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-6 text-center">
          <CheckCircle2 className="size-10 mx-auto text-emerald-600 dark:text-emerald-400" />
          <h2 className="mt-3 text-lg font-semibold">员工已创建</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            请将以下密码发送给 <span className="font-mono">{form.email}</span>(首次登录后建议修改):
          </p>
          <div className="mt-4 rounded-md border border-border bg-card p-3 font-mono text-base tracking-wider">
            {genPwd}
          </div>
          <button
            onClick={() => router.push("/overview/people")}
            className="mt-5 rounded-md bg-foreground text-background px-4 py-2 text-sm font-medium"
          >
            返回员工列表
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-7 lg:grid-cols-[220px_1fr]">
      {/* 侧栏 step rail */}
      <aside className="space-y-4">
        <Link
          href="/overview/people"
          className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3" /> 返回员工列表
        </Link>
        <div>
          <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
            单页 6 步向导
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            添加员工
          </h1>
        </div>
        <ol className="space-y-1">
          {STEPS.map((s, i) => {
            const done = i < step;
            const active = i === step;
            return (
              <li key={s.key}>
                <button
                  onClick={() => i <= step && setStep(i)}
                  className={cn(
                    "flex items-center gap-2 w-full text-left rounded-md px-2 py-1.5 text-xs transition-colors",
                    active
                      ? "bg-muted text-foreground font-medium"
                      : done
                      ? "text-foreground hover:bg-muted/50"
                      : "text-muted-foreground/50 cursor-not-allowed",
                  )}
                >
                  <span
                    className={cn(
                      "inline-grid place-items-center size-5 rounded-full text-[10px]",
                      active
                        ? "bg-foreground text-background"
                        : done
                        ? "bg-emerald-500 text-white"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {done ? <CheckCircle2 className="size-3" /> : i + 1}
                  </span>
                  <span>{s.label}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </aside>

      {/* 主区 */}
      <section className="min-w-0 rounded-2xl border border-border bg-card p-6">
        <div className="border-b border-border pb-4 mb-5">
          <span className="font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground">
            STEP {String(step + 1).padStart(2, "0")} · {STEPS.length}
          </span>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">
            {STEPS[step].label}
          </h2>
        </div>

        {/* === Step 1: 基础信息 === */}
        {step === 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="姓名 *">
              <input
                value={form.name}
                onChange={(e) => update({ name: e.target.value })}
                placeholder="如:张三"
                className={inputCls}
              />
            </Field>
            <Field label="邮箱 *">
              <input
                type="email"
                value={form.email}
                onChange={(e) => update({ email: e.target.value })}
                placeholder="zhangsan@panmira.com"
                className={inputCls}
              />
            </Field>
            <Field label="手机">
              <input
                value={form.phone}
                onChange={(e) => update({ phone: e.target.value })}
                placeholder="13800138000"
                className={inputCls}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="部门">
                <input
                  value={form.department}
                  onChange={(e) => update({ department: e.target.value })}
                  placeholder="销售部"
                  className={inputCls}
                />
              </Field>
              <Field label="职位">
                <input
                  value={form.position}
                  onChange={(e) => update({ position: e.target.value })}
                  placeholder="销售经理"
                  className={inputCls}
                />
              </Field>
            </div>
          </div>
        )}

        {/* === Step 2: SID 生成 === */}
        {step === 1 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              SID (Short ID) 是员工的短编号,格式 <code className="font-mono">MS-XXXXXX</code>,6 位 base32(排除易混字符 0/O/I/1)。可用于登录或内部指代。
            </p>
            <div className="rounded-lg border border-border bg-muted/30 p-6 text-center">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                生成的 SID
              </div>
              <div className="mt-2 font-mono text-3xl font-bold tracking-widest">
                {form.sid}
              </div>
              <button
                onClick={() => update({ sid: genSid() })}
                className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs hover:bg-muted"
              >
                <RefreshCw className="size-3" />
                重新生成
              </button>
            </div>
          </div>
        )}

        {/* === Step 3: 角色权限 === */}
        {step === 2 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              选择角色。管理员可管理所有用户和配置,操作员可管理成员,成员仅能使用被分配的功能。
            </p>
            {([
              { value: "admin", label: "管理员", hint: "全权管理用户 / 数字员工 / 流水线 / 系统设置" },
              { value: "operator", label: "操作员", hint: "管理成员账号,不能管理 admin 或系统设置" },
              { value: "member", label: "成员", hint: "仅可使用被分配的数字员工和任务" },
            ] as const).map((opt) => (
              <label
                key={opt.value}
                className={cn(
                  "flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition-all",
                  form.role === opt.value
                    ? "border-foreground bg-foreground/5 ring-1 ring-foreground/30"
                    : "border-border hover:border-border/80",
                )}
              >
                <input
                  type="radio"
                  name="role"
                  checked={form.role === opt.value}
                  onChange={() => update({ role: opt.value })}
                  className="mt-1"
                />
                <div>
                  <div className="font-medium text-sm flex items-center gap-2">
                    <ShieldCheck className="size-3.5" />
                    {opt.label}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{opt.hint}</div>
                </div>
              </label>
            ))}
          </div>
        )}

        {/* === Step 4: 分配数字员工 === */}
        {step === 3 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              可多选。将选中的数字员工的 owner 设为该员工。(空也行,后续可分配。)
            </p>
            {agents.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                暂无可分配的数字员工
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {agents.map((a) => {
                  const checked = form.agentIds.includes(a.id);
                  return (
                    <label
                      key={a.id}
                      className={cn(
                        "flex items-start gap-2 rounded-lg border p-3 cursor-pointer transition-all",
                        checked ? "border-foreground bg-foreground/5" : "border-border hover:border-border/80",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          update({
                            agentIds: e.target.checked
                              ? [...form.agentIds, a.id]
                              : form.agentIds.filter((x) => x !== a.id),
                          })
                        }
                        className="mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate flex items-center gap-1">
                          <Bot className="size-3 text-muted-foreground" />
                          {a.displayName ?? a.name}
                        </div>
                        <div className="text-[10px] text-muted-foreground font-mono">
                          {a.roleTemplate ?? "general"}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* === Step 5: 分配任务/流水线 === */}
        {step === 4 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              可多选。将选中的流水线的 owner 设为该员工。
            </p>
            {pipelines.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                暂无可分配的流水线
              </div>
            ) : (
              <div className="grid gap-1.5">
                {pipelines.map((p) => {
                  const checked = form.pipelineIds.includes(p.id);
                  return (
                    <label
                      key={p.id}
                      className={cn(
                        "flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer transition-all",
                        checked ? "border-foreground bg-foreground/5" : "border-border hover:border-border/80",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          update({
                            pipelineIds: e.target.checked
                              ? [...form.pipelineIds, p.id]
                              : form.pipelineIds.filter((x) => x !== p.id),
                          })
                        }
                      />
                      <ListChecks className="size-3 text-muted-foreground" />
                      <span className="text-sm truncate flex-1">{p.name}</span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        run {p.runCount}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* === Step 6: 通知与密码 === */}
        {step === 5 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              选择密码设置方式。
            </p>
            <div className="space-y-2">
              <label
                className={cn(
                  "flex items-start gap-3 rounded-lg border p-4 cursor-pointer",
                  form.notifyMode === "email"
                    ? "border-foreground bg-foreground/5"
                    : "border-border",
                )}
              >
                <input
                  type="radio"
                  name="notify"
                  checked={form.notifyMode === "email"}
                  onChange={() => update({ notifyMode: "email" })}
                  className="mt-1"
                />
                <div>
                  <div className="font-medium text-sm flex items-center gap-2">
                    <Mail className="size-3.5" />
                    系统生成密码
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    后端生成随机密码,创建后显示给你,你需通过邮件/口头发给员工
                  </div>
                </div>
              </label>
              <label
                className={cn(
                  "flex items-start gap-3 rounded-lg border p-4 cursor-pointer",
                  form.notifyMode === "manual"
                    ? "border-foreground bg-foreground/5"
                    : "border-border",
                )}
              >
                <input
                  type="radio"
                  name="notify"
                  checked={form.notifyMode === "manual"}
                  onChange={() => update({ notifyMode: "manual" })}
                  className="mt-1"
                />
                <div>
                  <div className="font-medium text-sm flex items-center gap-2">
                    <Lock className="size-3.5" />
                    手动设置密码
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    你直接输入密码 (≥ 6 位)
                  </div>
                </div>
              </label>
            </div>

            {form.notifyMode === "manual" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="密码 (≥ 6 位)">
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => update({ password: e.target.value })}
                    className={inputCls}
                  />
                </Field>
                <Field label="确认密码">
                  <input
                    type="password"
                    value={form.passwordConfirm}
                    onChange={(e) => update({ passwordConfirm: e.target.value })}
                    className={inputCls}
                  />
                </Field>
                {form.password.length > 0 &&
                  form.password !== form.passwordConfirm && (
                    <div className="text-xs text-rose-600 col-span-2">
                      两次输入不一致
                    </div>
                  )}
              </div>
            )}
          </div>
        )}

        {err && (
          <div className="mt-4 rounded-md border border-rose-500/40 bg-rose-500/5 p-3 text-xs text-rose-700 dark:text-rose-400">
            {err}
          </div>
        )}

        {/* === 导航按钮 === */}
        <div className="mt-6 pt-4 border-t border-border flex items-center justify-between">
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            <ArrowLeft className="size-3" /> 上一步
          </button>

          {!isLast ? (
            <button
              onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
              disabled={!canNext()}
              className="inline-flex items-center gap-1 rounded-md bg-foreground text-background px-4 py-1.5 text-xs font-medium disabled:opacity-30"
            >
              下一步 <ArrowRight className="size-3" />
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={!canNext() || submitting}
              className="inline-flex items-center gap-1 rounded-md bg-foreground text-background px-4 py-1.5 text-xs font-medium disabled:opacity-30"
            >
              {submitting ? "创建中…" : "确认创建"}
              <CheckCircle2 className="size-3.5" />
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
const inputCls =
  "mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
