"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, SkipForward, CheckCircle2 } from "lucide-react";
import { EMPTY_FORM, type WizardForm } from "./form";
import { StepRail, STEPS } from "./stepper";
import { Step1 } from "./step-1";
import { Step2 } from "./step-2";
import { Step3 } from "./step-3";
import { Step4 } from "./step-4";
import { Step5 } from "./step-5";
import { Step6 } from "./step-6";
import { Step7 } from "./step-7";
import { TEMPLATE_PRESETS } from "../../_lib/data";
import { AvatarMark } from "../../_components/avatar-mark";

export function NewBotWizard() {
  const router = useRouter();
  const params = useSearchParams();
  const templateIdParam = params.get("template");

  const [form, setForm] = React.useState<WizardForm>(() => {
    if (!templateIdParam) return EMPTY_FORM;
    const t = TEMPLATE_PRESETS.find((x) => x.id === templateIdParam);
    if (!t) return EMPTY_FORM;
    return {
      ...EMPTY_FORM,
      templateId: t.id,
      glyph: t.glyph,
      hue: t.hue,
      name: t.title,
      systemPrompt: t.persona,
    };
  });
  const [current, setCurrent] = React.useState(1);
  const [done, setDone] = React.useState(false);

  const skipAllowed = current <= 3;
  const isLast = current === STEPS.length;

  const next = () => {
    if (isLast) return;
    setCurrent((c) => Math.min(STEPS.length, c + 1));
  };
  const prev = () => setCurrent((c) => Math.max(1, c - 1));
  const jump = (s: number) => {
    if (s < current) {
      setCurrent(s);
      return;
    }
    if (s <= 3 || s <= current + 1) setCurrent(s);
  };

  const submit = () => setDone(true);

  if (done) {
    return <DoneScreen form={form} onReset={() => { setForm(EMPTY_FORM); setCurrent(1); setDone(false); }} />;
  }

  return (
    <div className="grid gap-7 lg:grid-cols-[260px_1fr]">
      <aside className="space-y-5">
        <Link
          href="/employees"
          className="inline-flex items-center gap-1.5 text-[12px] font-mono uppercase tracking-[0.18em] text-foreground/45 hover:text-foreground"
        >
          <ArrowLeft className="size-3" /> 员工库
        </Link>
        <div>
          <div className="text-[10.5px] font-mono uppercase tracking-[0.18em] text-foreground/40">
            单页 7 步向导
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tighter">
            创建新的数字员工
          </h1>
        </div>
        <StepRail current={current} onJump={jump} />
        <PreviewCard form={form} />
      </aside>

      <section className="min-w-0 rounded-3xl bg-card p-7 ring-1 ring-border">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div>
            <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-foreground/45">
              STEP 0{current} · {STEPS.length}
            </span>
            <h2 className="mt-1 text-xl font-semibold tracking-tight">
              {STEPS[current - 1].label}
            </h2>
          </div>
          {skipAllowed && !isLast && (
            <button
              type="button"
              onClick={next}
              className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-[12px] font-medium text-foreground/70 hover:text-foreground"
            >
              <SkipForward className="size-3" /> 跳过
            </button>
          )}
        </div>

        <div className="pt-6 transition-opacity duration-300" key={`step-${current}`}>
          {current === 1 && <Step1 form={form} setForm={setForm} />}
          {current === 2 && <Step2 form={form} setForm={setForm} />}
          {current === 3 && <Step3 form={form} setForm={setForm} />}
          {current === 4 && <Step4 form={form} setForm={setForm} />}
          {current === 5 && <Step5 form={form} setForm={setForm} />}
          {current === 6 && <Step6 form={form} setForm={setForm} />}
          {current === 7 && <Step7 form={form} setForm={setForm} onSubmit={submit} />}
        </div>

        {!isLast && (
          <div className="mt-8 flex items-center justify-between border-t border-border pt-5">
            <button
              type="button"
              onClick={prev}
              disabled={current === 1}
              className="inline-flex items-center gap-1.5 rounded-full bg-muted px-4 py-2 text-[13px] font-medium text-foreground disabled:opacity-40 hover:bg-muted/70"
            >
              <ArrowLeft className="size-3.5" /> 上一步
            </button>
            <button
              type="button"
              onClick={next}
              className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-5 py-2 text-[13px] font-medium text-background hover:opacity-90"
            >
              下一步 <ArrowRight className="size-3.5" />
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function PreviewCard({ form }: { form: WizardForm }) {
  return (
    <div className="overflow-hidden rounded-2xl bg-muted/40 p-5 ring-1 ring-border">
      <span className="text-[10.5px] font-mono uppercase tracking-[0.18em] text-foreground/45">
        实时预览
      </span>
      <div className="mt-3 flex items-center gap-3">
        <AvatarMark glyph={form.glyph} hue={form.hue} size="md" />
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold tracking-tight">
            {form.name || "未命名 bot"}
          </div>
          <div className="truncate font-mono text-[11px] text-foreground/55">
            {form.model} · {(form.contextWindow / 1000).toFixed(0)}k ctx · t={form.temperature.toFixed(2)}
          </div>
        </div>
      </div>
      <ul className="mt-4 space-y-1.5 text-[11.5px] font-mono text-foreground/55">
        <li>{form.skills.length} skills</li>
        <li>{form.mcpServers.length} mcp servers</li>
        <li>{form.tools.length} tools</li>
        <li>{form.kbFolders.length} KB folders</li>
        <li>可见性 · {form.visibility}</li>
      </ul>
    </div>
  );
}

function DoneScreen({ form, onReset }: { form: WizardForm; onReset: () => void }) {
  const router = useRouter();
  return (
    <div className="grid place-items-center py-20">
      <div className="flex max-w-md flex-col items-center gap-5 rounded-3xl bg-card p-10 text-center ring-1 ring-border">
        <div className="inline-flex size-14 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/30">
          <CheckCircle2 className="size-7" />
        </div>
        <h2 className="text-2xl font-semibold tracking-tighter">
          {form.name || "新的 bot"} 上线了
        </h2>
        <p className="text-[13.5px] leading-relaxed text-foreground/65">
          我们已经把这位 bot 加进员工库,主理人:史德飞。
          她现在可以被同组可见的所有人调用。
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
          <button
            onClick={onReset}
            className="rounded-full bg-muted px-4 py-2 text-[13px] font-medium text-foreground hover:bg-muted/70"
          >
            再创建一个
          </button>
          <button
            onClick={() => router.push("/employees")}
            className="rounded-full bg-foreground px-5 py-2 text-[13px] font-medium text-background hover:opacity-90"
          >
            回员工库
          </button>
        </div>
      </div>
    </div>
  );
}
