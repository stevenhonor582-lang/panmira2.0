"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, SkipForward, CheckCircle2, AlertCircle, Loader2, X } from "lucide-react";
import { EMPTY_FORM, PERSONA_PRESETS, formToAgentPayload, recruitSourceId, type WizardMode, type WizardForm, type ProviderInfo, type SkillInfo, type McpServerInfo, type KbFolderInfo, type KbInfo, type ChannelBotInfo } from "./form";
import { StepRail, STEPS } from "./stepper";
import { Step1 } from "./step-1";
import { StepHrPreview, type HrPreviewData } from "./step-hr-preview";
import { Step2 } from "./step-2";
import { Step3 } from "./step-3";
import { Step4 } from "./step-4";
import { Step5 } from "./step-5";
import { Step6 } from "./step-6";
import { Step7 } from "./step-7";
import { api } from "@/lib/api";
import { AvatarMark } from "../../_components/avatar-mark";
import { useAgent } from "../../_lib/data";

// Wizard-scoped data hook — one parallel fetch for everything step 2-6 needs.
interface WizardData {
  providers: ProviderInfo[];
  skills: SkillInfo[];
  mcpServers: McpServerInfo[];
  folders: KbFolderInfo[];
  knowledgeBases: KbInfo[];
  channels: ChannelBotInfo[];
}

function useWizardData(): { data: WizardData | null; loading: boolean; error: string | null } {
  const [data, setData] = React.useState<WizardData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [provRes, skillRes, mcpRes, folderRes, kbRes, botRes] = await Promise.all([
          api<{ providers: ProviderInfo[] } | ProviderInfo[]>("/api/providers").catch(() => null),
          api<{ skills: SkillInfo[] } | SkillInfo[]>("/api/skills").catch(() => null),
          api<{ servers: McpServerInfo[] } | McpServerInfo[]>("/api/mcp/servers").catch(() => null),
          api<{ folders: KbFolderInfo[] } | KbFolderInfo[]>("/api/knowledge/folders").catch(() => null),
          api<{ data: { knowledgeBases?: KbInfo[] }[] } | { knowledgeBases?: KbInfo[] } | KbInfo[]>("/api/v2/admin/knowledge-bases").catch(() => null),
          api<{ bots: ChannelBotInfo[] } | ChannelBotInfo[]>("/api/bots").catch(() => null),
        ]);
        if (!alive) return;
        const providers = (provRes as any)?.providers ?? (provRes as any) ?? [];
        // Filter out embedding providers — Step 2 only shows LLM choices.
        const llmProviders = (providers as ProviderInfo[]).filter(
          (p) => (p.type || "").toLowerCase() !== "embedding",
        );
        const skills = (skillRes as any)?.skills ?? (skillRes as any) ?? [];
        const mcpServers = (mcpRes as any)?.servers ?? (mcpRes as any) ?? [];
        const folders = (folderRes as any)?.folders ?? (folderRes as any) ?? [];
        const kbResAny = kbRes as any;
        const knowledgeBases: KbInfo[] =
          kbResAny?.knowledgeBases ??
          kbResAny?.data?.knowledgeBases ??
          kbResAny?.data ??
          (Array.isArray(kbResAny) ? kbResAny : []);
        const bots = (botRes as any)?.bots ?? (botRes as any) ?? [];
        setData({
          providers: llmProviders,
          skills: skills as SkillInfo[],
          mcpServers: mcpServers as McpServerInfo[],
          folders: folders as KbFolderInfo[],
          knowledgeBases: knowledgeBases as KbInfo[],
          channels: bots as ChannelBotInfo[],
        });
        setLoading(false);
      } catch (e: any) {
        if (!alive) return;
        setError(String(e?.message ?? e));
        setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  return { data, loading, error };
}

