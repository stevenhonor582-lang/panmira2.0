"use client";
import * as React from "react";
import type { WizardForm, ProviderInfo } from "./form";
import { Dropdown } from "./dropdown";
import { Info } from "lucide-react";

// 已知模型的上下文窗口提示 — 后端 provider_configs 不暴露此字段,这里用已知事实。
const PROVIDER_CONTEXT_HINTS: Record<string, number> = {
  "MiniMax-M3": 200000,
  "GLM-5.2": 200000,
  "deepseek-v4-pro": 128000,
};

// 已知模型的特点说明(用于"大脑模型"区块显示)。
// 用户反馈:模型名是黑话,需要标注"它擅长什么、适合什么场景"。
const PROVIDER_TRAITS: Record<string, { strength: string; good: string }> = {
  "GLM-5.2": {
    strength: "中文表达强 · 性价比高 · 推理稳定",
    good: "客服对话、中文写作、日常协作、多轮问答",
  },
  "deepseek-v4-pro": {
    strength: "逻辑推理强 · 代码能力好 · 长文档顺畅",
    good: "代码开发、数据分析、逻辑推理、合同/长文审阅",
  },
  "MiniMax-M3": {
    strength: "多模态 · 可识别图片 · 长上下文",
    good: "图片识别、图文混合任务、超长文档分析",
  },
};

// 回答风格(temperature)三档预设 — 用卡片替代裸 slider。
// 用户反馈:"创造性 · temperature · 越确定 ↔ 越随机" 这种标签是黑话。
// 改成:中文名 + 作用 + 适合场景,点选即设定代表值。
const TEMPERATURE_LEVELS = [
  {
    id: "strict",
    label: "严谨稳定",
    range: "0.0 – 0.3",
    value: 0.2,
    desc: "每次回答几乎一致,可靠可复现",
    good: "代码、数据、客服、合规问答",
  },
  {
    id: "balanced",
    label: "灵活平衡",
    range: "0.4 – 0.7",
    value: 0.5,
    desc: "兼顾准确与多样,偶有新意",
    good: "通用对话、邮件、协作、大多数场景",
  },
  {
    id: "creative",
    label: "创意发散",
    range: "0.7 – 1.0",
    value: 0.85,
    desc: "每次回答都不一样,富有创造力",
    good: "写作、文案、头脑风暴、命名/起稿",
  },
];

// 记忆容量(contextWindow)四档预设 — 用卡片替代裸 slider。
// 用户反馈:光给个 token 数字没人看得懂"这够不够用"。
// 改成:中文名 + 作用 + 适合场景,每档对应一个代表值。
const CONTEXT_LEVELS = [
  {
    id: "light",
    label: "轻量客服",
    value: 32000,
    desc: "短对话够用,成本最低",
    good: "客服问答、简单任务、FAQ",
  },
  {
    id: "balanced",
    label: "通用平衡",
    value: 64000,
    desc: "兼顾上下文记忆与成本",
    good: "代码开发、日常协作、中等文档",
  },
  {
    id: "longdoc",
    label: "长文分析",
    value: 128000,
    desc: "能完整读入长文档",
    good: "长文档分析、合同审阅、论文阅读",
  },
  {
    id: "full",
    label: "全量记忆",
    value: 200000,
    desc: "最大记忆容量,深度任务必备",
    good: "深度研究、超长对话、跨多文档综述",
  },
];

