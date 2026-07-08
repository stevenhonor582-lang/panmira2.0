"use client";
import * as React from "react";
import type { WizardForm } from "./form";
import { api } from "@/lib/api";
import { Rocket, Loader2, CheckCircle2, AlertCircle, RefreshCw, FlaskConical, XCircle, Check } from "lucide-react";

interface SubmitResult { ok: boolean; error?: string; id?: string }

interface TestCheck {
  category: string;
  item: string;
  key: string;
  ok: boolean;
  detail: string;
}
interface TestResult {
  results: TestCheck[];
  summary: { ok: number; fail: number; total: number; allOk: boolean };
}

interface SubmitResult { ok: boolean; error?: string; id?: string }

export function Step7({
  form,
  onSubmit,
  onPublished,
}: {
  form: WizardForm;
  onSubmit: () => Promise<SubmitResult>;
  onPublished: (id: string) => void;
}) {
  const [phase, setPhase] = React.useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = React.useState<string>("");
  const [createdId, setCreatedId] = React.useState<string>("");
  // R17-3: 发布前测试
  const [testing, setTesting] = React.useState(false);
  const [testResult, setTestResult] = React.useState<TestResult | null>(null);
  const [testError, setTestError] = React.useState<string>("");

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    setTestError("");
    try {
      const res = await api<TestResult>("/api/v2/employees/test-config", {
        method: "POST",
        body: {
          providerId: form.providerId,
          providerModel: form.providerModel,
          skillIds: form.skills,
          mcpServerIds: form.mcpServerIds,
          kbFolderIds: form.kbFolderIds,
          knowledgeBaseIds: form.knowledgeBaseIds,
          channelIds: form.channelIds,
        },
        headers: { "content-type": "application/json" },
      });
      setTestResult(res);
    } catch (e: unknown) {
      const err = e as { message?: string; body?: { error?: string } };
      setTestError(err?.body?.error || err?.message || String(e));
    } finally {
      setTesting(false);
    }
  };

  const handlePublish = async () => {
    setPhase("submitting");
    setErrorMsg("");
    const res = await onSubmit();
    if (res.ok && res.id) {
      setPhase("success");
      setCreatedId(res.id);
      // Slight delay so the user sees the success state before redirect
      setTimeout(() => onPublished(res.id!), 600);
    } else {
      setPhase("error");
      setErrorMsg(res.error || "未知错误");
    }
  };

  if (phase === "submitting") {
    return (
      <div className="grid place-items-center py-12">
        <Loader2 className="size-6 animate-spin text-foreground/55" />
        <p className="mt-3 font-mono text-[12px] text-foreground/55">正在创建员工...</p>
      </div>
    );
  }

  if (phase === "success") {
    return (
      <div className="grid place-items-center py-12">
        <CheckCircle2 className="size-12 text-emerald-600" />
        <h3 className="mt-3 text-xl font-semibold tracking-tight">{form.name || "新员工"} 已发布</h3>
        <p className="mt-1 font-mono text-[11.5px] text-foreground/55">即将跳转到员工详情...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4 border-b border-border pb-4">
        <div>
          <h3 className="flex items-center gap-2 text-[13px] font-medium tracking-tight text-foreground/65">
            <Rocket className="size-4 text-foreground/45" />
            发布 · 配好就上线,失败返回原因
          </h3>
          <p className="mt-1 text-[12.5px] text-foreground/55">
            确认信息无误后,点【发布】即可。失败时不会丢已填表单,可改后重试。
          </p>
        </div>
      </header>

      <Summary form={form} />

      {/* R17-3: 发布前测试结果 */}
      {testError && (
        <div className="rounded-2xl bg-rose-500/10 p-4 ring-1 ring-rose-500/30">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-rose-700 dark:text-rose-300">
            <AlertCircle className="size-4" />
            测试请求失败
          </div>
          <div className="mt-2 rounded-xl bg-rose-500/5 p-2.5 font-mono text-[11.5px] text-rose-800 dark:text-rose-200">
            {testError}
          </div>
        </div>
      )}

      {testResult && (
        <TestResultPanel result={testResult} />
      )}

      {phase === "error" && (
        <div className="rounded-2xl bg-rose-500/10 p-5 ring-1 ring-rose-500/30">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-rose-700 dark:text-rose-300">
            <AlertCircle className="size-4" />
            发布失败 · 已保留你填的内容
          </div>
          <div className="mt-2 rounded-xl bg-rose-500/5 p-3 font-mono text-[11.5px] text-rose-800 dark:text-rose-200">
            {translateError(errorMsg)}
          </div>
          <p className="mt-2 text-[11.5px] text-foreground/65">
            根据原因回到对应步骤修改,然后回来再点【重试发布】。
          </p>
        </div>
      )}

      <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
        <button
          type="button"
          onClick={runTest}
          disabled={testing}
          className="inline-flex items-center gap-1.5 rounded-full bg-background px-5 py-2.5 text-[13.5px] font-medium text-foreground ring-1 ring-border hover:ring-foreground/40 disabled:opacity-50"
          data-testid="step7-test-btn"
        >
          {testing ? <Loader2 className="size-4 animate-spin" /> : <FlaskConical className="size-4" />}
          {testing ? "测试中..." : "测试"}
        </button>
        <button
          type="button"
          onClick={handlePublish}
          className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-6 py-2.5 text-[13.5px] font-medium text-background hover:opacity-90"
        >
          {phase === "error" ? <RefreshCw className="size-4" /> : <Rocket className="size-4" />}
          {phase === "error" ? "重试发布" : "发布"}
        </button>
      </div>
    </div>
  );
}