export function NewBotWizard() {
  const router = useRouter();
  const params = useSearchParams();
  const templateIdParam = params.get("template");
  // R51-C1: 入口 URL ?type=template | ?type=instance(默认 instance)
  const mode: WizardMode = params.get("type") === "template" ? "template" : "instance";
  const isTemplateMode = mode === "template";
  // R52-FRONTEND: 招聘必须先有 hrId (?hrId=<uuid>)。无 hrId 时强制回 HR 库(HR 模式除外)。
  const hrIdParam = params.get("hrId");

  // 强制跳回 HR 库(HR 模式不受影响)
  React.useEffect(() => {
    if (!isTemplateMode && !hrIdParam) {
      router.replace("/hr");
    }
  }, [isTemplateMode, hrIdParam, router]);

  const { data: wizardData, loading: dataLoading, error: dataError } = useWizardData();

  const [form, setForm] = React.useState<WizardForm>(() => {
    if (!templateIdParam) return EMPTY_FORM;
    // Local template lookup (kept light — heavy data now lives in steps 2-6)
    return { ...EMPTY_FORM, templateId: templateIdParam };
  });
  const [current, setCurrent] = React.useState(1);

  // R52-FRONTEND: 当 hrId 给定时,拉 HR 静态字段,锁定 persona/systemPrompt/ironLaws/role,
  //              并把 HR 名称/头像作为 instance 的初始值。
  const { agent: hrAgent } = useAgent(hrIdParam ?? "");
  React.useEffect(() => {
    if (!hrAgent) return;
    const raw = (hrAgent.raw ?? {}) as Record<string, unknown>;
    setForm((prev) => ({
      ...prev,
      // 静态字段 — 从 HR 锁定,招聘时不能改
      persona: hrAgent.persona || prev.persona,
      systemPrompt: hrAgent.systemPrompt || prev.systemPrompt,
      ironLaws: hrAgent.ironLaws ?? prev.ironLaws,
      templateCategory: typeof raw.category === "string" ? raw.category : prev.templateCategory,
      // 动态字段 — 用 HR 的基础值预填,招聘时可改
      name: prev.name || `${hrAgent.displayName || hrAgent.name}-员工`,
      glyph: hrAgent.glyph || prev.glyph,
      hue: hrAgent.hue || prev.hue,
      providerModel: hrAgent.defaultModel || prev.providerModel,
      // HR id 标"来自 hr 派生"
      templateId: hrAgent.id ? `hr:${hrAgent.id}` : prev.templateId,
    }));
  }, [hrAgent?.id]);

  // Auto-pick the default provider once wizard data arrives.
  React.useEffect(() => {
    if (!wizardData) return;
    if (form.providerId) return;
    const def = wizardData.providers.find((p) => p.isDefault) ?? wizardData.providers[0];
    if (def) {
      setForm((f) => ({
        ...f,
        providerId: def.id,
        providerName: def.name,
        providerModel: def.model,
      }));
    }
  }, [wizardData, form.providerId]);

  // Skip is allowed on lightweight steps (1, 6 partial).
  const skipAllowed = current === 1;
  const isLast = current === STEPS.length;

  const next = () => setCurrent((c) => Math.min(STEPS.length, c + 1));
  const prev = () => setCurrent((c) => Math.max(1, c - 1));
  const jump = (s: number) => setCurrent(s);

  const submit = async (): Promise<{ ok: boolean; error?: string; id?: string }> => {
    // R53-T5: 招聘态兜底 — hrId 存在但来源岗位未落定(岗位数据未加载/无效)不允许发布。
    if (hrIdParam && !recruitSourceId(form)) {
      return { ok: false, error: "岗位信息尚未加载完成,请稍候重试(招聘必须绑定岗位)。" };
    }
    const payload = formToAgentPayload(form, mode);
    // R27 规则 1: api() 不抛 4xx,需手动检查返回体里的 error 字段(name_taken / bot_already_bound)
    try {
      const res = await api<{ agent: { id: string }; error?: string; message?: string }>("/api/agents/", {
        method: "POST",
        body: payload,
        headers: { "content-type": "application/json" },
      });
      // 成功:有 agent.id
      if (res?.agent?.id) return { ok: true, id: res.agent.id };
      // 409 / 其它错误:后端返回 { error, message }
      const errMsg = res?.message || res?.error || "创建失败(未知原因)";
      return { ok: false, error: String(errMsg) };
    } catch (e: any) {
      const msg =
        e?.body?.error ||
        e?.body?.message ||
        e?.message ||
        (typeof e === "string" ? e : "网络错误,请重试");
      return { ok: false, error: String(msg) };
    }
  };

  if (dataLoading) {
    return (
      <div className="grid place-items-center py-32 text-sm text-foreground/50">
        <Loader2 className="size-4 animate-spin" />
        <span className="ml-2 font-mono">载入向导数据(providers / skills / mcp / folders / channels)…</span>
      </div>
    );
  }

  return (
    <div className="grid gap-7 lg:grid-cols-[260px_1fr]">
      <aside className="space-y-5">
        <Link
          href={isTemplateMode ? "/hr" : "/employees"}
          className="inline-flex items-center gap-1.5 text-[12px] font-mono uppercase tracking-[0.18em] text-foreground/45 hover:text-foreground"
        >
          <ArrowLeft className="size-3" /> {isTemplateMode ? "HR 库" : "员工库"}
        </Link>
        <div>
          <div className="text-[10.5px] font-mono uppercase tracking-[0.18em] text-foreground/40">
            {hrIdParam ? "招聘流程 · 从岗位开始" : "单页 7 步向导"}
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tighter">
            {hrIdParam ? "数字员工招聘" : isTemplateMode ? "创建新的 HR 岗位" : "创建新的数字员工"}
          </h1>
        </div>
        <StepRail
            current={current}
            onJump={jump}
            labelOverride={hrIdParam && current === 1 ? "选岗位" : undefined}
            hintOverride={hrIdParam && current === 1 ? "岗位锁定 · 只读" : undefined}
          />
        <PreviewCard form={form} />
      </aside>

      <section className="min-w-0 rounded-3xl bg-card p-7 ring-1 ring-border">
        {hrIdParam && (
          <div className="mb-5 flex items-center gap-3 rounded-2xl bg-foreground/[0.03] p-3.5 ring-1 ring-border" data-testid="recruit-position-hero">
            <AvatarMark glyph={hrAgent?.glyph || "岗"} hue={hrAgent?.hue || "amber"} size="sm" />
            <div className="min-w-0">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground/45">招聘岗位 · 已锁定</div>
              <div className="truncate text-[14px] font-semibold tracking-tight">
                {hrAgent ? (hrAgent.displayName || hrAgent.name) : "载入岗位…"}
              </div>
            </div>
          </div>
        )}
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div>
            <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-foreground/45">
              STEP 0{current} · {STEPS.length}
            </span>
            <h2 className="mt-1 text-xl font-semibold tracking-tight">
              {current === 1 && hrIdParam ? "选岗位 · 岗位锁定(只读)" : STEPS[current - 1].label}
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

        {dataError && (
          <div className="mt-4 flex items-start gap-2 rounded-2xl bg-rose-500/10 p-3 text-[12px] text-rose-700 dark:text-rose-300 ring-1 ring-rose-500/30">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
            <span className="font-mono">部分向导数据加载失败:{dataError}。已选字段会保留,刷新可重试。</span>
          </div>
        )}

        <div className="pt-6 transition-opacity duration-300" key={`step-${current}`}>
          {current === 1 && (
            hrIdParam ? (
              <StepHrPreview
                hr={hrAgent ? {
                  id: hrAgent.id,
                  displayName: hrAgent.displayName || hrAgent.name,
                  name: hrAgent.name,
                  persona: hrAgent.persona,
                  systemPrompt: hrAgent.systemPrompt,
                  ironLaws: hrAgent.ironLaws ?? [],
                  category: ((hrAgent.raw ?? {}) as Record<string, unknown>).category as string ?? "general",
                  templateType: ((hrAgent.raw ?? {}) as Record<string, unknown>).template_type as string ?? "custom",
                  role: hrAgent.role,
                  glyph: hrAgent.glyph,
                  hue: hrAgent.hue,
                  status: hrAgent.status,
                } : null}
              />
            ) : (
              <Step1 form={form} setForm={setForm} mode={mode} />
            )
          )}
          {current === 2 && wizardData && (
            <Step2 form={form} setForm={setForm} providers={wizardData.providers} />
          )}
          {current === 3 && (
            <>
              {hrIdParam && (
                <div className="mb-4 rounded-2xl bg-amber-500/[0.04] p-3 ring-1 ring-amber-500/30 text-[12px] text-foreground/70">
                  <strong>提示:</strong> 岗位的人设/系统提示词/铁律已在 Step 1 锁定,如要改请回 HR 库编辑该岗位。
                  此页可微调实例层的小幅度覆盖。
                </div>
              )}
              <Step3 form={form} setForm={setForm} presets={PERSONA_PRESETS} />
            </>
          )}
          {current === 4 && wizardData && (
            <Step4
              form={form}
              setForm={setForm}
              skills={wizardData.skills}
              mcpServers={wizardData.mcpServers}
            />
          )}
          {current === 5 && wizardData && (
            <Step5
              form={form}
              setForm={setForm}
              folders={wizardData.folders}
              knowledgeBases={wizardData.knowledgeBases}
            />
          )}
          {current === 6 && wizardData && (
            <Step6
              form={form}
              setForm={setForm}
              channels={wizardData.channels}
            />
          )}
          {current === 7 && (
            <Step7 form={form} mode={mode} onSubmit={submit} onPublished={(id) => router.push(isTemplateMode ? "/employees/templates" : `/employees/${id}`)} />
          )}
        </div>

        {!isLast && (
          <div className="mt-8 flex items-center justify-between gap-3 border-t border-border pt-5">
            {/* R25: 显式取消按钮 — 任何 step 都能直接回员工库,不丢已填字段提示 */}
            <button
              type="button"
              onClick={() => {
                if (typeof window !== "undefined") {
                  const hasInput = form.name.trim() || form.description.trim() || form.persona.trim();
                  if (hasInput) {
                    const ok = window.confirm("取消新建?已填字段不会保存。");
                    if (!ok) return;
                  }
                }
                router.push(isTemplateMode ? "/hr" : (hrIdParam ? "/hr" : "/employees"));
              }}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-[12.5px] font-medium text-foreground/55 hover:text-foreground hover:bg-muted/60"
              data-testid="wizard-cancel"
              aria-label="取消新建"
            >
              <X className="size-3.5" /> 取消
            </button>
            <div className="flex items-center gap-2">
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
          </div>
        )}
      </section>
    </div>
  );
}

