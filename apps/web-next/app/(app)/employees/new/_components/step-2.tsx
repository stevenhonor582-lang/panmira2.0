"use client";
import * as React from "react";
import type { WizardForm, ProviderInfo } from "./form";
import { Dropdown } from "./dropdown";
import { Info } from "lucide-react";

// Hand-curated context-window hints per provider type — the backend's
// provider_configs table doesn't expose this, so we use known model facts.
const PROVIDER_CONTEXT_HINTS: Record<string, number> = {
  "MiniMax-M3": 200000,
  "GLM-5.2": 200000,
  "deepseek-v4-pro": 128000,
};

const TEMPERATURE_PRESETS = [
  { v: 0.0, label: "0.0 · 严格",     hint: "代码/数据/客服" },
  { v: 0.3, label: "0.3 · 偏确定",   hint: "分析/总结/分类" },
  { v: 0.5, label: "0.5 · 平衡",     hint: "通用对话" },
  { v: 0.7, label: "0.7 · 偏创意",   hint: "邮件/写作" },
  { v: 1.0, label: "1.0 · 多样",     hint: "头脑风暴/诗歌" },
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

  // When user picks a provider, also fill the denormalized model + name fields
  // and propose a context window based on the model.
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

  const tempLevel = form.temperature <= 0.3 ? "low" : form.temperature <= 0.7 ? "mid" : "high";
  const tempLevelLabel =
    tempLevel === "low"   ? "低 (0-0.3) · 稳定一致 · 适合代码/数据/客服" :
    tempLevel === "mid"   ? "中 (0.4-0.7) · 平衡 · 适合大多数场景" :
                            "高 (0.7-1.0) · 多样创意 · 适合写作/头脑风暴";

  return (
    <div className="space-y-6">
      <Section title="LLM 服务商 · 来自 /api/providers (真实 provider_configs)">
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
              placeholder="选一个 LLM 服务商"
            />
            <p className="mt-2 font-mono text-[11px] text-foreground/45">
              已选 {providers.length} 个服务商中的 {form.providerId ? 1 : 0} 个
              {form.providerId && providers.find((p) => p.id === form.providerId)?.hasApiKey === false && (
                <span className="ml-1 text-rose-600 dark:text-rose-400">· ⚠️ 这个服务商缺 API key,创建后调用会失败</span>
              )}
            </p>
          </>
        )}
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="上下文窗口 · tokens · 可调">
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-[28px] font-semibold tabular-nums tracking-tight">
              {form.contextWindow.toLocaleString()}
            </span>
            <span className="font-mono text-[12px] text-foreground/45">tokens</span>
          </div>
          <input
            type="range"
            min={8000}
            max={1000000}
            step={8000}
            value={form.contextWindow}
            onChange={(e) => set("contextWindow", Number(e.target.value))}
            className="mt-3 w-full accent-foreground"
          />
          <div className="mt-1 flex justify-between text-[10.5px] font-mono text-foreground/40">
            <span>8k</span>
            <span>1M</span>
          </div>
          <Explanation>
            越大的窗口,模型一次能"读进去"的对话历史/文档越多,但成本越高。
            建议保留默认值 — 系统会按你设定的窗口自动识别上下文长度并触发压缩。
          </Explanation>
        </Section>

        <Section title="创造性 · temperature · 越确定 ↔ 越随机">
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-[28px] font-semibold tabular-nums tracking-tight">
              {form.temperature.toFixed(2)}
            </span>
            <span className="font-mono text-[11px] text-foreground/55">{tempLevelLabel}</span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={form.temperature}
            onChange={(e) => set("temperature", Number(e.target.value))}
            className="mt-3 w-full accent-foreground"
          />
          <div className="mt-1 flex justify-between text-[10.5px] font-mono text-foreground/40">
            <span>0.0 · 确定严谨</span>
            <span>1.0 · 多样创意</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {TEMPERATURE_PRESETS.map((t) => (
              <button
                key={t.v}
                type="button"
                onClick={() => set("temperature", t.v)}
                title={t.hint}
                className={
                  "rounded-full px-2.5 py-1 text-[11.5px] font-mono ring-1 transition-all " +
                  (Math.abs(form.temperature - t.v) < 0.005
                    ? "bg-foreground text-background ring-foreground"
                    : "bg-background ring-border hover:ring-foreground/30")
                }
              >
                {t.label}
              </button>
            ))}
          </div>
          <Explanation>
            temperature = 模型选词时的"随机度"。
            低值(0-0.3)每次回答几乎一样,适合代码/数据/客服这种"要稳"的场景;
            高值(0.7-1.0)每次回答都不一样,适合写作/头脑风暴这种"要新"的场景。
          </Explanation>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-[12px] font-medium tracking-tight text-foreground/65">{title}</h3>
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