export function Step2({
  form,
  setForm,
  providers,
}: {
  form: WizardForm;
  setForm: (v: WizardForm) => void;
  providers: ProviderInfo[];
}) {
  const set = <K extends keyof WizardForm>(k: K, v: WizardForm[K]) => setForm({ ...form, [k]: v });

  // 选模型时,同时填好反范式字段 + 根据模型推荐 contextWindow。
  const pickProvider = (id: string) => {
    const p = providers.find((x) => x.id === id);
    if (!p) return;
    set("providerId", p.id);
    set("providerName", p.name);
    set("providerModel", p.model);
    const hint = PROVIDER_CONTEXT_HINTS[p.model];
    if (hint && form.contextWindow === 200000) {
      set("contextWindow", hint);
    }
  };

  // 当前 temperature 所属档位
  const activeTempLevel =
    form.temperature <= 0.35
      ? TEMPERATURE_LEVELS[0]
      : form.temperature <= 0.75
        ? TEMPERATURE_LEVELS[1]
        : TEMPERATURE_LEVELS[2];

  // 当前 contextWindow 最接近的档位
  const activeContextLevel = [...CONTEXT_LEVELS].sort(
    (a, b) => Math.abs(a.value - form.contextWindow) - Math.abs(b.value - form.contextWindow),
  )[0];

  const selectedProvider = providers.find((p) => p.id === form.providerId);
  const trait = selectedProvider ? PROVIDER_TRAITS[selectedProvider.model] : undefined;

  return (
    <div className="space-y-6">
      {/* 大脑模型 */}
      <Section
        title="大脑模型 · 选哪个 AI 驱动这个员工"
        subtitle="来自 /api/providers(真实 provider_configs)"
      >
        {providers.length === 0 ? (
          <div className="rounded-xl bg-rose-500/10 p-3 text-[12px] text-rose-700 dark:text-rose-300">
            当前工作区还没有任何 LLM 服务商。请先去 /channels/llm 配置至少一个。
          </div>
        ) : (
          <>
            <Dropdown
              value={form.providerId}
              onChange={pickProvider}
              options={providers.map((p) => ({
                value: p.id,
                label: `${p.name} · ${p.model}${p.isDefault ? " · 默认" : ""}${p.hasApiKey === false ? " · 缺 API key" : ""}`,
                hint: p.baseUrl ? `baseUrl: ${p.baseUrl}` : undefined,
              }))}
              placeholder="选一个大脑模型"
            />

            {/* 已选模型的特点说明卡 — 把"GLM-5.2"这种黑话翻译成"它擅长什么" */}
            {selectedProvider && (
              <div className="mt-3 rounded-xl bg-muted/40 p-3 ring-1 ring-border">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-[13px] font-semibold tracking-tight">
                    {selectedProvider.model}
                  </span>
                  {trait ? (
                    <span className="text-[11.5px] text-foreground/70">{trait.strength}</span>
                  ) : null}
                </div>
                {trait ? (
                  <p className="mt-1 text-[11.5px] leading-relaxed text-foreground/60">
                    适合:{trait.good}
                  </p>
                ) : (
                  <p className="mt-1 text-[11.5px] leading-relaxed text-foreground/60">
                    该模型暂无内置说明,可按需选用。
                  </p>
                )}
              </div>
            )}

            <p className="mt-2 font-mono text-[11px] text-foreground/45">
              已选 {providers.length} 个服务商中的 {form.providerId ? 1 : 0} 个
              {form.providerId &&
                providers.find((p) => p.id === form.providerId)?.hasApiKey === false && (
                  <span className="ml-1 text-rose-600 dark:text-rose-400">
                    · ⚠️ 这个服务商缺 API key,创建后调用会失败
                  </span>
                )}
            </p>
          </>
        )}
      </Section>

      {/* 回答风格 temperature */}
      <Section
        title="回答风格 · 创造性(temperature)"
        subtitle="低 = 每次回答都一样,高 = 每次都不一样"
      >
        <div className="grid gap-2.5 sm:grid-cols-3">
          {TEMPERATURE_LEVELS.map((lvl) => {
            const active = activeTempLevel.id === lvl.id;
            return (
              <button
                key={lvl.id}
                type="button"
                onClick={() => set("temperature", lvl.value)}
                className={
                  "rounded-2xl bg-card p-4 text-left ring-1 transition-all " +
                  (active ? "ring-foreground shadow-md" : "ring-border hover:ring-foreground/40")
                }
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[14px] font-semibold tracking-tight">{lvl.label}</span>
                  <span className="font-mono text-[11px] tabular-nums text-foreground/55">
                    {lvl.range}
                  </span>
                </div>
                <p className="mt-1.5 text-[11.5px] leading-relaxed text-foreground/70">
                  {lvl.desc}
                </p>
                <p className="mt-2 text-[10.5px] text-foreground/55">适合:{lvl.good}</p>
              </button>
            );
          })}
        </div>
        <Explanation>
          <b className="text-foreground/85">
            当前:{form.temperature.toFixed(2)} · {activeTempLevel.label}
          </b>
          <br />
          temperature 是模型选词时的"随机度"。低值适合"要稳"的场景(代码/数据/客服),
          高值适合"要新"的场景(写作/头脑风暴)。点选档位即设定代表值,需要更精细可在创建后微调。
        </Explanation>
      </Section>

      {/* 记忆容量 contextWindow */}
      <Section
        title="记忆容量 · 上下文窗口(tokens)"
        subtitle="数值越大记得越多,但 Token 消耗和费用也越高"
      >
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {CONTEXT_LEVELS.map((lvl) => {
            const active = activeContextLevel.id === lvl.id;
            return (
              <button
                key={lvl.id}
                type="button"
                onClick={() => set("contextWindow", lvl.value)}
                className={
                  "rounded-2xl bg-card p-4 text-left ring-1 transition-all " +
                  (active ? "ring-foreground shadow-md" : "ring-border hover:ring-foreground/40")
                }
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[14px] font-semibold tracking-tight">{lvl.label}</span>
                  <span className="font-mono text-[11.5px] tabular-nums text-foreground/55">
                    {(lvl.value / 1000).toFixed(0)}K
                  </span>
                </div>
                <p className="mt-1.5 text-[11.5px] leading-relaxed text-foreground/70">
                  {lvl.desc}
                </p>
                <p className="mt-2 text-[10.5px] text-foreground/55">适合:{lvl.good}</p>
              </button>
            );
          })}
        </div>
        <Explanation>
          <b className="text-foreground/85">
            当前:{form.contextWindow.toLocaleString()} tokens · {activeContextLevel.label}
          </b>
          <br />
          上下文窗口决定模型一次能"读进去"多少对话历史/文档。窗口越大记得越多,
          但 Token 消耗更高、费用更高。系统会按你设定的窗口自动识别上下文长度并触发压缩。
        </Explanation>
      </Section>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2">
        <h3 className="text-[12px] font-medium tracking-tight text-foreground/65">{title}</h3>
        {subtitle && <p className="mt-0.5 text-[11px] text-foreground/45">{subtitle}</p>}
      </div>
      <div className="rounded-2xl bg-card p-5 ring-1 ring-border">{children}</div>
    </section>
  );
}

function Explanation({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 flex items-start gap-2 rounded-xl bg-muted/40 p-3 text-[11.5px] leading-relaxed text-foreground/70 ring-1 ring-border">
      <Info className="mt-0.5 size-3.5 shrink-0 text-foreground/45" />
      <span>{children}</span>
    </div>
  );
}
