"use client";
import * as React from "react";
import type { WizardForm, ProviderInfo } from "./form";
import { Dropdown } from "./dropdown";
import { Info } from "lucide-react";

// R34-B: 上下文窗口不再硬编码 — 从 provider_configs.context_window 真实值自动填充。
// 删除 PROVIDER_CONTEXT_HINTS,改由 selectedProvider.contextWindow 驱动。

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

  // R34-B: 自定义上下文窗口输入模式(脱离预设档位时自动进入)
  const presetValues = CONTEXT_LEVELS.map((l) => l.value);
  const isCustomContext = !presetValues.includes(form.contextWindow);
  const [customDraft, setCustomDraft] = React.useState<string>(
    isCustomContext ? String(form.contextWindow) : "",
  );

  // 选模型时,同时填好反范式字段 + 用 provider_configs 真实 context_window 自动填充。
  const pickProvider = (id: string) => {
    const p = providers.find((x) => x.id === id);
    if (!p) return;
    set("providerId", p.id);
    set("providerName", p.name);
    set("providerModel", p.model);
    // R34-B: 从 provider_configs.context_window 读取真实最大值,自动落到最接近的预设档位;
    // 若真实值不落在任何预设(如 1M),则切到"自定义"模式并保留真实值。
    const realMax = typeof p.contextWindow === "number" && p.contextWindow > 0 ? p.contextWindow : null;
    if (realMax !== null) {
      const nearest = [...CONTEXT_LEVELS].sort(
        (a, b) => Math.abs(a.value - realMax) - Math.abs(b.value - realMax),
      )[0];
      if (nearest.value === realMax) {
        set("contextWindow", realMax);
        setCustomDraft("");
      } else {
        set("contextWindow", realMax);
        setCustomDraft(String(realMax));
      }
    }
  };

  // 当前 temperature 所属档位
  const activeTempLevel =
    form.temperature <= 0.35
      ? TEMPERATURE_LEVELS[0]
      : form.temperature <= 0.75
        ? TEMPERATURE_LEVELS[1]
        : TEMPERATURE_LEVELS[2];

  // 当前 contextWindow 最接近的预设档位(自定义模式下不高亮任何预设)
  const activeContextLevel = [...CONTEXT_LEVELS].sort(
    (a, b) => Math.abs(a.value - form.contextWindow) - Math.abs(b.value - form.contextWindow),
  )[0];

  const selectedProvider = providers.find((p) => p.id === form.providerId);
  const trait = selectedProvider ? PROVIDER_TRAITS[selectedProvider.model] : undefined;
  const providerMaxCtx =
    selectedProvider && typeof selectedProvider.contextWindow === "number" && selectedProvider.contextWindow > 0
      ? selectedProvider.contextWindow
      : null;
  const exceedsProviderMax = providerMaxCtx !== null && form.contextWindow > providerMaxCtx;

  // R34-B: 自动压缩配置辅助
  const ac = form.autoCompress;
  const setAutoCompress = (patch: Partial<typeof ac>) =>
    set("autoCompress", { ...ac, ...patch });

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
        subtitle={
          providerMaxCtx
            ? `当前模型最大支持 ${providerMaxCtx.toLocaleString()} tokens(来自 provider_configs 自动读取)`
            : "数值越大记得越多,但 Token 消耗和费用也越高"
        }
      >
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {CONTEXT_LEVELS.map((lvl) => {
            const active = !isCustomContext && activeContextLevel.id === lvl.id;
            return (
              <button
                key={lvl.id}
                type="button"
                onClick={() => {
                  set("contextWindow", lvl.value);
                  setCustomDraft("");
                }}
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

        {/* R34-B: 自定义上下文窗口 */}
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-muted/40 p-3 ring-1 ring-border">
          <span className="text-[12px] font-medium text-foreground/75">自定义</span>
          <input
            type="number"
            min={1000}
            step={1000}
            inputMode="numeric"
            value={isCustomContext ? form.contextWindow : (customDraft === "" ? "" : Number(customDraft))}
            placeholder={providerMaxCtx ? `≤ ${providerMaxCtx.toLocaleString()}` : "输入 token 数"}
            onChange={(e) => {
              const raw = e.target.value;
              setCustomDraft(raw);
              const n = Math.max(0, Math.floor(Number(raw) || 0));
              if (n > 0) set("contextWindow", n);
            }}
            className="w-44 rounded-lg bg-background px-3 py-2 font-mono text-[12.5px] tabular-nums ring-1 ring-border focus:outline-none focus:ring-foreground/40"
            aria-label="自定义上下文窗口 tokens"
          />
          <span className="text-[11px] text-foreground/55">tokens</span>
          {exceedsProviderMax && (
            <span className="ml-1 text-[11px] text-amber-700 dark:text-amber-300">
              ⚠ 超过模型最大值 {providerMaxCtx!.toLocaleString()},实际会被截断
            </span>
          )}
        </div>

        <Explanation>
          <b className="text-foreground/85">
            当前:{form.contextWindow.toLocaleString()} tokens
            {!isCustomContext && ` · ${activeContextLevel.label}`}
            {isCustomContext && " · 自定义"}
          </b>
          <br />
          上下文窗口决定模型一次能"读进去"多少对话历史/文档。窗口越大记得越多,
          但 Token 消耗更高、费用更高。选中模型后会自动读取该模型的真实最大值并填充。
          系统会按你设定的窗口自动识别上下文长度并触发压缩。
        </Explanation>
      </Section>

      {/* R34-B: 上下文自动压缩 */}
      <Section
        title="上下文自动压缩"
        subtitle="对话用到一定长度时自动压缩历史,避免触发模型上限"
      >
        <label className="flex items-start gap-2.5 rounded-xl bg-muted/40 p-3 ring-1 ring-border cursor-pointer hover:bg-muted/60 transition-colors">
          <input
            type="checkbox"
            checked={ac.enabled}
            onChange={(e) => setAutoCompress({ enabled: e.target.checked })}
            className="mt-0.5 size-4 accent-foreground"
          />
          <div className="flex-1">
            <div className="text-[13px] font-medium text-foreground/90">启用自动压缩</div>
            <div className="text-[11.5px] leading-relaxed text-foreground/65 mt-0.5">
              开启后,对话累积到阈值时,系统自动把早期历史压缩成摘要,腾出空间继续对话。
            </div>
          </div>
        </label>
        {ac.enabled && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <NumberField
              label="压缩触发阈值"
              suffix="%"
              min={10}
              max={95}
              value={ac.thresholdPct}
              onChange={(n) => setAutoCompress({ thresholdPct: n })}
              hint={`上下文用到 ${ac.thresholdPct}% 时触发压缩`}
            />
            <NumberField
              label="压缩比例"
              suffix="%"
              min={10}
              max={90}
              value={ac.ratioPct}
              onChange={(n) => setAutoCompress({ ratioPct: n })}
              hint={`压缩到原来的 ${ac.ratioPct}%(保留近期,摘要早期)`}
            />
          </div>
        )}
        <Explanation>
          压缩配置跟随智能体保存到 <code className="font-mono">orchestration.autoCompress</code>,
          运行时由引擎读取执行。默认阈值 80%、压缩到 50%,适合大多数长对话场景。
        </Explanation>
      </Section>
    </div>
  );
}

// R34-B: 压缩配置用的数字输入(百分比)
function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  suffix,
  hint,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  suffix?: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl bg-card p-3 ring-1 ring-border">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[12px] font-medium text-foreground/80">{label}</span>
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={min}
            max={max}
            value={value}
            onChange={(e) => {
              const n = Math.min(max, Math.max(min, Math.floor(Number(e.target.value) || 0)));
              onChange(n);
            }}
            className="w-20 rounded-md bg-background px-2 py-1 text-right font-mono text-[13px] tabular-nums ring-1 ring-border focus:outline-none focus:ring-foreground/40"
          />
          {suffix && <span className="text-[12px] text-foreground/55">{suffix}</span>}
        </div>
      </div>
      {hint && <p className="text-[11px] leading-relaxed text-foreground/55">{hint}</p>}
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