// 测试结果面板 — 逐项展示 ok/fail + 详情
function TestResultPanel({ result }: { result: TestResult }) {
  const { results, summary } = result;
  const failItems = results.filter((r) => !r.ok);

  return (
    <div className={
      "rounded-2xl p-5 ring-1 " +
      (summary.allOk
        ? "bg-emerald-500/[0.06] ring-emerald-500/30"
        : "bg-amber-500/[0.06] ring-amber-500/40")
    }>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[13px] font-semibold">
          {summary.allOk ? (
            <Check className="size-4 text-emerald-600" />
          ) : (
            <AlertCircle className="size-4 text-amber-600" />
          )}
          <span className={summary.allOk ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}>
            {summary.allOk ? "测试通过 · 可以发布" : `${failItems.length} 项未通过 · 需要修复`}
          </span>
        </div>
        <span className="font-mono text-[11px] text-foreground/55">
          {summary.ok}/{summary.total} 通过
        </span>
      </div>

      <ul className="mt-3 divide-y divide-foreground/[0.06]">
        {results.map((r) => (
          <li key={r.key} className="flex items-start gap-2.5 py-2">
            <span className={
              "mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full " +
              (r.ok ? "bg-emerald-500/15 text-emerald-600" : "bg-rose-500/15 text-rose-600")
            }>
              {r.ok ? <Check className="size-3" /> : <XCircle className="size-3" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[12.5px] font-medium text-foreground/85">{r.item}</span>
                <span className="rounded bg-foreground/[0.06] px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.15em] text-foreground/55">
                  {r.category}
                </span>
              </div>
              <div className={"mt-0.5 font-mono text-[11.5px] " + (r.ok ? "text-foreground/60" : "text-rose-700 dark:text-rose-300")}>
                {r.detail}
              </div>
            </div>
          </li>
        ))}
      </ul>

      {!summary.allOk && (
        <p className="mt-3 border-t border-foreground/[0.06] pt-2.5 text-[11.5px] text-foreground/65">
          需修复项会阻塞实际调用(模型连不通 / 技能加载失败 / 知识库不可达等)。
          回到对应步骤修改后,可再次点【测试】。
        </p>
      )}
    </div>
  );
}

function Summary({ form }: { form: WizardForm }) {
  return (
    <div className="rounded-2xl bg-card p-5 ring-1 ring-border">
      <div className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-foreground/45">
        确认信息
      </div>
      <dl className="mt-3 grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
        <Field k="名字" v={form.name || <span className="italic text-foreground/45">未命名</span>} />
        <Field k="描述" v={form.description || <span className="italic text-foreground/45">未填</span>} />
        <Field k="模型" v={`${form.providerName || "—"} · ${form.providerModel || "—"}`} />
        <Field k="上下文" v={`${(form.contextWindow / 1000).toFixed(0)}k tokens · t=${form.temperature.toFixed(2)}`} />
        <Field k="人格" v={form.persona || form.personaPreset || <span className="italic text-foreground/45">未设定</span>} />
        <Field k="铁律" v={`${form.ironLaws.length} 条`} />
        <Field k="技能" v={`${form.skills.length} skills · ${form.mcpServerIds.length} mcp · ${form.tools.length} tools`} />
        <Field k="知识" v={`${form.knowledgeBaseIds.length} KB · ${form.kbFolderIds.length} folders`} />
        <Field k="可见性" v={form.visibility} />
        <Field k="频道" v={form.channelIds.length === 0 ? "未绑定" : `${form.channelIds.length} 个`} />
        <Field k="工作目录" v={form.workingDir || <span className="italic text-foreground/45">默认(后端生成)</span>} mono />
      </dl>
    </div>
  );
}

function Field({ k, v, mono }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-2 min-w-0">
      <dt className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-foreground/45 w-20 shrink-0">{k}</dt>
      <dd className={"text-[12.5px] text-foreground/85 truncate " + (mono ? "font-mono" : "")}>{v}</dd>
    </div>
  );
}

// Translate common backend errors into actionable Chinese hints.
function translateError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("foreign key constraint") && m.includes("model_id")) {
    return "model_id 外键校验失败 → Step 2 选的 provider 不存在或已删除。请回到 Step 2 重选。";
  }
  if (m.includes("name is required")) {
    return "名字必填 → 回到 Step 1 给员工起个名字。";
  }
  if (m.includes("duplicate")) {
    return "重名 → 已有同名员工,改个名字再试。";
  }
  if (m.includes("api key") || m.includes("apikey")) {
    return "API key 缺失 → Step 2 选的服务商没配 key。先去 /channels/llm 配上。";
  }
  if (m.includes("unauthorized") || m.includes("401")) {
    return "登录态过期 → 刷新页面重新登录,你填的内容会丢,记得先记下来。";
  }
  if (m.includes("403") || m.includes("forbidden")) {
    return "权限不足 → 当前账号没有 agent:admin 权限。找管理员开通。";
  }
  return `后端返回: ${msg}`;
}
