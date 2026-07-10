"use client";

import * as React from "react";
import type { WizardForm, ProviderInfo, AutoCompressConfig } from "./form";
import { normalizeAutoCompressDraft } from "./form";
import { Cpu, Brain, Gauge, Info, Zap } from "lucide-react";

/**
 * Step 2 — 大脑模型
 * R51-B2: 三个必填项 — 回答风格(模型选择) · 记忆容量(上下文窗口) · 上下文自动压缩
 * 全部中文化,去掉中英夹杂
 */
export function Step2({
  form,
  setForm,
  providers,
}: {
  form: WizardForm;
  setForm: (v: WizardForm) => void;
  providers: ProviderInfo[];
}) {
  const set = <K extends keyof WizardForm>(k: K, v: WizardForm[K]) =>
    setForm({ ...form, [k]: v });

  const pickProvider = (id: string) => {
    const p = providers.find((x) => x.id === id);
    if (!p) return;
    setForm({
      ...form,
      providerId: p.id,
      providerName: p.name,
      providerModel: p.model,
      contextWindow: p.contextWindow ?? form.contextWindow,
    });
  };

  const setAuto = (patch: Partial<AutoCompressConfig>) => {
    const next = normalizeAutoCompressDraft({ ...form.autoCompress, ...patch });
    setForm({ ...form, autoCompress: next });
  };

  const ctxKb = Math.round(form.contextWindow / 1000);

  return (
    <div className="space-y-7">
      <div className="rounded-2xl bg-muted/40 p-4 text-[12px] leading-relaxed text-foreground/70 ring-1 ring-border">
        <div className="mb-2 flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.18em] text-foreground/45">
          <Info className="size-3" />
          这一步 3 项全部必填
        </div>
        <ul className="space-y-1 font-mono text-[11.5px]">
          <li><b className="text-foreground/85">回答风格</b> · 选一个底层模型 · 决定输出气质与推理深度</li>
          <li><b className="text-foreground/85">记忆容量</b> · 上下文窗口 · 单次对话能容纳的信息总量</li>
          <li><b className="text-foreground/85">上下文自动压缩</b> · 窗口快满时自动瘦身,防止爆栈</li>
        </ul>
      </div>

      {/* 必填 1: 回答风格 — 模型选择 */}
      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="flex items-center gap-1.5 text-[12.5px] font-semibold text-foreground/85">
            <Cpu className="size-3.5" />
            回答风格 · 底层模型
            <span className="ml-1 rounded bg-rose-500/10 px-1.5 py-0.5 font-mono text-[10px] tracking-[0.12em] text-rose-700 dark:text-rose-300">必填</span>
          </h3>
          <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-foreground/40">
            {providers.length} 个真实可用
          </span>
        </div>
        {providers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-4 text-center text-[12px] text-foreground/55">
            没有可用模型。请先在 模型设置 里添加。
          </div>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2">
            {providers.map((p) => {
              const on = form.providerId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => pickProvider(p.id)}
                  className={
                    "rounded-2xl bg-card p-3.5 text-left ring-1 transition-all " +
                    (on ? "ring-foreground shadow-md" : "ring-border hover:ring-foreground/40")
                  }
                  data-testid="provider-pick"
                  data-picked={on}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[14px] font-semibold tracking-tight">{p.name}</span>
                    {p.isDefault && (
                      <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[10px] tracking-[0.18em] text-emerald-700 dark:text-emerald-300">
                        默认
                      </span>
                    )}
                  </div>
                  <div className="mt-1 font-mono text-[11.5px] text-foreground/65">{p.model}</div>
                  <div className="mt-1 flex items-center gap-2 font-mono text-[10.5px] text-foreground/45">
                    <span>{p.type}</span>
                    {p.contextWindow ? (
                      <>
                        <span>·</span>
                        <span>{(p.contextWindow / 1000).toFixed(0)}k 上下文</span>
                      </>
                    ) : null}
                    {p.baseUrl && (
                      <>
                        <span>·</span>
                        <span className="truncate">{p.baseUrl}</span>
                      </>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
        <div className="mt-5 rounded-2xl bg-muted/20 p-4 ring-1 ring-border">
          <div className="flex items-baseline justify-between">
            <h3 className="flex items-center gap-1.5 text-[12.5px] font-semibold text-foreground/85">
              <Gauge className="size-3.5" />
              创作温度
            </h3>
            <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-foreground/55">
              {form.temperature.toFixed(2)} · 越低越严谨,越高越发散
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={form.temperature}
            onChange={(e) => set("temperature", Number(e.target.value))}
            className="mt-2 w-full accent-foreground"
            data-testid="temperature-slider"
          />
          <div className="mt-1 flex justify-between font-mono text-[10px] text-foreground/40">
            <span>严谨 0.00</span>
            <span>均衡 0.50</span>
            <span>发散 1.00</span>
          </div>
        </div>
      </section>

      {/* 必填 2: 记忆容量 · 上下文窗口 */}
      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="flex items-center gap-1.5 text-[12.5px] font-semibold text-foreground/85">
            <Brain className="size-3.5" />
            记忆容量 · 上下文窗口
            <span className="ml-1 rounded bg-rose-500/10 px-1.5 py-0.5 font-mono text-[10px] tracking-[0.12em] text-rose-700 dark:text-rose-300">必填</span>
          </h3>
          <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-foreground/55">
            当前 {ctxKb}k
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[8000, 32000, 128000, 200000, 1000000].map((w) => {
            const on = form.contextWindow === w;
            return (
              <button
                key={w}
                type="button"
                onClick={() => set("contextWindow", w)}
                className={
                  "rounded-full px-3 py-1.5 text-[12px] font-medium ring-1 transition-all " +
                  (on
                    ? "bg-foreground text-background ring-foreground"
                    : "bg-card text-foreground/65 ring-border hover:ring-foreground/30")
                }
                data-testid={`ctx-window-${w}`}
              >
                {(w / 1000).toFixed(0)}k
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-foreground/45">
          越大越贵、越慢,但能"看见"的历史越长。默认 200k,适配大多数场景。
        </p>
      </section>

      {/* 必填 3: 上下文自动压缩 */}
      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="flex items-center gap-1.5 text-[12.5px] font-semibold text-foreground/85">
            <Zap className="size-3.5" />
            上下文自动压缩
            <span className="ml-1 rounded bg-rose-500/10 px-1.5 py-0.5 font-mono text-[10px] tracking-[0.12em] text-rose-700 dark:text-rose-300">必填</span>
          </h3>
          <label className="flex cursor-pointer items-center gap-1.5 text-[12px]">
            <input
              type="checkbox"
              checked={form.autoCompress.enabled}
              onChange={(e) => setAuto({ enabled: e.target.checked })}
              className="size-4 accent-foreground"
              data-testid="autocompress-toggle"
            />
            <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-foreground/65">
              {form.autoCompress.enabled ? "已启用" : "已关闭"}
            </span>
          </label>
        </div>
        <p className="mb-3 text-[11.5px] text-foreground/55">
          上下文快满时,引擎自动瘦身 — 保留要点、丢弃冗余,避免对话直接爆栈。
        </p>
        <div className="grid gap-2 sm:grid-cols-4">
          <SliderRow
            label="提示阈值"
            desc="用到 N% 时开始提醒"
            value={form.autoCompress.warnThresholdPct}
            onChange={(v) => setAuto({ warnThresholdPct: v })}
            disabled={!form.autoCompress.enabled}
          />
          <SliderRow
            label="压缩阈值"
            desc="用到 N% 时自动压缩"
            value={form.autoCompress.thresholdPct}
            onChange={(v) => setAuto({ thresholdPct: v })}
            disabled={!form.autoCompress.enabled}
          />
          <SliderRow
            label="重置阈值"
            desc="用到 N% 时开新会话"
            value={form.autoCompress.resetThresholdPct}
            onChange={(v) => setAuto({ resetThresholdPct: v })}
            disabled={!form.autoCompress.enabled}
          />
          <SliderRow
            label="压缩后保留"
            desc="压缩后留原来的 N%"
            value={form.autoCompress.ratioPct}
            onChange={(v) => setAuto({ ratioPct: v })}
            disabled={!form.autoCompress.enabled}
          />
        </div>
      </section>
    </div>
  );
}

function SliderRow({
  label,
  desc,
  value,
  onChange,
  disabled,
}: {
  label: string;
  desc: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={
        "rounded-xl bg-card p-3 ring-1 ring-border transition-opacity " +
        (disabled ? "opacity-50" : "")
      }
    >
      <div className="flex items-baseline justify-between">
        <span className="text-[12px] font-medium text-foreground/85">{label}</span>
        <span className="font-mono text-[11px] text-foreground/55">{value}%</span>
      </div>
      <input
        type="range"
        min={10}
        max={99}
        step={1}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-foreground"
      />
      <p className="mt-1 text-[10.5px] text-foreground/45">{desc}</p>
    </div>
  );
}