// R17-3 实时预览 — 名片样式,改进"未命名员工"的 UX
// 用户反馈:"实时预览'未命名员工'无用",后理解这是实时名片
// 改进:明确告诉用户这是名片预览,空字段给可操作提示
function PreviewCard({ form }: { form: WizardForm }) {
  const personaLabel =
    PERSONA_PRESETS.find((p) => p.id === form.personaPreset)?.label ||
    (form.persona ? "自定义" : "未设定");
  const hasName = form.name.trim().length > 0;
  const emptyFields: string[] = [];
  if (!hasName) emptyFields.push("名字");
  if (!form.providerId) emptyFields.push("模型");
  if (!form.persona) emptyFields.push("人格");

  // 头像 glyph 优先用 form.glyph,其次用名字首字符
  const previewGlyph = form.glyph !== "新" ? form.glyph : (hasName ? form.name[0] : "新");

  return (
    <div className="overflow-hidden rounded-2xl bg-muted/40 p-5 ring-1 ring-border">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10.5px] font-mono uppercase tracking-[0.18em] text-foreground/45">
          实时名片 · 预览
        </span>
        {emptyFields.length > 0 && (
          <span className="font-mono text-[10px] text-foreground/40">
            待填 · {emptyFields.join("/")}
          </span>
        )}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <AvatarMark glyph={previewGlyph} hue={form.hue} size="md" />
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold tracking-tight">
            {hasName ? form.name : (
              <span className="text-foreground/45 italic">填写名称后显示</span>
            )}
          </div>
          <div className="truncate font-mono text-[11px] text-foreground/55">
            {form.providerName ? `${form.providerName} · ${form.providerModel}` : (
              <span className="italic text-foreground/40">未选模型(Step 2)</span>
            )}
            {" · "}
            {(form.contextWindow / 1000).toFixed(0)}k ctx
            {" · t="}{form.temperature.toFixed(2)}
          </div>
        </div>
      </div>
      <ul className="mt-4 space-y-1.5 text-[11.5px] font-mono text-foreground/55">
        <li>
          人格 ·{" "}
          {personaLabel === "未设定"
            ? <span className="italic text-foreground/40">未设定(Step 3)</span>
            : personaLabel}
        </li>
        <li>{form.skills.length} skills · {form.mcpServerIds.length} mcp · {form.tools.length} tools</li>
        <li>{form.kbFolderIds.length} folders · {form.knowledgeBaseIds.length} KB</li>
        <li>可见 · {form.visibility} · {form.channelIds.length} 频道</li>
        {form.workingDir && <li className="truncate">目录 · {form.workingDir}</li>}
      </ul>
      <p className="mt-3 border-t border-border pt-2 text-[10.5px] text-foreground/45">
        这就是你将来在员工库里看到的卡片样子。每改一步,这里实时同步。
      </p>
    </div>
  );
}
