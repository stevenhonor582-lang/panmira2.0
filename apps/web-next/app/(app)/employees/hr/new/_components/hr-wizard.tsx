"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Rocket, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { createHr, fetchAgent, type Agent } from "../../../_lib/data";
import {
  EMPTY_HR_FORM,
  HR_STEPS,
  canLeaveStep,
  type HrCategoryId,
  type HrFormState,
  type HrStepKey,
} from "./hr-form";
import { HrStepper } from "./hr-stepper";
import { StepType } from "./step-type";
import { StepDepartment } from "./step-department";
import { StepPersona } from "./step-persona";
import { StepPublish } from "./step-publish";

const ALLOWED_CATEGORIES: HrCategoryId[] = [
  "engineering",
  "painting",
  "copywriting",
  "ops",
  "business",
  "research",
];

function agentToForm(a: Agent): HrFormState {
  const raw = (a.raw ?? {}) as Record<string, unknown>;
  const rawCat = typeof raw.category === "string" ? raw.category : "";
  const rawTemplateType =
    typeof raw.template_type === "string"
      ? raw.template_type
      : typeof a.templateType === "string"
      ? a.templateType
      : "";
  const catCandidate = ALLOWED_CATEGORIES.includes(rawCat as HrCategoryId)
    ? (rawCat as HrCategoryId)
    : ALLOWED_CATEGORIES.includes(rawTemplateType as HrCategoryId)
    ? (rawTemplateType as HrCategoryId)
    : "";
  const rawDeptId =
    typeof raw.department_id === "string"
      ? raw.department_id
      : typeof raw.departmentId === "string"
      ? raw.departmentId
      : "";
  return {
    name: a.name ? `${a.name} 副本` : "",
    category: catCandidate,
    departmentId: rawDeptId,
    persona: a.persona ?? "",
    systemPrompt: a.systemPrompt ?? "",
    ironLaws: Array.isArray(a.ironLaws) ? a.ironLaws : [],
  };
}

/**
 * R57 · 新建 HR 岗位向导(全新,独立于数字员工向导)。
 * 布局:左 stepper + 顶部进度条,右大内容区,底部只 1 个主按钮。
 * 4 步:类型 → 部门 → 人格 → 发布
 */
export function HrWizard() {
  const router = useRouter();
  const params = useSearchParams();
  const mode = params.get("mode") === "clone" ? "clone" : "blank";
  const hrId = params.get("hrId");

  const [form, setForm] = React.useState<HrFormState>(EMPTY_HR_FORM);
  const [step, setStep] = React.useState<HrStepKey>("type");
  const [loadingClone, setLoadingClone] = React.useState(mode === "clone" && !!hrId);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // clone 模式:拉源岗位预填(仅静态蓝图字段)。
  React.useEffect(() => {
    let alive = true;
    if (mode === "clone" && hrId) {
      setLoadingClone(true);
      fetchAgent(hrId)
        .then((a) => {
          if (alive && a) setForm(agentToForm(a));
        })
        .finally(() => {
          if (alive) setLoadingClone(false);
        });
    }
    return () => {
      alive = false;
    };
  }, [mode, hrId]);

  const patch = React.useCallback((p: Partial<HrFormState>) => {
    setForm((prev) => ({ ...prev, ...p }));
    setError(null);
  }, []);

  const stepIdx = HR_STEPS.findIndex((s) => s.key === step);
  const isLast = step === "publish";
  const canLeave = canLeaveStep(step, form);

  // stepper 可跳转:只允许回跳已完成步,或当前所有前置步都满足时前进。
  const reachable = React.useCallback(
    (key: HrStepKey) => {
      const targetIdx = HR_STEPS.findIndex((s) => s.key === key);
      if (targetIdx <= stepIdx) return true;
      // 前进:要求 target 之前每一步都可离开
      for (let i = 0; i < targetIdx; i++) {
        if (!canLeaveStep(HR_STEPS[i].key, form)) return false;
      }
      return true;
    },
    [stepIdx, form],
  );

  async function handlePrimary() {
    if (!canLeave) {
      setError(
        step === "type"
          ? "请填写岗位名称并选择岗位类型"
          : step === "department"
          ? "请选择一个所属部门"
          : step === "persona"
          ? "岗位人格是唯一核心必填项,请填写"
          : null,
      );
      return;
    }
    if (!isLast) {
      setStep(HR_STEPS[stepIdx + 1].key);
      return;
    }
    // 发布
    setSubmitting(true);
    setError(null);
    try {
      await createHr({
        name: form.name.trim(),
        category: form.category || "business",
        departmentId: form.departmentId,
        persona: form.persona.trim(),
        systemPrompt: form.systemPrompt.trim(),
        ironLaws: form.ironLaws,
      });
      router.push("/employees/hr");
    } catch (e) {
      setError(e instanceof Error ? e.message : "发布失败,请重试");
      setSubmitting(false);
    }
  }

  if (loadingClone) {
    return (
      <div className="grid place-items-center py-32 text-sm text-foreground/50">
        <Loader2 className="mb-2 size-5 animate-spin" />
        正在载入源岗位…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8" data-testid="hr-wizard-root">
      {/* 专属岗位模板 header(简约,岗位是"配方"不是"人") */}
      <header className="space-y-2 border-b border-border pb-6">
        <div className="flex items-center gap-2 text-[10.5px] font-mono uppercase tracking-[0.22em] text-foreground/45">
          <span className="inline-block size-1.5 rounded-full bg-foreground/40" />
          数字HR · 新建岗位 · {mode === "clone" ? "复制现有" : "空白创建"}
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">新建 HR 岗位</h1>
        <p className="max-w-[64ch] text-[14px] leading-relaxed text-foreground/60">
          创建岗位说明书(静态),招聘时由数字员工配置动态属性。
        </p>
      </header>

      <div className="grid gap-8 md:grid-cols-[220px_1fr]">
        {/* 左:stepper + 进度条 */}
        <aside className="md:sticky md:top-6 md:self-start">
          <HrStepper current={step} onJump={setStep} reachable={reachable} />
        </aside>

        {/* 右:大内容区 */}
        <section className="min-h-[22rem] space-y-8">
          <div>
            {step === "type" && <StepType form={form} patch={patch} />}
            {step === "department" && <StepDepartment form={form} patch={patch} />}
            {step === "persona" && <StepPersona form={form} patch={patch} />}
            {step === "publish" && <StepPublish form={form} />}
          </div>

          {error && (
            <p
              data-testid="hr-wizard-error"
              className="rounded-xl border border-rose-300/60 bg-rose-50/60 px-4 py-2.5 text-[13px] text-rose-600"
            >
              {error}
            </p>
          )}

          {/* 底部:只 1 个主按钮(无 上一步 / 保存草稿) */}
          <div className="flex justify-end border-t border-border pt-5">
            <button
              type="button"
              data-testid="hr-wizard-primary"
              onClick={handlePrimary}
              disabled={submitting}
              className={cn(
                "inline-flex items-center gap-2 rounded-full bg-foreground px-6 py-2.5 text-[13.5px] font-medium text-background transition-opacity hover:opacity-90",
                submitting && "cursor-not-allowed opacity-60",
              )}
            >
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> 发布中…
                </>
              ) : isLast ? (
                <>
                  <Rocket className="size-4" /> 发布
                </>
              ) : (
                <>
                  下一步 <ArrowRight className="size-4" />
                </>
              )}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
